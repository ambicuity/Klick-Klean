# Klick Klean

Klick Klean is a Chrome extension that helps you quickly clean selected browsing data with clear controls, scoped cleanup, and safety confirmations.

## Who It Is For

- Privacy-conscious users who want fast, repeatable browser cleanup
- Power users who need scope control (global, current site, selected sites)
- Contributors who want a lightweight runtime package of the extension

## Feature Highlights

- Cleanup categories include:
  - Close all windows and tabs
  - Browsing history
  - Cookies
  - Download history
  - Form data
  - Cached files and site storage categories supported by Chrome
- Scope options:
  - Global cleanup
  - Current site only
  - Selected origins
- Presets and expert mode support for faster workflows
- Warning and confirmation flow before destructive actions
- Optional notifications for cleanup progress and completion
- Internationalized UI via `_locales` (multiple languages)

## Install and Run (Unpacked in Chrome)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder:
   - `.../Klick Klean/0.2.0_0`
5. Pin and open **Klick Klean** from the extensions toolbar.

Useful entry points after loading:

- Popup UI: `popup/popup.html` (opened from extension icon)
- Options page: `options/options.html` (from extension details or in-app links)
- Onboarding page: `onboarding/welcome.html` (shown on first install/update flow)

## Privacy and Trust

- Klick Klean runs locally in your browser.
- Browsing data selected for cleanup is not sent to external servers.
- Settings and allowlist data are stored using Chrome extension storage.
- Privacy policy:
  - Markdown: [`privacy.md`](privacy.md)
  - HTML: [`privacy.html`](privacy.html)

## Permissions (Why They Are Needed)

- `browsingData`: remove selected browsing data types
- `storage`: save user settings and allowlist locally
- `tabs`: detect active tab origin and support tab/window cleanup behavior
- `notifications`: optionally show cleanup progress/completion notifications

## Project Layout (High Level)

- `popup/`: popup interface, cleanup trigger flow, status/report UI
- `options/`: persistent settings UI (defaults, scope, allowlist, expert mode)
- `cleanup/`: cleanup planning, capability mapping, time range, request assembly
- `shared/`: shared preferences, settings store, utility helpers
- `_locales/`: localized message catalogs for i18n
- `onboarding/`: welcome/onboarding experience
- `static/`: extension icons

## Contributor Notes (Runtime-Only Package)

This repository currently reflects a **runtime-focused package**.

- Historical test/tooling folders were removed from this package.
- `package.json` may still contain legacy script entries that reference files not present here.
- If you want a full development workflow (tests, tooling, CI-oriented scripts), restore the full dev variant before relying on those scripts.

## Support

- Contact: `contact@riteshrana.engineer`
- Homepage: `https://riteshrana.engineer`
- Buy Me a Coffee: `https://buymeacoffee.com/ritesh.rana`

## License

No license file is currently included in this package. Add a `LICENSE` file to define reuse terms explicitly.
