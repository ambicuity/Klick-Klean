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

  console.log("\n[6] A custom time range can be configured and persisted (#2)");
  {
    const sandbox = loadOptions();
    const doc = sandbox.document;

    doc.getElementById("defaultTimeRange").value = "custom";
    doc.getElementById("customRangeStart").value = "2026-01-15T10:30";
    doc.getElementById("history").checked = true;
    doc.getElementById("settingsForm").dispatch("submit");

    ok("settings were written", sandbox.chrome.writes.sync.length === 1);
    const written = sandbox.chrome.writes.sync[0];
    ok(
      "the custom range was persisted",
      Boolean(written) && written.settings.timeRange === "custom",
      written && written.settings.timeRange
    );
    ok(
      "the custom range carries a usable start",
      Boolean(written) &&
        written.settings.customRange &&
        Number.isFinite(written.settings.customRange.start) &&
        written.settings.customRange.start > 0,
      written && JSON.stringify(written.settings.customRange)
    );

    const plan = sandbox.KlickKleanRequestBuilder.buildCleanupPlan(
      {
        categories: written.settings.categories,
        timeRange: written.settings.timeRange,
        customRange: written.settings.customRange,
        scope: written.settings.scope
      },
      { activeOrigin: "" }
    );
    ok(
      "the persisted settings produce a runnable plan",
      plan.errors.length === 0,
      JSON.stringify(plan.errors)
    );
    ok(
      "the plan applies the custom start",
      typeof plan.removeOptions.since === "number" && plan.removeOptions.since > 0,
      JSON.stringify(plan.removeOptions)
    );
  }

  console.log("\n[7] A custom range without a start is refused, not persisted (#2)");
  {
    const sandbox = loadOptions();
    const doc = sandbox.document;

    doc.getElementById("defaultTimeRange").value = "custom";
    doc.getElementById("customRangeStart").value = "";
    doc.getElementById("history").checked = true;
    doc.getElementById("settingsForm").dispatch("submit");

    ok("nothing was written", sandbox.chrome.writes.sync.length === 0, "writes=" + sandbox.chrome.writes.sync.length);
    ok(
      "the user is told what is missing",
      textOf(doc.getElementById("status")).indexOf("valid custom range") !== -1,
      JSON.stringify(textOf(doc.getElementById("status")))
    );
  }

  console.log("\n[8] A stored custom range without bounds heals to all-time (#2)");
  {
    // Settings persisted by the broken 1.0.1 build: timeRange "custom" with
    // no customRange. That combination used to make every cleanup fail.
    const sandbox = loadOptions({
      sync: {
        settings: {
          categories: { history: true },
          timeRange: "custom",
          customRange: null,
          scope: "global",
          origins: [],
          presetId: "",
          expertMode: false,
          uiPreferences: { notificationsEnabled: true }
        }
      }
    });

    const settings = await new Promise((resolve) => sandbox.KlickKleanSettingsStore.readSettings(resolve));
    ok(
      "the broken custom range fell back to all-time",
      settings.timeRange === "allTime",
      settings.timeRange
    );

    const plan = sandbox.KlickKleanRequestBuilder.buildCleanupPlan(
      {
        categories: settings.categories,
        timeRange: settings.timeRange,
        customRange: settings.customRange,
        scope: settings.scope
      },
      { activeOrigin: "" }
    );
    ok("the healed settings produce a runnable plan", plan.errors.length === 0, JSON.stringify(plan.errors));
  }

  console.log("\n[9] Selecting a preset applies it in the options page (#4)");
  {
    const sandbox = loadOptions();
    const doc = sandbox.document;

    const select = doc.getElementById("defaultPreset");
    select.value = "quickPrivacy";
    select.dispatch("change");

    ok(
      "the preset selected its categories",
      doc.getElementById("history").checked === true && doc.getElementById("cookies").checked === true,
      "history=" + doc.getElementById("history").checked + " cookies=" + doc.getElementById("cookies").checked
    );
    ok(
      "categories outside the preset stayed unchecked",
      doc.getElementById("indexedDB").checked === false,
      "indexedDB=" + doc.getElementById("indexedDB").checked
    );
    ok(
      "the preset applied its time range",
      doc.getElementById("defaultTimeRange").value === "last24h",
      doc.getElementById("defaultTimeRange").value
    );

    doc.getElementById("settingsForm").dispatch("submit");
    const written = sandbox.chrome.writes.sync[0];
    ok(
      "the preset categories were persisted",
      Boolean(written) &&
        written.settings.categories.history === true &&
        written.settings.categories.cookies === true &&
        written.settings.categories.indexedDB === false,
      written && JSON.stringify(written.settings.categories)
    );
    ok(
      "the preset time range was persisted",
      Boolean(written) && written.settings.timeRange === "last24h",
      written && written.settings.timeRange
    );
    ok(
      "the preset id was persisted",
      Boolean(written) && written.settings.presetId === "quickPrivacy",
      written && written.settings.presetId
    );
  }

  console.log("\n[10] Selecting a preset applies it in the popup (#4)");
  {
    const sandbox = loadPopup();
    const doc = sandbox.document;
    await tick();

    const select = doc.getElementById("presetSelect");
    select.value = "fixBrokenWebsite";
    select.dispatch("change");

    ok(
      "the preset selected its categories",
      doc.getElementById("opt-cookies").checked === true &&
        doc.getElementById("opt-cacheStorage").checked === true,
      "cookies=" + doc.getElementById("opt-cookies").checked
    );
    ok(
      "categories outside the preset stayed unchecked",
      doc.getElementById("opt-history").checked === false,
      "history=" + doc.getElementById("opt-history").checked
    );

    // Every preset touches a high-risk category, so the confirmation step is
    // part of the flow.
    doc.getElementById("clean").dispatch("click");
    doc.getElementById("confirmRisk").checked = true;
    doc.getElementById("confirmRisk").dispatch("change");
    doc.getElementById("confirmRun").dispatch("click");

    ok("a cleanup request was sent", sandbox.chrome.sentMessages.length === 1);
    const sent = sandbox.chrome.sentMessages[0];
    ok(
      "the request used the preset categories",
      Boolean(sent) && sent.categories.cookies === true && sent.categories.cacheStorage === true,
      sent && JSON.stringify(sent.categories)
    );
    ok(
      "the request used the preset scope",
      Boolean(sent) && sent.scope === "currentSite",
      sent && sent.scope
    );
    ok(
      "the request carried the preset id",
      Boolean(sent) && sent.presetId === "fixBrokenWebsite",
      sent && sent.presetId
    );
  }

  console.log("\n[11] A manual edit is respected and keeps the preset's scope (#4)");
  {
    const sandbox = loadPopup();
    const doc = sandbox.document;
    await tick();

    const select = doc.getElementById("presetSelect");
    select.value = "fixBrokenWebsite";
    select.dispatch("change");
    ok("the preset is active", doc.getElementById("opt-cookies").checked === true);

    // Add one more category by hand.
    doc.getElementById("opt-history").checked = true;
    doc.getElementById("opt-history").dispatch("change");

    doc.getElementById("clean").dispatch("click");
    doc.getElementById("confirmRisk").checked = true;
    doc.getElementById("confirmRisk").dispatch("change");
    doc.getElementById("confirmRun").dispatch("click");

    const sent = sandbox.chrome.sentMessages[0];
    ok(
      "the manual addition was included",
      Boolean(sent) && sent.categories.history === true,
      sent && JSON.stringify(sent.categories)
    );
    ok(
      "the visible categories were used, not the preset's own list",
      Boolean(sent) && sent.categories.cookies === true,
      sent && JSON.stringify(sent.categories)
    );
    ok(
      "the preset still supplied the scope",
      Boolean(sent) && sent.scope === "currentSite",
      sent && sent.scope
    );
  }

  console.log("\n[12] An expert-only preset is not silently dropped (#4)");
  {
    const sandbox = loadOptions();
    const doc = sandbox.document;

    doc.getElementById("expertMode").checked = true;
    doc.getElementById("expertMode").dispatch("change");

    const select = doc.getElementById("defaultPreset");
    select.value = "fullWipe";
    select.dispatch("change");

    doc.getElementById("expertMode").checked = false;
    doc.getElementById("expertMode").dispatch("change");

    ok(
      "the expert-only preset is still selected",
      select.value === "fullWipe",
      "value=" + select.value
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
