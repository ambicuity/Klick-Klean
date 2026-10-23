# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning principles for release tags.

## [Unreleased]

### Changed
- No unreleased changes currently tracked.

## [1.1.0] - 2026-10-22

### Fixed
- **Critical: the options page could not save anything.** `normalizeOriginList` was
  destructured from `KlickKleanSettingsStore`, which never exported it, so the
  value was `undefined` and the submit handler threw a `TypeError` before
  `saveSettings`/`saveAllowlist` were ever called. Every option -- categories,
  scope, time range, origins, allowlist, expert mode, notifications -- was
  silently discarded, and the allowlist field failed to render because its read
  callback threw too. (#1)
- **Critical: selecting the "Custom" time range permanently broke cleanup.** The
  options page offered the value with no way to express a custom range, and the
  submit handler never persisted `customRange`. That stored `timeRange: "custom"`
  with `customRange: null`, which the planner rejects with
  `INVALID_CUSTOM_RANGE` -- so every later cleanup run failed with a generic
  "Could not process this request." and no UI could repair it. The custom range
  is now configurable, and `normalizeSettings` heals the broken state written by
  1.0.1 by falling back to all-time. (#2)
- **A custom range's `end` bound was silently discarded.** Chrome's
  `browsingData.remove` accepts only a lower time bound, so a range of
  "1 Jan - 2 Jan" removed *everything* after 1 Jan. The planner now emits a
  `CUSTOM_RANGE_END_UNSUPPORTED` limitation instead of over-deleting quietly.
  (#3)
- **Presets were decorative.** Selecting a preset stored its id and nothing
  else -- the preset's categories, time range and scope were discarded, the
  popup could not offer presets at all, and the worker ignored `presetId`.
  Presets are now applied in both surfaces. (#4)
- **"Close all windows and tabs" was always reported as succeeded**, even when
  nothing was closed: the function swallowed every failure internally, so the
  caller's `catch` branch was unreachable. It now returns a structured result
  and reports `failed` when the keeper window or any window could not be
  closed. (#5)
- **`currentSite` scope could delete a different origin than the one the user
  confirmed.** The popup resolved the origin for its banner and then discarded
  it; the worker ran a second `tabs.query({currentWindow: true})`, which from a
  service worker resolves against the last-focused window rather than the
  window the user acted in. The popup now hands the confirmed origin over and
  the worker prefers it, and the report states the origin that was cleaned.
  (#6)
- **A failed storage read hung the cleanup run and latched the operation lock.**
  The read dereferenced an `undefined` result inside Chrome's callback, so the
  awaited promise never settled and every later cleanup returned
  `CLEANUP_IN_PROGRESS` for the next 60 seconds. Reads now check
  `chrome.runtime.lastError` and always call back. (#7)
- **Failed storage writes were reported as "Settings saved!".** The options page
  and the popup rendered the success state unconditionally, so a rejected write
  (a per-item sync quota overrun, for instance) left the extension running with
  the previous scope and allowlist while the user believed the new ones were in
  force. Both surfaces now report the failure. (#8)
- **The cleanup report discarded the failure reason.** The worker captured a
  detail message for every failed category and the popup never rendered it, so
  every failure showed the same generic "Cleanup could not fully complete."
  Failed categories now show their captured detail. (#9)
- **Screen readers announced every locale as English.** The popup, options and
  onboarding pages hardcoded `<html lang="en">`, and the i18n layer only set the
  attribute when it was empty -- so it never was. The real UI language is now
  always applied. (`privacy.html` keeps `lang="en"`: it carries no message
  tokens and is genuinely English-only.) (#10)

### Added
- Dependency-free test suites that exercise the real surfaces: a DOM stub and a
  `vm` harness that replays the module graph, the popup, the options page and
  the service worker against stubbed browser APIs
  (`tests/helpers/`, `tests/storage-store.test.js`, `tests/ui-surfaces.test.js`,
  `tests/service-worker.test.js`). Every fix above is covered by a test that
  fails without it.
- A "Preset" selector in the popup, so a preset can be run without visiting
  the options page.

### Changed
- The custom time range is start-only in the UI, with an explicit hint that
  Chrome's cleanup API cannot limit a range to an end date.

### Notes
- The new messages (`optionsSaveFailed`, `optionsCustomRange*`,
  `popupPreset*`, `reportOriginLabel`, `tabsCloseFailed`) exist in `en` only, so
  the other 34 locales fall back to English for them. This is cosmetic and
  matches the existing situation with the `preview*` keys; `npm run i18n:validate`
  reports it as a warning, not an error.

### Release
- The Chrome Web Store publish workflow now authenticates with a **Google Cloud
  service account** (`CWS_SERVICE_ACCOUNT_JSON`) instead of an OAuth refresh
  token, and calls the Chrome Web Store **v2** API through
  `scripts/publish-chrome-webstore.mjs`. The previous OAuth path required three
  secrets (`CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`) that were
  never configured in this repository, so the publish step could not have
  succeeded. `docs/RELEASING.md` now documents the mechanism that is actually
  in use.

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
