#!/usr/bin/env node
// Upload and publish a Chrome extension package to the Chrome Web Store.
//
// Authenticates with a Google Cloud service account rather than an OAuth
// refresh token. The service account's email must be added to the Chrome Web
// Store developer account (Developer Dashboard -> Account -> Service
// accounts), and the service account's project must have the Chrome Web Store
// API enabled.
//
// Usage:
//   node scripts/publish-chrome-webstore.mjs <chrome-zip>   upload and publish
//   node scripts/publish-chrome-webstore.mjs --status       print review status
//   node scripts/publish-chrome-webstore.mjs --upload-only  upload, no publish
//
// Env:
//   CWS_SERVICE_ACCOUNT_JSON  service-account key file contents (required)
//   CWS_EXTENSION_ID          store item id (required)
//   CWS_PUBLISHER_ID          publisher id from the dashboard's Account page
//                              (required)
//   CWS_SKIP_PUBLISH          "true" to upload the draft without publishing

import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";

const SCOPE = "https://www.googleapis.com/auth/chromewebstore";
const API = "https://chromewebstore.googleapis.com/v2/publishers";
const UPLOAD_API = "https://chromewebstore.googleapis.com/upload/v2/publishers";
const UPLOAD_POLL_INTERVAL_MS = 5_000;
const UPLOAD_POLL_ATTEMPTS = 24;
const FAILED_REVIEW_STATES = new Set(["REJECTED", "CANCELLED"]);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

// Exchanges the service account key for a Chrome Web Store scoped access token.
async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: SCOPE,
      aud: serviceAccount.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${claims}`)
    .sign(serviceAccount.private_key, "base64url");

  const response = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(`Token exchange failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

async function callApi(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      "x-goog-api-version": "2",
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${url} failed (${response.status}): ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

function itemBase(publisherId, itemId) {
  return `${API}/${publisherId}/items/${itemId}`;
}

function describeRevision(revision) {
  const channels = revision?.distributionChannels ?? [];
  const versions = channels.map((c) => `${c.crxVersion} @ ${c.deployPercentage}%`);
  const state = revision?.state || "none";
  return versions.length ? `${state} (${versions.join(", ")})` : state;
}

async function fetchStatus(publisherId, itemId, token) {
  const status = await callApi(`${itemBase(publisherId, itemId)}:fetchStatus`, token);
  console.log(`Submitted revision: ${describeRevision(status.submittedItemRevisionStatus)}`);
  console.log(`Published revision: ${describeRevision(status.publishedItemRevisionStatus)}`);
  if (status.takenDown) console.log("Item is TAKEN DOWN");
  if (status.warned) console.log("Item has a policy warning");
  return status;
}

// The upload response can report IN_PROGRESS while Chrome is still
// processing the package. fetchStatus exposes the async upload state as
// lastAsyncUploadState, so poll that until it settles - otherwise we would
// publish on top of an unfinished upload.
async function waitForUpload(publisherId, itemId, token) {
  for (let attempt = 0; attempt < UPLOAD_POLL_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, UPLOAD_POLL_INTERVAL_MS));
    const status = await callApi(`${itemBase(publisherId, itemId)}:fetchStatus`, token);
    const state = (status.lastAsyncUploadState || "").toUpperCase();
    if (state === "" || state === "SUCCEEDED") return status;
    if (state === "FAILED") {
      throw new Error("Upload failed; check the developer dashboard for the reason");
    }
  }
  throw new Error("Upload still in progress after polling; check the developer dashboard");
}

async function publish(zipPath, publisherId, itemId, token, shouldPublish) {
  const zip = await readFile(zipPath);
  console.log(`Uploading ${zipPath} (${zip.length} bytes) to item ${itemId}`);

  const upload = await callApi(`${UPLOAD_API}/${publisherId}/items/${itemId}:upload`, token, {
    method: "POST",
    headers: { "Content-Type": "application/zip" },
    body: zip,
  });

  let state = (upload.uploadState || "").toUpperCase();
  if (state === "IN_PROGRESS") {
    await waitForUpload(publisherId, itemId, token);
    state = "SUCCEEDED";
  }
  if (state !== "SUCCEEDED") {
    throw new Error(`Upload did not succeed (state=${state}): ${JSON.stringify(upload.itemError || upload)}`);
  }
  console.log(`Upload succeeded: ${upload.crxVersion ? `draft version ${upload.crxVersion}` : "draft created"}`);

  if (!shouldPublish) {
    console.log("CWS_SKIP_PUBLISH=true, leaving the upload as a draft");
    return;
  }

  const result = await callApi(`${itemBase(publisherId, itemId)}:publish`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  console.log(`Publish state: ${result.state || "unknown"}`);
  if (result.error) {
    throw new Error(`Publish rejected: ${JSON.stringify(result.error)}`);
  }

  const status = await fetchStatus(publisherId, itemId, token);
  const submittedState = status.submittedItemRevisionStatus?.state;
  if (FAILED_REVIEW_STATES.has(submittedState) || status.takenDown) {
    throw new Error(`Review failed (${submittedState}); see the developer dashboard for the reason`);
  }
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    throw new Error("Usage: publish-chrome-webstore.mjs <chrome-zip> | --status | --upload-only");
  }

  const serviceAccount = JSON.parse(requireEnv("CWS_SERVICE_ACCOUNT_JSON"));
  const extensionId = requireEnv("CWS_EXTENSION_ID");
  const publisherId = requireEnv("CWS_PUBLISHER_ID");
  const token = await getAccessToken(serviceAccount);

  if (arg === "--status") {
    const status = await fetchStatus(publisherId, extensionId, token);
    const submittedState = status.submittedItemRevisionStatus?.state;
    if (FAILED_REVIEW_STATES.has(submittedState) || status.takenDown) {
      throw new Error("Review failed; see the developer dashboard for the reason");
    }
    return;
  }

  const shouldPublish = process.env.CWS_SKIP_PUBLISH !== "true" && arg !== "--upload-only";
  await publish(arg, publisherId, extensionId, token, shouldPublish);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
