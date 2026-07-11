"use strict";

// Validates i18n integrity. `en` is the default_locale, so Chrome falls back to
// it for any message missing from the active locale.
//
// HARD FAIL (breaks runtime):
//  1. a message key used in source (i18nT("k") / __MSG_k__) is missing from en
//  2. a locale file is invalid JSON
//  3. a message entry has an empty "message" string
//
// WARN (cosmetic — falls back to en, does not break):
//  - a non-en locale is missing a key that is actually used in source
//  - a locale carries keys not present in en (stale translations)

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LOCALES_DIR = path.join(ROOT, "_locales");

let errors = 0;
let warnings = 0;
function fail(msg) {
  errors += 1;
  console.log("  ✗ " + msg);
}
function warn(msg) {
  warnings += 1;
  console.log("  ! " + msg);
}

function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "_locales", "node_modules", "tests", "scripts", "store-assets"].includes(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (/\.(js|html)$/.test(entry.name)) acc.push(p);
  }
  return acc;
}

// [1] keys used in source
const used = new Set();
for (const file of walk(ROOT, [])) {
  const text = fs.readFileSync(file, "utf8");
  for (const m of text.matchAll(/i18nT\(\s*["']([A-Za-z0-9_@]+)["']/g)) used.add(m[1]);
  for (const m of text.matchAll(/__MSG_([A-Za-z0-9_@]+)__/g)) used.add(m[1]);
}

const en = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en", "messages.json"), "utf8"));
const enKeys = new Set(Object.keys(en));

console.log("[1] Source keys defined in en (" + used.size + " used, " + enKeys.size + " defined)");
for (const key of used) {
  if (!enKeys.has(key)) fail("used but undefined in en: " + key);
}

console.log("\n[2] Locale JSON validity + non-empty messages (hard) / coverage (warn)");
const locales = fs.readdirSync(LOCALES_DIR).filter((d) =>
  fs.statSync(path.join(LOCALES_DIR, d)).isDirectory()
);
const coverageGaps = {};
for (const locale of locales) {
  const file = path.join(LOCALES_DIR, locale, "messages.json");
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    fail(locale + ": invalid JSON (" + e.message + ")");
    continue;
  }
  const keys = new Set(Object.keys(data));
  for (const [k, v] of Object.entries(data)) {
    if (!v || typeof v.message !== "string" || v.message.trim() === "") {
      fail(locale + ": empty message for " + k);
    }
  }
  if (locale === "en") continue;
  const missingUsed = [...used].filter((k) => !keys.has(k));
  if (missingUsed.length) coverageGaps[locale] = missingUsed;
}

if (Object.keys(coverageGaps).length) {
  // Group by the identical missing-key signature to keep output compact.
  const signature = (arr) => arr.slice().sort().join(",");
  const bySig = {};
  for (const [loc, miss] of Object.entries(coverageGaps)) {
    const s = signature(miss);
    (bySig[s] = bySig[s] || []).push(loc);
  }
  for (const [sig, locs] of Object.entries(bySig)) {
    warn(locs.length + " locale(s) fall back to en for: " + sig);
    warn("  affected: " + locs.join(", "));
  }
}

console.log("\n================ RESULT ================");
console.log("Locales: " + locales.length + " | en keys: " + enKeys.size + " | used keys: " + used.size);
console.log("Warnings (cosmetic en fallback): " + warnings);
if (errors === 0) {
  console.log("i18n OK — no runtime-breaking i18n problems");
  process.exit(0);
}
console.log("i18n FAILED with " + errors + " runtime-breaking problem(s)");
process.exit(1);
