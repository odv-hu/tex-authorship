# Preparing a release

This is the shared local release checklist. CI is implemented in `.github/workflows/release.yml`; keep these instructions consistent with it.
Building is separate from committing, tagging and publishing.

## 1. Establish the version and source

Inspect the working tree, latest tags, package.json, package-lock.json, latex/authorship.sty and dist/.
Use the version requested by the owner. If it already identifies a published release with different contents, propose a new patch version rather than replacing that release.
Align package.json's version, both root-package version fields in package-lock.json, and the version/date in latex/authorship.sty. Never change dependency versions just to bump the extension version.
Retain unrelated working changes. State that an uncommitted build is a candidate, not an artifact built from a final release commit.

## 2. Verify

Use Node.js 22, as CI does:

```sh
npm ci
npm test
npm run check
git diff --check
```

Run relevant LuaLaTeX fixtures for changes under latex/. Review the actual rendered result and check hide mode. Do not continue packaging after a failed check without resolving or explicitly reporting the blocker.

## 3. Build into dist/

New releases use the normal GitHub and Marketplace release channels, regardless of minor-version parity (ADR-0011). Do not add pre-release flags unless explicitly requested.
Use the same packager major as CI (`@vscode/vsce@3`). Do not silently use a different version through the unpinned npm package script.
Run from the repository root after verification; check that these destination files do not already exist before running:

```sh
RELEASE_VERSION=$(node -p "require('./package.json').version")
mkdir -p dist
npx --yes @vscode/vsce@3 package -o "dist/tex-authorship-$RELEASE_VERSION.vsix"
(cd latex && zip -X "../dist/authorship-latex-$RELEASE_VERSION.zip" authorship.sty authorship.lua)
```

If packaging fails, resolve the cause in the repository and review the change. For example, use a normal DOI link if the packager rejects an SVG badge. Do not silently strip content only in a temporary packaging copy.
Temporary staging is acceptable when needed, but its packaged sources must match the working tree and final artifacts must be placed in dist/.
Never finish with only a VSIX in /tmp or a same-version local test installation.

## 4. Inspect and deliver

Open the VSIX as a ZIP and verify:

- The archive is readable; extension/package.json has the requested version and publisher odv-hu.
- extension.vsixmanifest has the matching version and no enabled pre-release flag.
- Bundled src/ and latex/ files match the intended source, including the new feature.
- No credentials, node_modules, previous archives or unrelated artifacts are included.
- The standalone ZIP contains the matching authorship.sty and authorship.lua.

Report tests, changed files, exact artifact links and any remaining limitations. Include a recommended commit message.
Do not call the release published or installed merely because packaging succeeded.

## 5. Finalize only when authorized

For a reproducible release, commit the version-aligned source and approved fixes, then build from that exact commit and create the matching vMAJOR.MINOR.PATCH tag. Do not move an existing release tag.
If source changes after a candidate build, rebuild from the approved source before distributing it; obtain authorization before replacing an existing artifact.

Pushing a release tag triggers the GitHub workflow. It creates or updates GitHub release assets and may publish to Marketplace when the configured publishing secret is available. Treat pushing such a tag or dispatching the workflow as a publishing action requiring explicit authorization.
The workflow can replace existing assets, so do not rerun it against an existing release casually.

When the owner requests local installation, install the versioned dist/ VSIX and verify the installed version. Tell the owner to reload VS Code if the extension host still has the previous implementation loaded.

Changing the workflow does not promote existing GitHub pre-releases or alter previously published VSIX files. The existing-release branch only uploads assets; it does not change release status. Promotion of an existing release is a separate, explicitly authorized action.
