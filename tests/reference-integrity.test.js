"use strict";

// Verifies every file referenced by the manifest, the service worker's
// importScripts(), and each HTML <script src> / <link href> / <img src>
// actually exists on disk. This is the direct guard for the 1.0.0 regression
// where cleanup/*.js was deleted but still referenced.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) {
    pass += 1;
    console.log("  ✓ " + name);
  } else {
    fail += 1;
    console.log("  ✗ " + name + (extra ? "  -> " + extra : ""));
  }
}

function existsFrom(baseDir, ref) {
  // Ignore any URI scheme (http:, mailto:, tel:, data:, chrome: ...),
  // pure fragment links (#id), and unresolved message tokens.
  if (!ref || ref.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.includes("__MSG_")) {
    return true;
  }
  const clean = ref.split(/[?#]/)[0];
  const abs = clean.startsWith("/")
    ? path.join(ROOT, clean.slice(1))
    : path.join(baseDir, clean);
  return fs.existsSync(abs);
}

console.log("[1] Manifest-referenced files exist");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const manifestRefs = [
  manifest.background && manifest.background.service_worker,
  manifest.action && manifest.action.default_popup,
  manifest.action && manifest.action.default_icon,
  manifest.options_page,
  ...(manifest.icons ? Object.values(manifest.icons) : [])
].filter(Boolean);
for (const ref of manifestRefs) {
  ok("manifest -> " + ref, existsFrom(ROOT, ref), "missing");
}

console.log("\n[2] Service worker importScripts targets exist");
const swSource = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const importBlock = swSource.match(/importScripts\(([\s\S]*?)\)/);
const swRefs = importBlock
  ? Array.from(importBlock[1].matchAll(/["']([^"']+)["']/g)).map((m) => m[1])
  : [];
ok("importScripts block found", swRefs.length > 0);
for (const ref of swRefs) {
  ok("sw importScripts -> " + ref, existsFrom(ROOT, ref), "missing");
}

console.log("\n[3] HTML <script>/<link>/<img> targets exist");
const HTML_FILES = [
  "popup/popup.html",
  "options/options.html",
  "onboarding/welcome.html",
  "privacy.html"
];
for (const htmlRel of HTML_FILES) {
  const htmlPath = path.join(ROOT, htmlRel);
  if (!fs.existsSync(htmlPath)) {
    ok("html present " + htmlRel, false, "missing html file");
    continue;
  }
  const baseDir = path.dirname(htmlPath);
  const html = fs.readFileSync(htmlPath, "utf8");
  const refs = Array.from(html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)).map((m) => m[1]);
  for (const ref of refs) {
    ok(htmlRel + " -> " + ref, existsFrom(baseDir, ref), "missing");
  }
}

console.log("\n[4] Localized surfaces do not hardcode a language (#10)");
{
  // These pages carry __MSG_ tokens and are rendered in the browser's UI
  // language. A fixed lang attribute would make assistive technology announce
  // every locale as English. privacy.html is English-only by design, so it
  // keeps lang="en".
  const LOCALIZED_HTML = [
    "popup/popup.html",
    "options/options.html",
    "onboarding/welcome.html"
  ];
  for (const htmlRel of LOCALIZED_HTML) {
    const html = fs.readFileSync(path.join(ROOT, htmlRel), "utf8");
    ok(
      htmlRel + " has no hardcoded lang attribute",
      !/<html[^>]*\slang\s*=/i.test(html),
      "hardcoded lang attribute"
    );
  }

  const privacyHtml = fs.readFileSync(path.join(ROOT, "privacy.html"), "utf8");
  ok(
    "privacy.html keeps its English lang attribute",
    /<html[^>]*\slang\s*=\s*"en"/i.test(privacyHtml)
  );
}

console.log("\n================ RESULT ================");
console.log("PASS: " + pass + "  FAIL: " + fail);
process.exit(fail === 0 ? 0 : 1);
