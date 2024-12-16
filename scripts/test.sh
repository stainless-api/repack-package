#!/bin/sh
set -e
DIR="$(mktemp -d)"
cleanup() {
    rm -rf "$DIR"
}
trap cleanup EXIT
mv "$(COREPACK_ENABLE_STRICT=0 npm pack --foreground-scripts=false)" "$DIR/package.tgz"
cd "$DIR"

echo {} >package.json
pnpm i ./package.tgz
ls -l node_modules/.bin

echo {} >package.json
yarn add ./package.tgz
ls -l node_modules/.bin

echo {} >package.json
npm i ./package.tgz
ls -l node_modules/.bin
