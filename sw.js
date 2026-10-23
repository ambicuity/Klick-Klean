importScripts(
  "i18n.js",
  "shared/utils.js",
  "shared/preferences.js",
  "shared/settings-store.js",
  "cleanup/time-range.js",
  "cleanup/capability-matrix.js",
  "cleanup/request-builder.js"
);

const { normalizeSettings } = KlickKleanPrefs;
const { readSettings, readAllowlist } = KlickKleanSettingsStore;
const { buildCleanupPlan } = KlickKleanRequestBuilder;
const { getChromeKey, isCleanable } = KlickKleanCapabilities;
const { normalizeOrigin } = KlickKleanUtils;

const OPERATION_LOCK_MS = 60000;
let cleanupLockAt = null;
let activeRunId = null;

function runId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createCategoryResult(name, status, reasonKey, detail) {
  return {
    name,
    status,
    reasonKey,
    detail: detail || ""
  };
}

function summarize(categoryResults) {
  let succeeded = 0;
  let failed = 0;
  let unsupported = 0;
  let skipped = 0;
  let attempted = 0;

  for (const item of categoryResults) {
    if (item.status === "succeeded") {
      succeeded += 1;
      attempted += 1;
    } else if (item.status === "failed") {
      failed += 1;
      attempted += 1;
    } else if (item.status === "unsupported") {
      unsupported += 1;
      attempted += 1;
    } else if (item.status === "skipped") {
      skipped += 1;
    }
  }

  return { attempted, succeeded, failed, skipped, unsupported };
}

function createNotification(titleKey, messageKey) {
  return new Promise((resolve) => {
    readSettings((settings) => {
      if (!settings.uiPreferences.notificationsEnabled) {
        resolve();
        return;
      }

      chrome.notifications.clear("klickklean");
      chrome.notifications.create("klickklean", {
        type: "basic",
        iconUrl: "static/icon-128.png",
        title: i18nT(titleKey),
        message: i18nT(messageKey)
      });
      resolve();
    });
  });
}

// Closes every window except a freshly created keeper window.
//
// Returns a structured result instead of swallowing failures: the caller has
// to be able to say "nothing was closed" truthfully (#5).
async function closeAllWindowsAndTabs() {
  let keeperId = null;
  try {
    const keeper = await chrome.windows.create({ url: "chrome://newtab/" });
    keeperId = keeper?.id;
    if (!keeperId) {
      throw new Error("Failed to create keeper window");
    }
  } catch (error) {
    console.error("closeAllWindowsAndTabs: failed to create keeper", error);
    return {
      ok: false,
      closed: 0,
      failed: 0,
      detail: error && error.message ? String(error.message) : ""
    };
  }

  let closed = 0;
  let failed = 0;

  try {
    const wins = await chrome.windows.getAll({ populate: false });

    await Promise.all(
      wins.map((win) => {
        if (win.id === keeperId) {
          return Promise.resolve(true);
        }
        return chrome.windows
          .remove(win.id)
          .then(() => {
            closed += 1;
            return true;
          })
          .catch((error) => {
            failed += 1;
            console.error("closeAllWindowsAndTabs: failed to remove window", win.id, error);
            return false;
          });
      })
    );
  } catch (error) {
    console.error("closeAllWindowsAndTabs: error removing windows", error);
    failed += 1;
  }

  return {
    ok: failed === 0,
    closed,
    failed,
    detail: failed > 0 ? `${failed} window(s) could not be closed` : ""
  };
}

function getActiveOrigin() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve("");
        return;
      }
      const tab = tabs && tabs[0];
      const url = tab?.url || "";
      try {
        const parsed = new URL(url);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          resolve(parsed.origin);
          return;
        }
      } catch (_error) {
        // noop
      }
      resolve("");
    });
  });
}

// Resolves the origin that scoped cleanup should target.
//
// The popup resolves it from the window the user actually interacted with and
// passes it along. A service worker has no "current window", so its own
// tabs.query can resolve to a different window's active tab -- which would
// mean deleting a different site than the one the user confirmed (#6).
// The supplied origin therefore wins; the lookup is only a fallback.
function resolveActiveOrigin(message) {
  const supplied = normalizeOrigin(
    message && typeof message.activeOrigin === "string" ? message.activeOrigin : ""
  );
  if (supplied) {
    return Promise.resolve(supplied);
  }
  return getActiveOrigin();
}

async function executeRemoval(options, dataToRemove, resultArray) {
  const keys = Object.keys(dataToRemove || {});
  if (keys.length === 0) {
    return;
  }

  // Chrome API truth audit: only send keys that Chrome's browsingData API actually supports.
  // Map internal category names to Chrome API keys, skipping any that have no Chrome mapping.
  const chromeData = {};
  const skippedKeys = [];

  for (const key of keys) {
    const chromeKey = getChromeKey(key);
    if (chromeKey) {
      chromeData[chromeKey] = true;
    } else {
      skippedKeys.push(key);
    }
  }

  // Report skipped keys (categories with no Chrome API mapping) as unsupported
  for (const key of skippedKeys) {
    resultArray.push(createCategoryResult(key, "unsupported", "partialUnsupported"));
  }

  if (Object.keys(chromeData).length === 0) {
    return;
  }

  try {
    await chrome.browsingData.remove(options, chromeData);
    for (const key of keys) {
      if (!skippedKeys.includes(key)) {
        resultArray.push(createCategoryResult(key, "succeeded", "cleanupComplete"));
      }
    }
  } catch (error) {
    const detail = error && error.message ? String(error.message) : "";
    for (const key of keys) {
      if (!skippedKeys.includes(key)) {
        resultArray.push(createCategoryResult(key, "failed", "cleanupFailed", detail));
      }
    }
  }
}

function validatePayload(message) {
  if (!message || typeof message !== "object") {
    return { ok: false, code: "INVALID_REQUEST", messageKey: "errorInvalidRequest" };
  }

  const rules = [
    { key: "categories", type: "object" },
    { key: "timeRange", type: "string" },
    { key: "scope", type: "string" },
    { key: "origins", type: "array" },
    { key: "allowlistOrigins", type: "array" },
    { key: "expertMode", type: "boolean" },
    { key: "activeOrigin", type: "string" }
  ];

  for (const rule of rules) {
    const value = message[rule.key];
    if (value == null) continue;

    let valid = false;
    switch (rule.type) {
      case "object":
        valid = typeof value === "object" && !Array.isArray(value);
        break;
      case "string":
        valid = typeof value === "string";
        break;
      case "array":
        valid = Array.isArray(value);
        break;
      case "boolean":
        valid = typeof value === "boolean";
        break;
    }

    if (!valid) {
      return { ok: false, code: "INVALID_REQUEST", messageKey: "errorInvalidRequest" };
    }
  }

  return { ok: true };
}

function parseRequest(message, fallbackSettings, allowlistOrigins) {
  const validated = validatePayload(message);
  if (!validated.ok) {
    return validated;
  }

  const suppliedSettings = normalizeSettings({
    ...fallbackSettings,
    categories: message.categories || message.preferences || fallbackSettings.categories,
    timeRange: message.timeRange || fallbackSettings.timeRange,
    customRange: message.customRange || fallbackSettings.customRange,
    scope: message.scope || fallbackSettings.scope,
    origins: Array.isArray(message.origins) ? message.origins : fallbackSettings.origins,
    expertMode: message.expertMode ?? fallbackSettings.expertMode
  });

  const categoriesSelected = Object.values(suppliedSettings.categories).some(Boolean);
  if (!categoriesSelected) {
    return { ok: false, code: "NO_SELECTION", messageKey: "errorNoSelection" };
  }

  return {
    ok: true,
    settings: suppliedSettings,
    allowlistOrigins: Array.isArray(message.allowlistOrigins) && message.allowlistOrigins.length > 0
      ? message.allowlistOrigins
      : allowlistOrigins
  };
}

async function handleCleanup(message) {
  if (cleanupLockAt && Date.now() - cleanupLockAt < OPERATION_LOCK_MS) {
    return {
      ok: false,
      code: "CLEANUP_IN_PROGRESS",
      messageKey: "errorAlreadyRunning",
      runId: activeRunId || ""
    };
  }

  cleanupLockAt = Date.now();
  activeRunId = runId();

  let effectiveOrigin = "";

  try {
    effectiveOrigin = await resolveActiveOrigin(message);
    const fallbackSettings = await new Promise((resolve) => readSettings(resolve));
    const allowlistOrigins = await new Promise((resolve) => readAllowlist(resolve));

    const parsed = parseRequest(message, fallbackSettings, allowlistOrigins);
    if (!parsed.ok) {
      return { ok: false, code: parsed.code, messageKey: parsed.messageKey, runId: activeRunId };
    }

    await createNotification("notifyStartTitle", "notifyStartBody");

    const plan = buildCleanupPlan(
      {
        categories: parsed.settings.categories,
        timeRange: parsed.settings.timeRange,
        customRange: parsed.settings.customRange,
        scope: parsed.settings.scope,
        origins: parsed.settings.origins,
        allowlistOrigins: parsed.allowlistOrigins
      },
      { activeOrigin: effectiveOrigin }
    );

    if (plan.errors.length > 0) {
      return {
        ok: false,
        code: plan.errors[0].code,
        messageKey: plan.errors[0].messageKey || "errorInvalidRequest",
        runId: activeRunId,
        summary: { attempted: 0, succeeded: 0, failed: 0, skipped: 0, unsupported: 0 },
        categories: [],
        warnings: plan.warnings,
        limitations: plan.limitations,
        activeOrigin: effectiveOrigin
      };
    }

    const categoryResults = [];
    const warnings = [...plan.warnings];
    const limitations = [...plan.limitations];

    for (const key of plan.selected) {
      if (plan.selectedStates[key] === "skipped") {
        categoryResults.push(createCategoryResult(key, "skipped", "partialUnsupported"));
      } else if (plan.selectedStates[key] === "deprecated") {
        categoryResults.push(createCategoryResult(key, "skipped", "deprecatedCategory"));
      }
    }

    if (plan.hasTabsAction) {
      const tabsResult = await closeAllWindowsAndTabs();
      if (tabsResult.ok) {
        categoryResults.push(createCategoryResult("tabs", "succeeded", "tabsClosedResult"));
      } else {
        categoryResults.push(
          createCategoryResult("tabs", "failed", "tabsCloseFailed", tabsResult.detail)
        );
      }
    }

    for (const key of Object.keys(plan.globalOnlyData)) {
      categoryResults.push(createCategoryResult(key, "unsupported", "warningScopedUnsupported"));
    }

    await executeRemoval(plan.removeOptions, plan.removeData, categoryResults);

    const summary = summarize(categoryResults);
    const hasAnySuccess = summary.succeeded > 0;
    const hasAnyFailure = summary.failed > 0;
    const hasMixed = hasAnyFailure || summary.unsupported > 0 || summary.skipped > 0;

    await createNotification("notifyCompleteTitle", "notifyCompleteBody");

    return {
      ok: hasAnySuccess && !hasAnyFailure,
      runId: activeRunId,
      code: hasMixed ? "CLEANUP_PARTIAL" : "CLEANUP_COMPLETE",
      messageKey: hasMixed ? "partialUnsupported" : "cleanupComplete",
      summary,
      categories: categoryResults,
      warnings,
      limitations,
      activeOrigin: effectiveOrigin
    };
  } catch (error) {
    return {
      ok: false,
      code: "CLEANUP_FAILED",
      messageKey: "cleanupFailed",
      detail: error && error.message ? String(error.message) : "",
      runId: activeRunId,
      summary: { attempted: 0, succeeded: 0, failed: 1, skipped: 0, unsupported: 0 },
      categories: [],
      warnings: [],
      limitations: [],
      activeOrigin: effectiveOrigin
    };
  } finally {
    cleanupLockAt = null;
    activeRunId = null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    sendResponse({ ok: false, code: "INVALID_REQUEST", messageKey: "errorInvalidRequest" });
    return;
  }

  if (message.type !== "RUN_CLEANUP") {
    sendResponse({ ok: false, code: "UNKNOWN_MESSAGE", messageKey: "errorUnknownMessage" });
    return;
  }

  handleCleanup(message).then(sendResponse);
  return true;
});

chrome.notifications.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
  chrome.notifications.clear("klickklean");
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/welcome.html") });
  }
});
