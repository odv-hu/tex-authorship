# 0011. Use the normal release channel by default

Status: Accepted
Date: 2026-10-24

## Context

The workflow used odd minor versions to set both Marketplace and GitHub pre-release flags. This made all 0.1.x releases pre-releases even when the owner intended a normal release.

## Decision

Remove the minor-parity rule and both pre-release flag variables. New GitHub releases and VSIX packages use the normal release channel by default. Keep local build instructions consistent. A future pre-release must be explicitly requested rather than inferred from the minor version.

## Consequences

Version parsing, artifact naming, tests and publishing authorization remain unchanged. Existing releases and packaged VSIX files retain their current status; this change does not promote or overwrite them. The existing-release upload branch does not change the release's pre-release flag. Existing tags are not moved.
