"use strict";

// Drives the real service worker through its message listener.
//
// sw.js is replayed in a vm context with stubbed browser APIs, so the tests
// exercise the actual cleanup pipeline: request validation, planning, the
// window-closing action and the browsingData call.

const { createServiceWorkerRuntime, makeChrome } = require("./helpers/runtime");

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

function runCleanup(sandbox, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("service worker did not respond")), 2000);
    sandbox.chrome.runtime.listeners.message(
      Object.assign({ type: "RUN_CLEANUP" }, payload),
      {},
      (response) => {
        clearTimeout(timer);
        resolve(response);
      }
    );
  });
}

function categoryFor(response, name) {
  const categories = (response && response.categories) || [];
  return categories.find((c) => c.name === name) || null;
}

async function main() {
  console.log("[1] Closing windows is reported as failed when the keeper window fails (#5)");
  {
    const chrome = makeChrome({
      windows: {
        create: () => Promise.reject(new Error("window creation refused"))
      }
    });
    const sandbox = createServiceWorkerRuntime({ chrome });

    const response = await runCleanup(sandbox, { categories: { tabs: true } });
    const tabs = categoryFor(response, "tabs");

    ok("the tabs category is reported", Boolean(tabs), JSON.stringify(response && response.categories));
    ok("it is not reported as succeeded", Boolean(tabs) && tabs.status !== "succeeded", tabs && tabs.status);
    ok("it is reported as failed", Boolean(tabs) && tabs.status === "failed", tabs && tabs.status);
    ok(
      "the failure detail is preserved",
      Boolean(tabs) && tabs.detail.indexOf("window creation refused") !== -1,
      tabs && tabs.detail
    );
  }

  console.log("\n[2] A window that refuses to close is reported as failed (#5)");
  {
    const chrome = makeChrome({
      windows: {
        create: () => Promise.resolve({ id: 1 }),
        getAll: () => Promise.resolve([{ id: 1 }, { id: 2 }, { id: 3 }]),
        remove: (id) => (id === 2 ? Promise.reject(new Error("cannot close")) : Promise.resolve())
      }
    });
    const sandbox = createServiceWorkerRuntime({ chrome });

    const response = await runCleanup(sandbox, { categories: { tabs: true } });
    const tabs = categoryFor(response, "tabs");

    ok("it is reported as failed", Boolean(tabs) && tabs.status === "failed", tabs && tabs.status);
    ok(
      "the detail mentions the window count",
      Boolean(tabs) && tabs.detail.indexOf("1 window") !== -1,
      tabs && tabs.detail
    );
  }

  console.log("\n[3] A successful window close is still reported as succeeded (#5)");
  {
    const chrome = makeChrome({
      windows: {
        create: () => Promise.resolve({ id: 1 }),
        getAll: () => Promise.resolve([{ id: 1 }, { id: 2 }, { id: 3 }]),
        remove: () => Promise.resolve()
      }
    });
    const sandbox = createServiceWorkerRuntime({ chrome });

    const response = await runCleanup(sandbox, { categories: { tabs: true } });
    const tabs = categoryFor(response, "tabs");

    ok("it is reported as succeeded", Boolean(tabs) && tabs.status === "succeeded", tabs && tabs.status);
    ok(
      "the keeper window was not closed",
      chrome.windows.removed && chrome.windows.removed.indexOf(1) === -1,
      JSON.stringify(chrome.windows.removed)
    );
  }

  console.log("\n[4] A cleanup that cannot run is rejected before anything is deleted");
  {
    const chrome = makeChrome();
    const sandbox = createServiceWorkerRuntime({ chrome });

    const response = await runCleanup(sandbox, { categories: {} });
    ok("the run was rejected", response && response.ok === false, JSON.stringify(response));
    ok("no browsing data was removed", chrome.browsingData.calls.length === 0);
  }

  console.log("\n[5] The confirmed origin wins over the worker's own tab lookup (#6)");
  {
    const chrome = makeChrome({
      // The worker's own lookup resolves to a different site.
      tabsQuery: () => [{ id: 1, url: "https://other.example/page" }]
    });
    const sandbox = createServiceWorkerRuntime({ chrome });

    const response = await runCleanup(sandbox, {
      categories: { cookies: true, cache: true },
      scope: "currentSite",
      activeOrigin: "https://confirmed.example"
    });

    ok("the run succeeded", response && response.ok === true, JSON.stringify(response));
    ok(
      "the removal targeted the confirmed origin",
      chrome.browsingData.calls.length === 1 &&
        JSON.stringify(chrome.browsingData.calls[0].options.origins) === JSON.stringify(["https://confirmed.example"]),
      JSON.stringify(chrome.browsingData.calls[0] && chrome.browsingData.calls[0].options)
    );
    ok(
      "the worker did not run its own tab lookup",
      chrome.tabs.queries.length === 0,
      "queries=" + chrome.tabs.queries.length
    );
    ok(
      "the effective origin was reported back",
      Boolean(response) && response.activeOrigin === "https://confirmed.example",
      response && response.activeOrigin
    );
  }

  console.log("\n[6] The worker still falls back to its own lookup (#6)");
  {
    const chrome = makeChrome({
      tabsQuery: () => [{ id: 1, url: "https://fallback.example/page" }]
    });
    const sandbox = createServiceWorkerRuntime({ chrome });

    const response = await runCleanup(sandbox, {
      categories: { cookies: true },
      scope: "currentSite"
    });

    ok("the worker looked up the active tab", chrome.tabs.queries.length === 1, "queries=" + chrome.tabs.queries.length);
    ok(
      "the fallback origin was used",
      chrome.browsingData.calls.length === 1 &&
        JSON.stringify(chrome.browsingData.calls[0].options.origins) === JSON.stringify(["https://fallback.example"]),
      JSON.stringify(chrome.browsingData.calls[0] && chrome.browsingData.calls[0].options)
    );
    ok(
      "the effective origin was reported back",
      Boolean(response) && response.activeOrigin === "https://fallback.example",
      response && response.activeOrigin
    );
  }

  console.log("\n[7] A non-http origin is rejected as a scope target (#6)");
  {
    const chrome = makeChrome();
    const sandbox = createServiceWorkerRuntime({ chrome });

    const response = await runCleanup(sandbox, {
      categories: { cookies: true },
      scope: "currentSite",
      activeOrigin: "chrome://settings"
    });

    ok("the run was rejected", response && response.ok === false, JSON.stringify(response));
    ok("nothing was removed", chrome.browsingData.calls.length === 0);
  }

  console.log("\n================ RESULT ================");
  console.log("PASS: " + pass + "  FAIL: " + fail);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
