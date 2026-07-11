# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning principles for release tags.

## [Unreleased]

### Changed
- No unreleased changes currently tracked.

## [1.0.1] - 2026-07-10

### Fixed
- **Critical: extension was completely non-functional in 1.0.0.** The `cleanup/`
  module directory was deleted in `ec32aef` but is still loaded by the service
  worker (`sw.js` `importScripts`), the popup (`popup/popup.html`), and the
  options page (`options/options.html`). Loading the missing files aborted the
  service worker at startup and threw `ReferenceError` in both UI surfaces, so no
  cleanup could run. Restored the four runtime modules
  (`cleanup/time-range.js`, `cleanup/capability-matrix.js`,
  `cleanup/request-builder.js`, `cleanup/presets.js`).
- `package.json` test scripts pointed at `tests/` and `scripts/` files that never
  existed, so `npm test` and `npm run i18n:validate` always failed. Added real,
  dependency-free suites: `tests/reference-integrity.test.js` (guards against a
  referenced-but-missing file — the exact 1.0.0 regression),
  `tests/module-graph.test.js` (loads the full `importScripts` graph and
  exercises the cleanup planner), and `scripts/validate-i18n.js`.

### Notes
- The five `preview*` message keys used by the popup exist only in `en`; the 34
  other locales fall back to English for them. This is cosmetic (surfaced as a
  warning by `npm run i18n:validate`) and pre-dates 1.0.0.

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
