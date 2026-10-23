"use strict";

// Loads the extension runtime into a vm context against stubbed browser APIs.
//
// The surfaces (popup.js, options.js, sw.js) are plain scripts that attach
// themselves to globals, so the whole module graph can be replayed exactly
// the way Chrome loads it. This keeps the tests dependency-free while still
// exercising the real production code rather than a re-implementation.

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const { createDocument } = require("./dom-stub");

const ROOT = path.resolve(__dirname, "..", "..");

// importScripts() order from sw.js, plus presets.js (loaded by options.html).
const MODULE_ORDER = [
  "i18n.js",
  "shared/utils.js",
  "shared/preferences.js",
  "shared/settings-store.js",
  "cleanup/time-range.js",
  "cleanup/capability-matrix.js",
  "cleanup/request-builder.js",
  "cleanup/presets.js"
];

const EN_MESSAGES = JSON.parse(
  fs.readFileSync(path.join(ROOT, "_locales/en/messages.json"), "utf8")
);

// Mirrors chrome.i18n.getMessage: $1..$9 positional, $name$ named placeholders
// resolved through the entry's "placeholders" block.
function getMessage(key, substitutions) {
  const entry = EN_MESSAGES[key];
  if (!entry) return "";
  let message = String(entry.message || "");

  const subs = Array.isArray(substitutions)
    ? substitutions
    : substitutions == null
      ? []
      : [substitutions];

  const named = entry.placeholders || {};
  message = message.replace(/\$([A-Za-z_][A-Za-z0-9_]*)\$/g, (match, name) => {
    const placeholder = named[name];
    if (!placeholder) return match;
    const content = String(placeholder.content || "");
    const positional = content.match(/^\$([1-9])$/);
    if (!positional) return content;
    const value = subs[Number(positional[1]) - 1];
    return value == null ? "" : String(value);
  });

  message = message.replace(/\$([1-9])/g, (match, digit) => {
    const value = subs[Number(digit) - 1];
    return value == null ? "" : String(value);
  });

  return message;
}

function makeChrome(options = {}) {
  const runtime = { lastError: undefined };
  const state = {
    sync: Object.assign({}, options.sync),
    local: Object.assign({}, options.local)
  };
  const writes = { sync: [], local: [] };

  const tabsQuery = options.tabsQuery || (() => []);
  const windows = options.windows || {};
  const browsingData = options.browsingData || {};

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

  const chrome = {
    runtime: Object.assign(runtime, {
      onMessage: { addListener() {} },
      onInstalled: { addListener() {} },
      getURL: (p) => "chrome-extension://klickklean/" + p,
      openOptionsPage() {},
      sendMessage(message, callback) {
        chrome.sentMessages.push(message);
        if (typeof callback === "function") {
          callback(options.messageResponse || { ok: true, code: "CLEANUP_COMPLETE", categories: [] });
        }
      }
    }),
    i18n: {
      getMessage,
      getUILanguage: () => options.uiLanguage || "en-US"
    },
    storage: {
      sync: {
        get(defaults, callback) { read("sync", defaults, callback, options.failSyncRead); },
        set(items, callback) { write("sync", items, callback, options.failSyncWrite); }
      },
      local: {
        get(defaults, callback) { read("local", defaults, callback, options.failLocalRead); },
        set(items, callback) { write("local", items, callback, options.failLocalWrite); }
      }
    },
    tabs: {
      query(query, callback) {
        if (typeof query === "function") {
          callback(query);
          return;
        }
        callback(tabsQuery(query));
      }
    },
    windows: {
      create: windows.create || (() => Promise.resolve({ id: 999 })),
      getAll: windows.getAll || (() => Promise.resolve([])),
      remove: windows.remove || (() => Promise.resolve())
    },
    browsingData: {
      remove: browsingData.remove || (() => Promise.resolve())
    },
    notifications: {
      created: [],
      create(id, opts) {
        chrome.notifications.created.push({ id, opts });
      },
      clear() {},
      onClicked: { addListener() {} }
    }
  };

  chrome.state = state;
  chrome.writes = writes;
  chrome.sentMessages = [];
  return chrome;
}

function createRuntime(options = {}) {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.document = options.document || createDocument();
  sandbox.chrome = options.chrome || makeChrome(options.chromeOptions || {});
  sandbox.NodeFilter = { SHOW_TEXT: 4 };
  sandbox.window = { close() {} };

  for (const g of [
    "URL", "URLSearchParams", "Date", "Math", "JSON", "Set", "Map", "Array",
    "Object", "Number", "Boolean", "String", "Promise", "RegExp", "Error",
    "setTimeout", "clearTimeout"
  ]) {
    sandbox[g] = globalThis[g];
  }

  const context = vm.createContext(sandbox);
  const loaded = [];
  for (const rel of options.modules || MODULE_ORDER) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), context, { filename: rel });
    loaded.push(rel);
  }
  // Surface scripts (popup.js / options.js) must run in the same context as
  // the modules they depend on, so their top-level bindings resolve.
  for (const rel of options.extraModules || []) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), context, { filename: rel });
    loaded.push(rel);
  }

  sandbox.__loaded = loaded;
  return sandbox;
}

module.exports = { ROOT, MODULE_ORDER, makeChrome, createRuntime, getMessage };
