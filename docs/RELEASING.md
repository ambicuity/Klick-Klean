# Releasing Klick Klean to the Chrome Web Store

Updates are published to the Chrome Web Store **directly from GitHub** by the
`.github/workflows/publish.yml` workflow. It runs the test suite, builds a clean
package (runtime files only), and uploads + publishes via the Chrome Web Store
API.

## One-time setup: repository secrets

Add these under **Settings → Secrets and variables → Actions**:

| Secret | What it is |
|--------|------------|
| `CWS_EXTENSION_ID` | This extension's Web Store ID — `gaeddipmgpkeanmjbcenmcnjckhfjbkd` |
| `CWS_CLIENT_ID` | OAuth2 client ID |
| `CWS_CLIENT_SECRET` | OAuth2 client secret |
| `CWS_REFRESH_TOKEN` | OAuth2 refresh token |

### The OAuth credentials are account-wide and reusable

`CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, and `CWS_REFRESH_TOKEN` authenticate the
**Google developer account**, not a single extension. One set of tokens can
publish **every extension owned by that account**. If you already publish another
extension of yours from GitHub, reuse the exact same three values here — only
`CWS_EXTENSION_ID` differs per extension (for Klick Klean it is
`gaeddipmgpkeanmjbcenmcnjckhfjbkd`).

GitHub repository secrets do not carry across repos, so copy the three OAuth
values into *this* repo's secrets (or, if both repos live under a GitHub org, use
an org-level secret shared to both).

The account behind the tokens must have **publisher access** to the Klick Klean
listing (returns HTTP 403 otherwise).

### Obtaining the OAuth credentials (if you don't already have them)

Easiest — the helper tool from the author of `chrome-webstore-upload-cli` walks
through the Google Cloud setup, creates a Desktop OAuth client, opens the browser
to authorize, and prints all three values:

```
npx chrome-webstore-upload-keys
```

Manual alternative:

1. In **Google Cloud Console**, create (or reuse) a project and enable the
   **Chrome Web Store API**.
2. Configure the **OAuth consent screen** and add your Google account.
3. Create an **OAuth client ID** of type **Desktop app** → gives the client ID
   and client secret.
4. Run the OAuth flow with that client to obtain a refresh token (the helper tool
   above automates exactly this step).

> ⚠️ **Set the OAuth consent screen to "In production," not "Testing."** In
> Testing mode Google expires the refresh token after **7 days**, and the workflow
> will start failing a week later with an auth error. Publishing the consent
> screen makes the token long-lived.

> Note: Google's old out-of-band (`urn:ietf:wg:oauth:2.0:oob`) copy-paste-code
> flow is deprecated for new clients — use the helper tool or a Desktop-app
> loopback flow instead.

## Cutting a release

1. Bump the version in **both** `manifest.json` and `package.json` (they must
   match, and must be higher than the currently published version — the Web Store
   rejects re-uploads of an existing version).
2. Update `CHANGELOG.md`.
3. Commit, then tag and push:
   ```
   git tag v1.0.1
   git push origin v1.0.1
   ```
   The tag push triggers the workflow. It fails fast if the tag version and
   `manifest.json` version disagree.

You can also run the workflow manually from the **Actions** tab
(`workflow_dispatch`).

## What the workflow ships

`scripts/build-zip.sh` stages only runtime files
(`manifest.json`, `sw.js`, `i18n.js`, `privacy.html`, `LICENSE`, `shared/`,
`cleanup/`, `popup/`, `options/`, `onboarding/`, `static/`, `_locales/`) and zips
them. Development files (`tests/`, `scripts/`, `package.json`, `.git/`, docs) are
**not** shipped. Promotional images under `store-assets/` are uploaded through the
dashboard listing, not in the package.

## Local dry run

```
npm test                 # integrity + module-graph + i18n validation
bash scripts/build-zip.sh   # produces dist/klick-klean-<version>.zip
```

Load `dist/klick-klean-<version>/` as an unpacked extension (or install Chrome for
Testing, which permits `--load-extension`) to smoke-test before tagging. Note that
**stable Google Chrome blocks `--load-extension` from the command line**; use the
in-browser "Load unpacked" button on `chrome://extensions`, or Chrome for Testing.
