# Releasing Klick Klean to the Chrome Web Store

Updates are published to the Chrome Web Store **directly from GitHub** by the
`.github/workflows/publish.yml` workflow. It runs the test suite, builds a clean
package (runtime files only), and uploads + publishes via the Chrome Web Store
API.

## How the workflow authenticates

The workflow authenticates with a **Google Cloud service account**, not an OAuth
refresh token. The service account is granted the
`https://www.googleapis.com/auth/chromewebstore` scope by its own key, so no
refresh token has to be rotated or re-issued.

Two identifiers are involved:

| Name | Where it lives | What it is |
|------|----------------|------------|
| `CWS_EXTENSION_ID` | repository **secret** | this extension's Web Store item id — `gaeddipmgpkeanmjbcenmcnjckhfjbkd` |
| `CWS_PUBLISHER_ID` | `.github/workflows/publish.yml` (`env`) | the publisher id from the dashboard's Account page — `8b00f945-9ad2-4149-a831-8f017da3a783` |

The publisher id is a public identifier (it appears in dashboard URLs), so it is
kept in the workflow rather than hidden in a secret. The item id and the service
account key are secrets.

The service account in use is
`chrome-webstore-ci@gen-lang-client-0993328265.iam.gserviceaccount.com`. It is
registered as a publisher on the developer account that owns this listing, and
its project has the Chrome Web Store API enabled.

## One-time setup: repository secrets

Add these under **Settings → Secrets and variables → Actions**:

| Secret | What it is |
|--------|------------|
| `CWS_EXTENSION_ID` | this extension's Web Store item id |
| `CWS_SERVICE_ACCOUNT_JSON` | the service-account key file, as JSON text |

GitHub repository secrets do not carry across repos, so the service-account
key has to be present in **this** repo as well as in any other repo that
publishes from the same account.

### Adding a service account to the Web Store account

1. In **Google Cloud Console**, pick (or create) the project that will own the
   service account, and enable the **Chrome Web Store API** for it.
2. Create a service account and download its JSON key.
3. In the **Chrome Web Store developer dashboard** → *Account* → *Service
   accounts*, add the service account's email address. Without this the API
   returns HTTP 403 even with a valid key.
4. Install the key in the repo:

   ```
   cat service-account.json | gh secret set CWS_SERVICE_ACCOUNT_JSON --repo ambicuity/Klick-Klean
   ```

   The same key can publish **every extension owned by that account**; only
   `CWS_EXTENSION_ID` differs per extension.

## Cutting a release

1. Bump the version in **both** `manifest.json` and `package.json` (they must
   match, and must be higher than the currently published version — the Web Store
   rejects re-uploads of an existing version).
2. Update `CHANGELOG.md`.
3. Commit and merge the release PR, then tag and push:
   ```
   git tag v1.1.0
   git push origin v1.1.0
   ```
   The tag push triggers the workflow. It fails fast if the tag version and the
   `manifest.json` / `package.json` versions disagree.

You can also run the workflow manually from the **Actions** tab
(`workflow_dispatch`); its `publish` input controls whether the uploaded draft
is submitted for review or left as a draft.

## Checking the review status

The publish script prints the submitted and published revision states. To check
them later without uploading anything:

```
CWS_SERVICE_ACCOUNT_JSON="$(cat service-account.json)" \
CWS_EXTENSION_ID=gaeddipmgpkeanmjbcenmcnjckhfjbkd \
CWS_PUBLISHER_ID=8b00f945-9ad2-4149-a831-8f017da3a783 \
node scripts/publish-chrome-webstore.mjs --status
```

A submitted revision sits in `PENDING_REVIEW` until Google finishes reviewing
it; the published revision only changes after approval.

## What the workflow ships

`scripts/build-zip.sh` stages only runtime files
(`manifest.json`, `sw.js`, `i18n.js`, `privacy.html`, `LICENSE`, `shared/`,
`cleanup/`, `popup/`, `options/`, `onboarding/`, `static/`, `_locales/`) and zips
them. Development files (`tests/`, `scripts/`, `package.json`, `.git/`, docs) are
**not** shipped. Promotional images under `store-assets/` are uploaded through
the dashboard listing, not in the package.

## Local dry run

```
npm test                    # integrity + module-graph + storage-store + ui-surfaces + service-worker + i18n
bash scripts/build-zip.sh   # produces dist/klick-klean-<version>.zip
```

Load `dist/klick-klean-<version>/` as an unpacked extension (or install Chrome for
Testing, which permits `--load-extension`) to smoke-test before tagging. Note that
**stable Google Chrome blocks `--load-extension` from the command line**; use the
in-browser "Load unpacked" button on `chrome://extensions`, or Chrome for Testing.
