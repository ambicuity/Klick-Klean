"use strict";

// Exercises the settings store directly against a stubbed chrome.storage API.
//
// The store is the only bridge between the popup, the options page, the
// service worker and chrome.storage, so it is the right place to pin the
// contract those surfaces depend on (#1, #7, #8).

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

function loadStore() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  for (const g of [
    "URL", "URLSearchParams", "Date", "Math", "JSON", "Set", "Map",
    "Array", "Object", "Number", "Boolean", "String", "Promise"
  ]) {
    sandbox[g] = globalThis[g];
  }
  const context = vm.createContext(sandbox);
  for (const rel of ["shared/utils.js", "shared/preferences.js", "shared/settings-store.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), context, { filename: rel });
  }
  return sandbox;
}

// Minimal chrome.storage stub. `fail*` flags simulate a storage failure:
// Chrome invokes the callback with an undefined result and sets
// chrome.runtime.lastError, exactly as it does in the browser.
function makeChrome(options = {}) {
  const runtime = { lastError: undefined };
  const state = {
    sync: Object.assign({}, options.sync),
    local: Object.assign({}, options.local)
  };
  const writes = { sync: [], local: [] };

  function read(area, defaults, callback, shouldFail) {
    if (shouldFail) {
      runtime.lastError = { message: "STORAGE_READ_FAILED" };
      try {
        callback(undefined);
      } finally {
        runtime.lastError = undefined;
      }
      return;
    }
    callback(Object.assign({}, defaults, state[area]));
  }

  function write(area, items, callback, shouldFail) {
    if (shouldFail) {
      runtime.lastError = { message: "QUOTA_BYTES_PER_ITEM_QUOTA_EXCEEDED" };
      try {
        if (callback) callback();
      } finally {
        runtime.lastError = undefined;
      }
      return;
    }
    writes[area].push(items);
    Object.assign(state[area], items);
    if (callback) callback();
  }

  return {
    runtime,
    state,
    writes,
    storage: {
      sync: {
        get(defaults, callback) { read("sync", defaults, callback, options.failSyncRead); },
        set(items, callback) { write("sync", items, callback, options.failSyncWrite); }
      },
      local: {
        get(defaults, callback) { read("local", defaults, callback, options.failLocalRead); },
        set(items, callback) { write("local", items, callback, options.failLocalWrite); }
      }
    }
  };
}

console.log("[1] KlickKleanSettingsStore exports normalizeOriginList");
{
  const sandbox = loadStore();
  const store = sandbox.KlickKleanSettingsStore;
  ok(
    "normalizeOriginList is a function",
    typeof store.normalizeOriginList === "function",
    "type=" + typeof store.normalizeOriginList
  );
  ok(
    "matches KlickKleanUtils.normalizeOriginList",
    typeof store.normalizeOriginList === "function" &&
      JSON.stringify(store.normalizeOriginList(["https://a.com", "https://a.com", "ftp://b.com", "nonsense"])) ===
        JSON.stringify(sandbox.KlickKleanUtils.normalizeOriginList(["https://a.com", "https://a.com", "ftp://b.com", "nonsense"]))
  );
  ok(
    "normalizes to a deduplicated origin list",
    typeof store.normalizeOriginList === "function" &&
      JSON.stringify(store.normalizeOriginList(["https://a.com/x", "https://a.com", "not a url"])) ===
        JSON.stringify(["https://a.com"])
  );
}

console.log("\n[2] readAllowlist returns a normalised list");
{
  const sandbox = loadStore();
  sandbox.chrome = makeChrome({ local: { allowlistOrigins: ["https://a.com", "https://a.com", "bad"] } });
  let result = null;
  sandbox.KlickKleanSettingsStore.readAllowlist((v) => { result = v; });
  ok("deduplicated and filtered", JSON.stringify(result) === JSON.stringify(["https://a.com"]), JSON.stringify(result));
}

console.log("\n[3] saveSettings persists the normalised settings object");
{
  const sandbox = loadStore();
  sandbox.chrome = makeChrome();
  let saved = null;
  sandbox.KlickKleanSettingsStore.saveSettings({ categories: { cookies: true }, timeRange: "last24h" }, (v) => { saved = v; });
  ok("callback receives normalised settings", Boolean(saved) && saved.timeRange === "last24h");
  ok(
    "write reached chrome.storage.sync",
    sandbox.chrome.writes.sync.length === 1 && sandbox.chrome.writes.sync[0].settings.timeRange === "last24h"
  );
}

console.log("\n[4] A failed read never throws and always calls back (#7)");
{
  const sandbox = loadStore();
  sandbox.chrome = makeChrome({ failSyncRead: true, failLocalRead: true });

  let settingsResult = null;
  let settingsCalls = 0;
  let threw = null;
  try {
    sandbox.KlickKleanSettingsStore.readSettings((v) => {
      settingsCalls += 1;
      settingsResult = v;
    });
  } catch (error) {
    threw = error;
  }
  ok("readSettings did not throw", threw === null, threw && threw.message);
  ok("readSettings called back exactly once", settingsCalls === 1, "calls=" + settingsCalls);
  ok(
    "readSettings fell back to the default settings",
    settingsResult !== null &&
      settingsResult.timeRange === sandbox.KlickKleanPrefs.DEFAULT_SETTINGS.timeRange &&
      settingsResult.scope === sandbox.KlickKleanPrefs.DEFAULT_SETTINGS.scope
  );

  let allowlistResult = null;
  let allowlistCalls = 0;
  threw = null;
  try {
    sandbox.KlickKleanSettingsStore.readAllowlist((v) => {
      allowlistCalls += 1;
      allowlistResult = v;
    });
  } catch (error) {
    threw = error;
  }
  ok("readAllowlist did not throw", threw === null, threw && threw.message);
  ok("readAllowlist called back exactly once", allowlistCalls === 1, "calls=" + allowlistCalls);
  ok("readAllowlist returned an empty list", JSON.stringify(allowlistResult) === "[]", JSON.stringify(allowlistResult));
}

console.log("\n[5] A failed read resolves the awaiting promise (#7)");
{
  // The service worker awaits the store through `new Promise((resolve) =>
  // readAllowlist(resolve))`. Before the fix the read threw inside Chrome's
  // callback, which left that promise unsettled and latched the operation
  // lock. Assert the promise now settles.
  const sandbox = loadStore();
  sandbox.chrome = makeChrome({ failSyncRead: true, failLocalRead: true });

  new Promise((resolve) => {
    const timer = setTimeout(() => resolve("HUNG"), 50);
    new Promise((r) => sandbox.KlickKleanSettingsStore.readAllowlist(r)).then((v) => {
      clearTimeout(timer);
      resolve(v);
    });
  }).then((settled) => {
    ok("the awaiting promise settled instead of hanging", settled !== "HUNG", String(settled));
    console.log("\n================ RESULT ================");
    console.log("PASS: " + pass + "  FAIL: " + fail);
    process.exit(fail === 0 ? 0 : 1);
  });
}
