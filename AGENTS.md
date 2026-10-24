# Shared instructions for coding agents

Applies to Codex, Claude Code, Antigravity and other assistants in this repository.
Keep this file as the single source of shared instructions; tool-specific files should reference it rather than duplicate it.

## Start here

- Read README.md, inspect git status and recent commits, and preserve existing changes.
- Read docs/adr/README.md and relevant ADRs before changing package behaviour. Record significant design decisions as new ADRs.
- src/ contains the VS Code extension; latex/ contains the paired LuaLaTeX package; test/ contains tests; dist/ contains local release artifacts.
- Never assume the latest Git tag, package.json version, installed extension and dist artifacts agree. Check them when preparing a release.

## Working rules

- Do not commit, create or move tags, push, publish, delete files, or overwrite released artifacts without explicit user permission. A request to build a release authorizes local preparation and new artifacts, not publication.
- Do not switch branches or discard another assistant's changes without authorization.
- Never read or print tokens, credentials or secret files. Use configured authentication only for explicitly authorized publishing.
- Preserve existing marker syntax and public commands. Behaviour changes that affect existing documents must be opt-in (ADR-0008).
- Keep editor colour handling and LuaLaTeX parsing consistent. Citation styling must not alter author attribution.
- Do not silently change the user's installed extension or personal TeX package while only editing or building. If installation is requested, install the versioned VSIX and report that VS Code may need reloading.

## Verification

Use Node.js 22, matching CI. Run npm ci when dependencies are missing, then npm test and npm run check. Stop on failures; do not claim success if a command was missing.
For LaTeX changes, compile relevant fixtures and check the rendered output, ordinary/hidden modes, and applicable citation variants. Keep temporary compiler outputs outside tracked sources.
Run git diff --check and report any remaining warnings or untested behaviour.

## Release requests

Read and follow docs/RELEASING.md whenever asked to build, package, prepare or release a version.
A requested build is complete only when the versioned VSIX exists in this repository's dist/ directory, has been inspected, and is linked in the response. A temporary installation is not a release artifact.
Do not hard-code the current version in these instructions; derive it from the user's requested version and the repository state.

## Handoff

List changed files, checks performed, artifact links, and remaining steps. Explicitly distinguish built, installed, committed, tagged, pushed and published states.
Always recommend a short commit message in the form [area] Description, ending with a Co-Authored-By line naming the assistant. Do not execute the commit without permission.
