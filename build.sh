#!/bin/sh

[ -d "./build/" ] && rm -r build
bun i
bun --bun run build
