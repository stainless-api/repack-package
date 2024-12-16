# repack-package

Optimize NPM package tarballs by reordering their files and compressing them with [Zopfli](https://github.com/google/zopfli)

## Usage

```bash
repack input.tgz output.tgz
```

## Features

- Optimized ordering for dual CJS/ESM packages (up to 25% size savings)
- Keeps original if no size reduction
- Shows progress with timing
- Skips unnecessary files (`.git`, `.DS_Store`, etc.)
