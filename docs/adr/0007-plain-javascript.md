# 0007. Plain JavaScript extension, no build step

Status: Accepted
Date: 2026-10-18

## Context

The extension is small, maintained by one person, and should be easy to read and change without a toolchain.

## Decision

- The extension is plain CommonJS JavaScript in `src/`, type-checked with `// @ts-check` and JSDoc against `@types/vscode` (`npm run check`); there is no compile step.
- Logic that does not need VS Code (parsing markers, wrapping text, colours, counts) lives in `src/markers.js` and is unit-tested with Node's built-in test runner (`npm test`).
- `src/extension.js` only adapts that logic to VS Code: paste provider, commands, decorations, colour provider, status bar.
- The minimum VS Code version is 1.100, for the finalized paste-edit API.
- Releases are `.vsix` files built with `vsce`; versions stay at 0.1.x until the owner decides features justify 0.2.

## Consequences

- F5 in VS Code runs the extension straight from source.
- No integration tests run inside a real VS Code yet; extension behaviour was checked against a stand-in for the VS Code API.
