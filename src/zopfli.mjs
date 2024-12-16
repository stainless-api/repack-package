// @ts-check
// cSpell:words zopfli DYNAMICTOP HEAPU8 emscripten
/// <reference lib="dom" />

/* minimal version of https://github.com/gfx/universal-zopfli-js */

import { gunzipSync } from "node:zlib";

var WASM_PAGE_SIZE = 65536;
var DYNAMIC_BASE = 5253664;
var DYNAMICTOP_PTR = 10624;
var INITIAL_INITIAL_MEMORY = 16777216;

/**
 * @param {number} x
 * @param {number} multiple
 */
function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}
/**
 * @param {ArrayBuffer} buf
 */
function updateGlobalBufferAndViews(buf) {
  buffer = buf;
  HEAP32 = new Int32Array(buf);
  HEAPU8 = new Uint8Array(buf);
}
/**
 * @this {string}
 */
function abort() {
  throw new Error("abort(" + this + ")");
}
/**
 * @param {number} status
 * @param {number} implicit
 */
function exit(status, implicit) {
  if (implicit && status === 0) {
    return;
  }
  abort.call("exit " + status);
}
/**
 * @param {number} dest
 * @param {number} src
 * @param {number} num
 */
function _emscripten_memcpy_big(dest, src, num) {
  HEAPU8.copyWithin(dest, src, src + num);
}
/**
 * @param {number} size
 */
function emscripten_realloc_buffer(size) {
  try {
    wasmMemory.grow((size - buffer.byteLength + 65535) >>> 16);
    updateGlobalBufferAndViews(wasmMemory.buffer);
    return 1;
  } catch (e) {}
  return 0;
}
/**
 * @param {number} requestedSize
 */
function _emscripten_resize_heap(requestedSize) {
  var oldSize = HEAPU8.length;
  var PAGE_MULTIPLE = 65536;
  var maxHeapSize = 2147483648;
  if (requestedSize > maxHeapSize) {
    return false;
  }
  var minHeapSize = 16777216;
  for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
    var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
    overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
    var newSize = Math.min(
      maxHeapSize,
      alignUp(
        Math.max(minHeapSize, requestedSize, overGrownHeapSize),
        PAGE_MULTIPLE,
      ),
    );
    var replacement = emscripten_realloc_buffer(newSize);
    if (replacement) {
      return true;
    }
  }
  return false;
}

var wasmMemory = new WebAssembly.Memory({
  initial: INITIAL_INITIAL_MEMORY / WASM_PAGE_SIZE,
  maximum: 2147483648 / WASM_PAGE_SIZE,
});
var wasmTable = new WebAssembly.Table({
  initial: 8,
  maximum: 8 + 0,
  element: "anyfunc",
});

var buffer = wasmMemory.buffer,
  HEAPU8 = new Uint8Array(buffer),
  HEAP32 = new Int32Array(buffer);
INITIAL_INITIAL_MEMORY = buffer.byteLength;
HEAP32[DYNAMICTOP_PTR >> 2] = DYNAMIC_BASE;

var {
  g: ___wasm_call_ctors,
  h: _malloc,
  i: _deallocate,
  j: _createZopfliJsOutput,
  k: _getBuffer,
  l: _getBufferSize,
  m: _compress,
} = /** @type {{
    g: Function,
    h: Function,
    i: Function,
    j: Function,
    k: Function,
    l: Function,
    m: Function
  }} */ (
  new WebAssembly.Instance(
    new WebAssembly.Module(
      gunzipSync(
        Buffer.from(
          "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",
          "base64",
        ),
      ),
    ),
    {
      a: {
        d: _emscripten_memcpy_big,
        e: _emscripten_resize_heap,
        a: exit,
        f: abort.bind("_fd_close not implemented"),
        c: abort.bind("_fd_seek not implemented"),
        b: abort.bind("_fd_write not implemented"),
        memory: wasmMemory,
        table: wasmTable,
      },
    },
  ).exports
);

___wasm_call_ctors();

/**
 * @param {Uint8Array} input
 */
export default function zopfliGzipSync(input) {
  var opts = {
    verbose: false,
    verbose_more: false,
    numIterations: 15,
    blockSplitting: true,
    blockSplittingMax: 15,
  };
  const inputLen = input.byteLength;
  var bufferPtr = _malloc(inputLen);
  HEAPU8.set(input, bufferPtr);
  var output = _createZopfliJsOutput();
  _compress(
    bufferPtr,
    inputLen,
    output,
    /* gzip */ 0,
    opts.verbose,
    opts.verbose_more,
    opts.numIterations,
    opts.blockSplitting,
    opts.blockSplittingMax,
  );
  var outputPtr = _getBuffer(output);
  var outputSize = _getBufferSize(output);
  var result = HEAPU8.slice(outputPtr, outputPtr + outputSize);
  _deallocate(outputPtr);
  _deallocate(output);
  _deallocate(bufferPtr);
  // zopfli does not fail unless a violation of preconditions occurs.
  return result;
}