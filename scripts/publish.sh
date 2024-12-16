#!/bin/sh
set -e
DIR="$(mktemp -d)"
cleanup() {
    rm -rf "$DIR"
}
trap cleanup EXIT
mv "$(COREPACK_ENABLE_STRICT=0 npm pack --foreground-scripts=false)" "$DIR/package.tgz"
bin/repack.mjs "$DIR/package.tgz" "$DIR/package.packed.tgz"
pnpm publish "$DIR/package.tgz"
