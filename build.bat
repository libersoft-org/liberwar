@echo off

if exist build rmdir /s /q build
bun i
bun --bun run build
