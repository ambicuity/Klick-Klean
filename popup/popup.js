const { CLEANUP_ORDER, LABEL_KEYS, WARNING_KEYS, HIGH_RISK_KEYS, DEFAULT_SETTINGS, normalizeSettings } = KlickKleanPrefs;
const { readSettings, saveSettings, readAllowlist, normalizeOriginList } = KlickKleanSettingsStore;
const { EXCLUDE_SUPPORTED } = KlickKleanCapabilities;

let isRunning = false;
let pendingPayload = null;
let lastRunReport = null;
let currentSettings = null;
let currentAllowlist = [];

// Cache DOM references
const DOM = {
  status: null,
  reportList: null,
  reportSection: null,
  reportNote: null,
  reportLimitations: null,
  warningList: null,
  preview: null,
  items: null,
  confirmPanel: null,
  confirmRisk: null,
  confirmRun: null,
  backToReview: null,
  clean: null,
  savePrefs: null,
  cancel: null,
  currentOrigin: null,
  title: null,
  subtitle: null,
  warningHeader: null,
  incognitoNote: null,
  permissionSummary: null,
  permissionBody: null,
  confirmHeading: null,
  confirmBody: null
};

function initDOM() {
  DOM.status = document.getElementById("status");
  DOM.reportList = document.getElementById("reportList");
  DOM.reportSection = document.getElementById("reportSection");
  DOM.reportNote = document.getElementById("reportNote");
  DOM.reportLimitations = document.getElementById("reportLimitations");
  DOM.warningList = document.getElementById("warningList");
  DOM.preview = document.getElementById("preview");
  DOM.items = document.getElementById("items");
  DOM.confirmPanel = document.getElementById("confirmPanel");
  DOM.confirmRisk = document.getElementById("confirmRisk");
  DOM.confirmRun = document.getElementById("confirmRun");
  DOM.backToReview = document.getElementById("backToReview");
  DOM.clean = document.getElementById("clean");
  DOM.savePrefs = document.getElementById("savePrefs");
  DOM.cancel = document.getElementById("cancel");
  DOM.currentOrigin = document.getElementById("currentOrigin");
  DOM.title = document.getElementById("title");
  DOM.subtitle = document.getElementById("subtitle");
  DOM.warningHeader = document.getElementById("warningHeader");
  DOM.incognitoNote = document.getElementById("incognitoNote");
  DOM.permissionSummary = document.getElementById("permissionSummary");
  DOM.permissionBody = document.getElementById("permissionBody");
  DOM.confirmHeading = document.getElementById("confirmHeading");
  DOM.confirmBody = document.getElementById("confirmBody");
}

function setStatus(messageKeyOrText, variant) {
  const text = messageKeyOrText.includes(" ") ? messageKeyOrText : i18nT(messageKeyOrText);
  DOM.status.className = `status status--${variant}`;
  DOM.status.textContent = text;
}

function selectedCategories() {
  const categories = {};
  for (const key of CLEANUP_ORDER) {
    categories[key] = Boolean(document.getElementById(`opt-${key}`)?.checked);
  }
  return categories;
}

function hasHighRiskSelection(categories) {
  return HIGH_RISK_KEYS.some((key) => categories[key]);
}

function getScopeLabel(scope) {
  if (scope === "currentSite") return i18nT("scopeCurrentSite");
  if (scope === "selectedSites") return i18nT("scopeSelectedSites");
  return i18nT("scopeGlobal");
}

function buildPreviewText(input) {
  const totalSelected = Number(input.totalSelected || 0);
  const scope = input.scope || "global";
  const range = input.range || "allTime";
  const allowlistSupportedCount = Number(input.allowlistSupportedCount || 0);

  const allowlistNote = scope === "global"
    ? i18nT("previewAllowlistApplies", [allowlistSupportedCount, totalSelected])
    : i18nT("previewAllowlistIgnored");

  return `${i18nT("previewSelectedCategories")}: ${totalSelected} | ${i18nT("previewScope")}: ${getScopeLabel(scope)} | ${i18nT("previewRange")}: ${range}. ${allowlistNote}`;
}

function setActionState(disabled) {
  DOM.clean.disabled = disabled;
  DOM.savePrefs.disabled = disabled;
  DOM.cancel.disabled = disabled;
  DOM.confirmRun.disabled = disabled || !DOM.confirmRisk.checked;
  DOM.backToReview.disabled = disabled;
}

function renderReport(response) {
  const node = DOM.reportList;
  const section = DOM.reportSection;
  const noteNode = DOM.reportNote;
  const limitationsNode = DOM.reportLimitations;
  section.hidden = false;

  if (!response || !Array.isArray(response.categories) || response.categories.length === 0) {
    section.hidden = true;
    if (noteNode) noteNode.hidden = true;
    if (limitationsNode) limitationsNode.hidden = true;
    return;
  }

  const succeeded = [];
  const failed = [];
  const skipped = [];
  const unsupported = [];

  for (const item of response.categories) {
    const label = i18nT(LABEL_KEYS[item.name] || item.name);
    const entry = { label, reasonKey: item.reasonKey || "cleanupComplete", detail: item.detail || "" };

    if (item.status === "succeeded") {
      succeeded.push(entry);
    } else if (item.status === "failed") {
      failed.push(entry);
    } else if (item.status === "skipped" || item.status === "deprecated") {
      skipped.push(entry);
    } else if (item.status === "unsupported") {
      unsupported.push(entry);
    }
  }

  node.textContent = "";

  if (succeeded.length > 0) {
    const heading = document.createElement("li");
    heading.className = "report-group-heading report-group-heading--success";
    heading.textContent = i18nT("reportCleaned");
    node.appendChild(heading);
    for (const entry of succeeded) {
      const li = document.createElement("li");
      li.className = "report-item report-item--success";
      li.textContent = entry.label;
      node.appendChild(li);
    }
  }

  if (unsupported.length > 0) {
    const heading = document.createElement("li");
    heading.className = "report-group-heading report-group-heading--unsupported";
    heading.textContent = i18nT("reportSkipped");
    node.appendChild(heading);
    for (const entry of unsupported) {
      const li = document.createElement("li");
      li.className = "report-item report-item--unsupported";
      li.textContent = `${entry.label}: ${i18nT(entry.reasonKey)}`;
      node.appendChild(li);
    }
  }

  if (skipped.length > 0) {
    const heading = document.createElement("li");
    heading.className = "report-group-heading report-group-heading--skipped";
    heading.textContent = i18nT("reportNotApplicable");
    node.appendChild(heading);
    for (const entry of skipped) {
      const li = document.createElement("li");
      li.className = "report-item report-item--skipped";
      li.textContent = `${entry.label}: ${i18nT(entry.reasonKey)}`;
      node.appendChild(li);
    }
  }

  if (failed.length > 0) {
    const heading = document.createElement("li");
    heading.className = "report-group-heading report-group-heading--failed";
    heading.textContent = i18nT("reportFailed");
    node.appendChild(heading);
    for (const entry of failed) {
      const li = document.createElement("li");
      li.className = "report-item report-item--failed";
      li.textContent = `${entry.label}: ${i18nT(entry.reasonKey)}`;
      node.appendChild(li);
    }
  }

  if (noteNode) {
    noteNode.hidden = false;
    noteNode.textContent = i18nT("reportHonestyNote");
  }

  if (limitationsNode && response.limitations && response.limitations.length > 0) {
    limitationsNode.hidden = false;
    limitationsNode.textContent = "";
    const heading = document.createElement("strong");
    heading.textContent = i18nT("reportLimitationsHeading");
    limitationsNode.appendChild(heading);
    const ul = document.createElement("ul");
    for (const lim of response.limitations) {
      const li = document.createElement("li");
      li.textContent = i18nT(lim.messageKey);
      ul.appendChild(li);
    }
    limitationsNode.appendChild(ul);
  } else if (limitationsNode) {
    limitationsNode.hidden = true;
  }
}

function renderPreview() {
  const categories = selectedCategories();
  const selected = CLEANUP_ORDER.filter((key) => categories[key]);
  const preview = DOM.preview;

  if (!currentSettings) {
    preview.textContent = i18nT("popupNoWarning");
    DOM.clean.disabled = true;
    return;
  }

  if (selected.length === 0) {
    preview.textContent = i18nT("popupNoWarning");
    DOM.clean.disabled = true;
    return;
  }

  if (!isRunning) {
    DOM.clean.disabled = false;
  }

  const allowlistSupportedCount = selected.filter((key) => EXCLUDE_SUPPORTED.has(key)).length;
  preview.textContent = buildPreviewText({
    totalSelected: selected.length,
    scope: currentSettings.scope,
    range: currentSettings.timeRange,
    allowlistSupportedCount
  });
}

function renderWarnings() {
  const warningList = DOM.warningList;
  warningList.textContent = "";

  resetConfirmation();

  const selected = selectedCategories();
  const keys = CLEANUP_ORDER.filter((key) => selected[key]);

  if (keys.length === 0) {
    const li = document.createElement("li");
    li.textContent = i18nT("popupNoWarning");
    warningList.appendChild(li);
    DOM.clean.disabled = true;
    renderPreview();
    return;
  }

  if (!isRunning) {
    DOM.clean.disabled = false;
  }

  const fragment = document.createDocumentFragment();
  for (const key of keys) {
    const li = document.createElement("li");
    li.textContent = i18nT(WARNING_KEYS[key]);
    fragment.appendChild(li);
  }
  warningList.appendChild(fragment);
  renderPreview();
}

function renderCategoryItems(categories) {
  const container = DOM.items;
  container.textContent = "";

  const fragment = document.createDocumentFragment();
  for (const key of CLEANUP_ORDER) {
    const label = document.createElement("label");
    label.className = "check-row";
    if (HIGH_RISK_KEYS.includes(key)) {
      label.classList.add("check-row--highrisk");
    }

    const isDeprecated = !KlickKleanCapabilities.isCleanable(key) && key !== "tabs";
    if (isDeprecated) {
      label.classList.add("check-row--deprecated");
    }

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `opt-${key}`;
    checkbox.checked = Boolean(categories[key]);
    checkbox.setAttribute("aria-describedby", `warn-${key}`);
    if (isDeprecated) {
      checkbox.disabled = true;
      checkbox.setAttribute("aria-disabled", "true");
      checkbox.title = i18nT("deprecatedCategory");
    }
    checkbox.addEventListener("change", renderWarnings);

    const text = document.createElement("span");
    text.textContent = i18nT(LABEL_KEYS[key]);

    label.appendChild(checkbox);
    label.appendChild(text);
    fragment.appendChild(label);
  }

  container.appendChild(fragment);
}

function applySettingsToUI(settings, allowlistOrigins) {
  currentSettings = settings;
  currentAllowlist = allowlistOrigins;
  renderCategoryItems(settings.categories);
  renderWarnings();
}

function showConfirmation(payload) {
  pendingPayload = payload;
  DOM.confirmPanel.hidden = false;
  DOM.confirmRisk.checked = false;
  DOM.confirmRun.disabled = true;
  DOM.confirmRun.focus();
  setStatus("popupStatusNeedsConfirm", "warn");
}

function hideConfirmation() {
  pendingPayload = null;
  DOM.confirmPanel.hidden = true;
}

function resetConfirmation() {
  if (!DOM.confirmPanel.hidden) {
    DOM.confirmRisk.checked = false;
    DOM.confirmRun.disabled = true;
  }
}

function executeCleanup(payload) {
  if (isRunning) {
    setStatus("errorAlreadyRunning", "warn");
    return;
  }

  isRunning = true;
  setActionState(true);
  DOM.clean.classList.add("button--loading");
  setStatus("popupStatusRunning", "running");

  chrome.runtime.sendMessage(
    {
      type: "RUN_CLEANUP",
      ...payload
    },
    (response) => {
      isRunning = false;
      setActionState(false);
      DOM.clean.classList.remove("button--loading");
      renderWarnings();

      if (chrome.runtime.lastError) {
        setStatus("cleanupFailed", "error");
        return;
      }

      if (!response || response.ok === false) {
        setStatus(response?.messageKey || "cleanupFailed", "error");
      } else {
        const hasPartial = response.code === "CLEANUP_PARTIAL";
        setStatus(response.messageKey || "cleanupComplete", hasPartial ? "warn" : "success");
      }

      lastRunReport = response || null;
      renderReport(lastRunReport);
    }
  );
}

function resolveCurrentOriginBanner(url) {
  try {
    const parsed = new URL(url || "");
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return i18nT("currentSiteLabel") + " " + parsed.origin;
    }
  } catch (_error) {
    // noop
  }
  return i18nT("currentSiteUnavailable");
}

function assertRuntimeReady() {
  return Boolean(
    KlickKleanPrefs &&
    KlickKleanSettingsStore &&
    KlickKleanCapabilities
  );
}

document.addEventListener("DOMContentLoaded", () => {
  initDOM();

  if (!assertRuntimeReady()) {
    setStatus(i18nT("errorRuntimeFailed"), "error");
    return;
  }

  DOM.title.textContent = i18nT("popupTitle");
  DOM.subtitle.textContent = i18nT("popupSubtitle");
  DOM.warningHeader.textContent = i18nT("popupWarningHeader");
  DOM.incognitoNote.textContent = i18nT("popupIncognitoNote");
  DOM.permissionSummary.textContent = i18nT("popupPermissionSummary");
  DOM.permissionBody.textContent = i18nT("popupPermissionBody");
  DOM.cancel.textContent = i18nT("popupCancel");
  DOM.clean.textContent = i18nT("popupContinue");
  DOM.savePrefs.textContent = i18nT("popupSavePrefs");
  DOM.confirmHeading.textContent = i18nT("popupConfirmHeading");
  DOM.confirmBody.textContent = i18nT("popupConfirmBody");
  DOM.confirmRun.textContent = i18nT("popupConfirmRun");
  DOM.backToReview.textContent = i18nT("popupBackToReview");

  setStatus("popupStatusIdle", "idle");

  Promise.all([
    new Promise((resolve) => readSettings(resolve)),
    new Promise((resolve) => readAllowlist(resolve))
  ]).then(([settings, allowlist]) => {
    applySettingsToUI(settings || DEFAULT_SETTINGS, allowlist || []);
  });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs && tabs[0] && tabs[0].url ? tabs[0].url : "";
    DOM.currentOrigin.textContent = resolveCurrentOriginBanner(url);
  });

  DOM.cancel.addEventListener("click", () => {
    setStatus("popupStatusCancelled", "idle");
    window.close();
  });

  DOM.savePrefs.addEventListener("click", () => {
    if (!currentSettings) return;

    const updated = normalizeSettings({
      ...currentSettings,
      categories: selectedCategories()
    });

    saveSettings(updated, () => {
      currentSettings = updated;
      setStatus("optionsSaved", "success");
      renderPreview();
    });
  });

  DOM.clean.addEventListener("click", () => {
    if (isRunning || !currentSettings) {
      return;
    }

    const categories = selectedCategories();
    const payload = {
      categories,
      timeRange: currentSettings.timeRange,
      customRange: currentSettings.customRange,
      scope: currentSettings.scope,
      origins: currentSettings.origins,
      allowlistOrigins: currentAllowlist,
      presetId: currentSettings.presetId,
      expertMode: currentSettings.expertMode
    };

    if (hasHighRiskSelection(categories)) {
      showConfirmation(payload);
      return;
    }

    executeCleanup(payload);
  });

  DOM.confirmRisk.addEventListener("change", (event) => {
    DOM.confirmRun.disabled = !event.target.checked;
  });

  DOM.confirmRun.addEventListener("click", () => {
    if (!pendingPayload) {
      return;
    }

    const payload = pendingPayload;
    hideConfirmation();
    executeCleanup(payload);
  });

  DOM.backToReview.addEventListener("click", () => {
    hideConfirmation();
    DOM.clean.focus();
    setStatus("popupStatusIdle", "idle");
  });

  renderReport(null);

  DOM.reportSection.hidden = true;
});
