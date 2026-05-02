# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning principles for release tags.

## [Unreleased]

### Changed
- No unreleased changes currently tracked.

## [1.0.0] - 2026-05-01

### Added
- Initial runtime package for the Klick Klean Chrome extension.
- Core extension surfaces:
  - Popup UI (`popup/`)
  - Options UI (`options/`)
  - Onboarding flow (`onboarding/`)
  - Service worker (`sw.js`)
- Localization bundles under `_locales/`.
- Store assets and extension icons.
- Privacy policy in both HTML and Markdown formats (`privacy.html`, `privacy.md`).
- Project README documentation.
- Custom restrictive license file (`LICENSE`).

### Changed
- Updated README wording and support details.
- Added Buy Me a Coffee link across docs and privacy pages.

### Removed
- Development/runtime-noise files from packaged state:
  - Local environment artifacts (`.DS_Store` tracked entry removed)
  - Cleanup module directory (`cleanup/`)
- The package is currently runtime-focused, with legacy references remaining in `package.json` scripts.

## Historical Commit Notes (Post-Release Maintenance on `main`)

- `17775a2`: Added custom restrictive license and README license update.
- `68ae576`: README content update.
- `252ff3c`: Added Buy Me a Coffee link across docs/privacy.
- `ec32aef`: Removed `cleanup/` directory and pushed latest snapshot.
- `7b3eee3`: Ignored and untracked `.DS_Store`.
- `1ec041b`: Initial runtime package commit.
