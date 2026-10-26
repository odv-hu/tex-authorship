# Shared instructions for coding agents

Applies to Codex, Claude Code, Antigravity and other assistants in this repository.
Keep this file as the single source of shared instructions; tool-specific files should reference it rather than duplicate it.

## Start here

- Read README.md, inspect git status and recent commits, and preserve existing changes.
- Read the GitHub issues (`gh issue list -R odv-hu/tex-authorship`) and the full thread of the issue you work on (`gh issue view <n> --comments -R odv-hu/tex-authorship`). See "Issues and commits" below.
- Read docs/adr/README.md and relevant ADRs before changing package behaviour. Record significant design decisions as new ADRs.
- src/ contains the VS Code extension; latex/ contains the paired LuaLaTeX package; test/ contains tests; dist/ contains local release artifacts.
- Never assume the latest Git tag, package.json version, installed extension and dist artifacts agree. Check them when preparing a release.

## Issues and commits

Open work lives in the GitHub issues of `odv-hu/tex-authorship`. docs/roadmap.md explains the direction and the order of priorities, and each of its open items has an issue. The issue thread is where the context of a piece of work is kept, so that someone with only the thread can continue it. No milestones yet; the owner assigns them.

- **Before starting:** work from an issue. Read it with its comments. If the task has none, find a matching one or open one (small housekeeping such as typos needs none).
- **New problems:** a bug, limitation or follow-up you find but do not fix becomes a new issue, not a line in the roadmap or a handoff note. Say what happens, where (file, command, fixture), the evidence (test output, PDF, commit), and what "done" means. Labels: one type (`bug`, `limitation`, `enhancement`, `documentation`, `question`, `exploration`) and one or more areas (`editor`, `latex`, `tests`, `release`). `exploration` marks an open design question that is not planned; it needs an owner decision or an ADR before code.
- **Commits:** every commit that works on an issue names it in the message body: `Refs #n` for progress, `Fixes #n` when the commit resolves it completely (GitHub closes it when the owner pushes to `main`).
- **Context in the thread:** when you stop working on an issue, or learn something the next person needs, comment: what was done (commit hashes), the checks run and their results, decisions and who took them, and what is left. No raw logs; never write full absolute paths (they contain the owner's account name).
- **Owner decisions:** a question only the owner can answer goes into the issue as a comment ending with the question, with the `question` label; do not decide it in the code.
- **Closing:** when an issue is resolved, update the README, docs/TESTING.md or the ADRs where the behaviour or evidence changed, and remove or update the item in docs/roadmap.md. Once CHANGELOG.md exists (#1), add user-visible changes to its unreleased section.
- **Without GitHub access** (no `gh`, no network): put the issue text or comment in your final message under "For the issue tracker", with the issue number, for the owner to post.

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

List changed files, checks performed, artifact links, the issues worked on, and remaining steps. Explicitly distinguish built, installed, committed, tagged, pushed and published states. Remaining work goes into the issue thread or a new issue, not only into the handoff.
Always recommend a short commit message in the form [area] Description, with `Refs #n` or `Fixes #n` in the body for each issue it touches, ending with a Co-Authored-By line naming the assistant. Do not execute the commit without permission.
