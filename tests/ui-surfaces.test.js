"use strict";

// Exercises the popup and options surfaces against the real production code.
//
// Both surfaces are plain scripts attached to globals, so they are replayed
// in a vm context against the stub DOM/browser APIs in ./helpers. This pins
// the behaviour the user actually sees: what gets saved, what gets reported,
// and what the confirmation flow allows.

const { createRuntime, makeChrome } = require("./helpers/runtime");
const { textOf } = require("./helpers/dom-stub");

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

function loadOptions(chromeOptions = {}) {
  const sandbox = createRuntime({
    chrome: makeChrome(chromeOptions),
    extraModules: ["options/options.js"]
  });
  sandbox.document.dispatch("DOMContentLoaded");
  return sandbox;
}

function loadPopup(chromeOptions = {}) {
  const sandbox = createRuntime({
    chrome: makeChrome(chromeOptions),
    extraModules: ["popup/popup.js"]
  });
  sandbox.document.dispatch("DOMContentLoaded");
  return sandbox;
}

// Lets the popup's Promise.all(settings, allowlist) settle.
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function main() {
  console.log("[1] The options page saves a successful write (#8)");
  {
    const sandbox = loadOptions();
    const doc = sandbox.document;

    doc.getElementById("defaultOrigins").value = "https://example.com";
    doc.getElementById("history").checked = true;
    doc.getElementById("cookies").checked = true;

    doc.getElementById("settingsForm").dispatch("submit");

    ok(
      "settings were written to chrome.storage.sync",
      sandbox.chrome.writes.sync.length === 1,
      "writes=" + sandbox.chrome.writes.sync.length
    );
    const written = sandbox.chrome.writes.sync[0];
    ok(
      "the selected categories were persisted",
      Boolean(written && written.settings.categories.history && written.settings.categories.cookies)
    );
    ok(
      "the origins were normalised and persisted",
      Boolean(written) && JSON.stringify(written.settings.origins) === JSON.stringify(["https://example.com"]),
      written && JSON.stringify(written.settings.origins)
    );
    ok(
      "the status says the settings were saved",
      textOf(doc.getElementById("status")) === "Settings saved!",
      JSON.stringify(textOf(doc.getElementById("status")))
    );
    ok(
      "the status uses the success variant",
      doc.getElementById("status").className === "status status--success",
      doc.getElementById("status").className
    );
  }

  console.log("\n[2] The options page reports a failed write instead of success (#8)");
  {
    const sandbox = loadOptions({ failSyncWrite: true });
    const doc = sandbox.document;

    doc.getElementById("history").checked = true;
    doc.getElementById("settingsForm").dispatch("submit");

    ok(
      "the status does not claim success",
      textOf(doc.getElementById("status")) !== "Settings saved!",
      JSON.stringify(textOf(doc.getElementById("status")))
    );
    ok(
      "the status explains the failure",
      textOf(doc.getElementById("status")).indexOf("could not be saved") !== -1,
      JSON.stringify(textOf(doc.getElementById("status")))
    );
    ok(
      "the status uses the warning variant",
      doc.getElementById("status").className === "status status--warn",
      doc.getElementById("status").className
    );
    ok(
      "nothing was written to storage",
      sandbox.chrome.writes.sync.length === 0,
      "writes=" + sandbox.chrome.writes.sync.length
    );
  }

  console.log("\n[3] A failed allowlist write is reported too (#8)");
  {
    const sandbox = loadOptions({ failLocalWrite: true });
    const doc = sandbox.document;

    doc.getElementById("allowlistOrigins").value = "https://keep.example";
    doc.getElementById("settingsForm").dispatch("submit");

    ok(
      "the status does not claim success",
      textOf(doc.getElementById("status")) !== "Settings saved!",
      JSON.stringify(textOf(doc.getElementById("status")))
    );
    ok(
      "the status explains the failure",
      textOf(doc.getElementById("status")).indexOf("could not be saved") !== -1,
      JSON.stringify(textOf(doc.getElementById("status")))
    );
  }

  console.log("\n[4] The popup reports a failed save instead of success (#8)");
  {
    const sandbox = loadPopup({ failSyncWrite: true });
    const doc = sandbox.document;
    await tick();

    doc.getElementById("opt-history").checked = true;
    doc.getElementById("savePrefs").dispatch("click");

    ok(
      "the status does not claim success",
      textOf(doc.getElementById("status")) !== "Settings saved!",
      JSON.stringify(textOf(doc.getElementById("status")))
    );
    ok(
      "the status explains the failure",
      textOf(doc.getElementById("status")).indexOf("could not be saved") !== -1,
      JSON.stringify(textOf(doc.getElementById("status")))
    );
  }

  console.log("\n[5] The popup reports a successful save (#8)");
  {
    const sandbox = loadPopup();
    const doc = sandbox.document;
    await tick();

    doc.getElementById("opt-history").checked = true;
    doc.getElementById("savePrefs").dispatch("click");

    ok(
      "the status says the settings were saved",
      textOf(doc.getElementById("status")) === "Settings saved!",
      JSON.stringify(textOf(doc.getElementById("status")))
    );
  }

  console.log("\n================ RESULT ================");
  console.log("PASS: " + pass + "  FAIL: " + fail);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
