## Changelog

A change a library user would notice gets an entry under `## Unreleased` in `CHANGELOG.md`, under one of these headings, which `bun run prepare-release` reads to choose the next version. Keep entries short and user-focused.

- `### Breaking`: existing code has to change, such as a removed or renamed export, or a changed signature. Major, or minor below 1.0.
- `### Added`: a new export, option, or overload. Minor, or patch below 1.0.
- `### Changed`: a deliberate change to existing behavior, such as a new development-mode error. Minor, or patch below 1.0.
- `### Fixed`: a bug fix. Patch.

## Releasing

1. On a clean worktree, run `bun run prepare-release`. It versions both packages and moves the Unreleased notes under that version.
2. Commit, tag the commit `v<version>`, and push the tag. The Release workflow publishes both packages to npm and creates the GitHub release from the changelog notes.
