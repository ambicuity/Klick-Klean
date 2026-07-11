# Releasing Klick Klean to the Chrome Web Store

Updates are published to the Chrome Web Store **directly from GitHub** by the
`.github/workflows/publish.yml` workflow. It runs the test suite, builds a clean
package (runtime files only), and uploads + publishes via the Chrome Web Store
API.

## One-time setup: repository secrets

Add these under **Settings → Secrets and variables → Actions**:

| Secret | What it is |
|--------|------------|
| `CWS_EXTENSION_ID` | The extension ID from the Web Store dashboard URL |
| `CWS_CLIENT_ID` | OAuth2 client ID |
| `CWS_CLIENT_SECRET` | OAuth2 client secret |
| `CWS_REFRESH_TOKEN` | OAuth2 refresh token |

### Obtaining the OAuth credentials

1. In **Google Cloud Console**, create (or reuse) a project and enable the
   **Chrome Web Store API**.
2. Configure the OAuth consent screen (external, testing is fine) and add your
   Google account as a test user.
3. Create an **OAuth client ID** of type **Desktop app**. Note the client ID and
   client secret.
4. Generate a refresh token (one time). A common way:
   ```
   # Visit this URL in a browser (replace CLIENT_ID), approve, copy the code:
   https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&access_type=offline&approval_prompt=force&redirect_uri=urn:ietf:wg:oauth:2.0:oob&client_id=CLIENT_ID

   # Exchange the code for a refresh token:
   curl -s "https://oauth2.googleapis.com/token" \
     -d "client_id=CLIENT_ID" \
     -d "client_secret=CLIENT_SECRET" \
     -d "code=THE_CODE" \
     -d "grant_type=authorization_code" \
     -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob"
   ```
   Copy the `refresh_token` from the response.

The Google account must have **publisher access** to the extension's Web Store
listing.

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
