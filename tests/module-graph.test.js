"use strict";

// Guards the exact regression that broke 1.0.0: a runtime module referenced by
// sw.js / popup.html / options.html but missing from disk. Loads the full module
// graph in importScripts() order inside a service-worker-like scope, then
// exercises the core cleanup-planning logic.

const fs = require("fs");
const vm = require("vm");
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

// A service worker exposes web globals but no `document` and no `chrome`.
const sandbox = {};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.console = console;
for (const g of [
  "URL", "URLSearchParams", "Date", "Math", "JSON", "Set", "Map",
  "Array", "Object", "Number", "Boolean", "String"
]) {
  sandbox[g] = globalThis[g];
}
const context = vm.createContext(sandbox);

// Exact importScripts() order from sw.js, plus presets.js (loaded by options.html)
// so the whole runtime graph is validated.
const IMPORT_ORDER = [
  "i18n.js",
  "shared/utils.js",
  "shared/preferences.js",
  "shared/settings-store.js",
  "cleanup/time-range.js",
  "cleanup/capability-matrix.js",
  "cleanup/request-builder.js",
  "cleanup/presets.js"
];

console.log("[1] Module graph loads in importScripts order (no ReferenceErrors)");
for (const rel of IMPORT_ORDER) {
  try {
    const code = fs.readFileSync(path.join(ROOT, rel), "utf8");
    vm.runInContext(code, context, { filename: rel });
    ok("load " + rel, true);
  } catch (error) {
    ok("load " + rel, false, error.message);
  }
}

console.log("\n[2] Global namespaces attached");
const NS = [
  "i18nT", "KlickKleanUtils", "KlickKleanPrefs", "KlickKleanSettingsStore",
  "KlickKleanTimeRange", "KlickKleanCapabilities", "KlickKleanRequestBuilder",
  "KlickKleanPresets"
];
for (const n of NS) ok("global " + n, typeof sandbox[n] !== "undefined", "missing");

const {
  KlickKleanRequestBuilder,
  KlickKleanTimeRange,
  KlickKleanCapabilities
} = sandbox;

console.log("\n[3] Time-range math");
const HOUR = 3600 * 1000;
const now = 1000000000000;
ok("lastHour since", KlickKleanTimeRange.toSinceTimestamp("lastHour", now) === now - HOUR);
ok("allTime -> no window", Object.keys(KlickKleanTimeRange.buildRemovalWindow("allTime", null, now)).length === 0);
ok("last24h window has since", KlickKleanTimeRange.buildRemovalWindow("last24h", null, now).since === now - 24 * HOUR);
ok("unknown range -> allTime", KlickKleanTimeRange.normalizeTimeRange("bogus") === "allTime");

console.log("\n[4] Capability matrix (Chrome browsingData key mapping)");
ok("cookies -> cookies", KlickKleanCapabilities.getChromeKey("cookies") === "cookies");
ok("appcache deprecated -> null key", KlickKleanCapabilities.getChromeKey("appcache") === null);
ok("webSQL deprecated", KlickKleanCapabilities.isDeprecated("webSQL") === true);
ok("cache is cleanable", KlickKleanCapabilities.isCleanable("cache") === true);
ok("passwords not cleanable", KlickKleanCapabilities.isCleanable("passwords") === false);

console.log("\n[5] buildCleanupPlan - global scope, all-time");
{
  const plan = KlickKleanRequestBuilder.buildCleanupPlan(
    { categories: { cookies: true, cache: true, history: true }, timeRange: "allTime", scope: "global" },
    { activeOrigin: "" }
  );
  ok("no errors", plan.errors.length === 0, JSON.stringify(plan.errors));
  ok("removeData has cookies/cache/history", plan.removeData.cookies && plan.removeData.cache && plan.removeData.history);
  ok("no since (all-time)", plan.removeOptions.since === undefined);
  ok("hasTabsAction false", plan.hasTabsAction === false);
}

console.log("\n[6] buildCleanupPlan - current-site scope with origin + window");
{
  const plan = KlickKleanRequestBuilder.buildCleanupPlan(
    { categories: { cache: true, history: true, cookies: true }, timeRange: "last24h", scope: "currentSite" },
    { activeOrigin: "https://example.com" }
  );
  ok("no errors", plan.errors.length === 0, JSON.stringify(plan.errors));
  ok("origins scoped to example.com", JSON.stringify(plan.removeOptions.origins) === JSON.stringify(["https://example.com"]));
  ok("since set for last24h", typeof plan.removeOptions.since === "number");
  ok("history flagged global-only under scope", plan.globalOnlyData.history === true);
}

console.log("\n[7] buildCleanupPlan - scoped run without origin -> error");
{
  const plan = KlickKleanRequestBuilder.buildCleanupPlan(
    { categories: { cache: true }, timeRange: "allTime", scope: "currentSite" },
    { activeOrigin: "" }
  );
  ok("SCOPE_WITHOUT_ORIGIN error", plan.errors.some((e) => e.code === "SCOPE_WITHOUT_ORIGIN"));
}

console.log("\n[8] buildCleanupPlan - allowlist exclude on global run");
{
  const plan = KlickKleanRequestBuilder.buildCleanupPlan(
    { categories: { cookies: true }, timeRange: "allTime", scope: "global", allowlistOrigins: ["https://keep.com"] },
    { activeOrigin: "" }
  );
  ok("excludeOrigins applied", JSON.stringify(plan.removeOptions.excludeOrigins) === JSON.stringify(["https://keep.com"]));
}

console.log("\n[9] buildCleanupPlan - custom range without data -> error");
{
  const plan = KlickKleanRequestBuilder.buildCleanupPlan(
    { categories: { cache: true }, timeRange: "custom", scope: "global", customRange: null },
    { activeOrigin: "" }
  );
  ok("INVALID_CUSTOM_RANGE error", plan.errors.some((e) => e.code === "INVALID_CUSTOM_RANGE"));
}

console.log("\n[10] i18n fallback returns key when chrome.i18n absent");
ok("i18nT('cleanupComplete') === 'cleanupComplete'", sandbox.i18nT("cleanupComplete") === "cleanupComplete");

console.log("\n================ RESULT ================");
console.log("PASS: " + pass + "  FAIL: " + fail);
process.exit(fail === 0 ? 0 : 1);
