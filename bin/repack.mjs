#!/usr/bin/env node
// @ts-check
// cSpell:words zopfli yoctocolors yocto
import {
  Worker,
  isMainThread,
  parentPort as parentPort_,
  workerData,
} from "node:worker_threads";
import {
  statSync,
  createReadStream,
  createWriteStream,
  writeFileSync,
  readFileSync,
} from "fs";
import { extname, basename } from "node:path";
import { gunzipSync } from "node:zlib";
import { pipeline } from "node:stream/promises";
import prettyMs from "pretty-ms";
import { dim, green, red } from "yoctocolors";
import prettyBytes from "pretty-bytes";
import Spinner from "yocto-spinner";
import gzipSync from "../src/zopfli.mjs";

if (!isMainThread && parentPort_) {
  const { inputFile, toFile } = workerData;
  const parentPort = parentPort_;

  const HEADER_SIZE = 512;
  const SKIP =
    /(?:^|\/)(?:\.npmignore|\.gitignore|\.git|\.svn|\.hg|build\/config\.gypi|npm-debug\.log|\.npmrc|\.[^\/]+\.swp|\.DS_Store|\._[^\/]+|[^\/]+\.orig)(?:\/|$)/i;

  /**
   * @param {Buffer} bytes
   */
  function parseOctal(bytes) {
    return parseInt(bytes.toString().trim(), 8);
  }

  /**
   * @param {Buffer} buffer
   */
  function readHeader(buffer) {
    const name = buffer.subarray(0, 100).toString().replace(/\0/g, "").trim();
    const size = parseOctal(buffer.subarray(124, 136));
    const typeFlag = buffer.subarray(156, 157).toString();
    return { name, size, typeFlag };
  }

  /**
   * @param {ReturnType<typeof readHeader>} header
   */
  function isBasicEntry(header) {
    return (
      header.typeFlag === "" ||
      header.typeFlag === "0" ||
      header.typeFlag === "5"
    );
  }

  /**
   * @param {Buffer} buffer The complete TAR buffer to analyze
   */
  function* analyzeTarBuffer(buffer) {
    let position = 0;
    while (position < buffer.length) {
      const headerBuffer = buffer.subarray(position, position + HEADER_SIZE);

      if (
        headerBuffer.length < HEADER_SIZE ||
        headerBuffer.every((byte) => byte === 0)
      ) {
        break;
      }

      const header = readHeader(headerBuffer);
      const contentBlocks = Math.ceil(header.size / HEADER_SIZE);
      const end = position - 1 + HEADER_SIZE + contentBlocks * HEADER_SIZE;

      if (end >= buffer.length) {
        break;
      }

      if (isBasicEntry(header) && !SKIP.test(header.name)) {
        const keyName = basename(header.name) + "\0" + header.name;
        yield {
          path: header.name,
          keyName,
          keyExt: extname(header.name) + "\0" + keyName,
          start: position,
          end,
          contentOffset: position + HEADER_SIZE,
          size: 1 + end - position,
          isDirectory: header.typeFlag === "5",
        };
      }
      position = end + 1;
    }
  }

  async function workerProcess() {
    try {
      const beforeSize = statSync(inputFile).size;
      parentPort.postMessage({ type: "decompressing" });
      const input = gunzipSync(readFileSync(inputFile));
      const dirs = [];
      const byType = [];
      const byName = [];
      let size = 0;
      parentPort.postMessage({ type: "reading" });
      for (const entry of analyzeTarBuffer(input)) {
        size += entry.size;
        if (entry.isDirectory) {
          dirs.push(entry);
        } else if (/\.m?[jt]s$/.test(entry.path)) {
          byName.push(entry);
        } else {
          byType.push(entry);
        }
      }

      parentPort.postMessage({ type: "sorting" });
      dirs.sort((a, b) => a.path.localeCompare(b.path));
      byName.sort((a, b) => a.keyName.localeCompare(b.keyName));
      byType.sort((a, b) => a.keyExt.localeCompare(b.keyExt));

      const uncompressedPackSort = Buffer.alloc(
        size + 512 /* pnpm needs an extra padding block */,
      );
      let pos = 0;
      for (const entry of [...dirs, ...byName, ...byType]) {
        uncompressedPackSort.set(
          input.subarray(entry.start, entry.end + 1),
          pos,
        );
        pos += entry.size;
      }
      parentPort.postMessage({ type: "compressing" });
      const compressed = gzipSync(uncompressedPackSort);

      parentPort.postMessage({
        type: "writing",
      });

      if (beforeSize > compressed.length) {
        writeFileSync(toFile, compressed);
      } else {
        await pipeline(createReadStream(inputFile), createWriteStream(toFile));
      }

      parentPort.postMessage({
        type: "complete",
        before: beforeSize,
        after: compressed.length,
      });
    } catch (error) {
      parentPort.postMessage({
        type: "error",
        error: String(error),
      });
    }
  }

  workerProcess().catch((error) => {
    parentPort.postMessage({
      type: "error",
      error: String(error),
    });
  });
}
// Main thread code
else {
  async function main() {
    const spinner = Spinner();
    let started = 0;

    const taskStart = (/** @type {string} */ name) => {
      started = performance.now();
      spinner.start(name);
    };

    const taskEnd = () => {
      spinner.success(
        spinner.text + " " + dim(prettyMs(performance.now() - started)),
      );
    };

    try {
      let inputFile = process.argv[2];
      let toFile = process.argv[3];

      if (!inputFile || !toFile) {
        throw `usage: repack input.tgz repacked.tgz`;
      }

      const worker = new Worker(new URL(import.meta.url), {
        workerData: { inputFile, toFile },
      });

      try {
        await new Promise((resolve, reject) => {
          worker.on("message", async (message) => {
            switch (message.type) {
              case "decompressing":
                taskStart("decompressing tgz file");
                break;
              case "reading":
                taskEnd();
                taskStart("reading tar file");
                break;
              case "sorting":
                taskEnd();
                taskStart("repacking tar file");
                break;
              case "compressing":
                taskEnd();
                taskStart("compressing tar file");
                break;
              case "writing":
                taskEnd();
                taskStart("writing tgz file");
                break;
              case "complete":
                taskEnd();
                if (message.before >= message.after) {
                  const saved =
                    ((message.before - message.after) / message.before) * 100;
                  process.stderr.write(
                    `saved ${green(`${saved.toFixed(2)}%`)} ${dim("(")}${prettyBytes(message.before)} ${dim(
                      "to",
                    )} ${prettyBytes(message.after)}${dim(")")}\n`,
                  );
                } else {
                  const lost =
                    ((message.before - message.after) / message.before) * -100;
                  process.stderr.write(
                    `packed version was ${red(
                      `${lost.toFixed(2)}%`,
                    )} larger, keeping original ${dim("(")}${prettyBytes(
                      message.before,
                    )} ${dim("to")} ${prettyBytes(message.after)}${dim(")")}\n`,
                  );
                }
                resolve(undefined);
                break;
              case "error":
                reject(message.error);
                break;
            }
          });

          worker.on("error", (error) => {
            reject(error);
          });
        });
      } finally {
        try {
          worker.terminate();
        } catch {}
      }
    } catch (error) {
      if (spinner) spinner.error();
      console.error(String(error));
      process.exitCode = 1;
    }
  }

  main().catch(console.error);
}
