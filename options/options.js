const { CLEANUP_ORDER, LABEL_KEYS, DEFAULT_SETTINGS, normalizeSettings, HIGH_RISK_KEYS } = KlickKleanPrefs;
const { readSettings, saveSettings, readAllowlist, saveAllowlist, normalizeOriginList } = KlickKleanSettingsStore;
const { TIME_RANGES } = KlickKleanTimeRange;
const { PRESETS, getPreset } = KlickKleanPresets;


function assertRuntimeReady() {
  return Boolean(KlickKleanPrefs && KlickKleanSettingsStore && KlickKleanTimeRange && KlickKleanPresets);
}

function renderPreferenceItems(categories) {
  const list = document.getElementById("preferenceList");
  list.innerHTML = "";

  const fragment = document.createDocumentFragment();
  for (const key of CLEANUP_ORDER) {
    const li = document.createElement("li");

    const label = document.createElement("label");
    label.className = "row row--checkbox";
    if (HIGH_RISK_KEYS.includes(key)) {
      label.classList.add("row--highrisk");
    }

    const isDeprecated = !KlickKleanCapabilities.isCleanable(key) && key !== "tabs";
    if (isDeprecated) {
      label.classList.add("row--deprecated");
    }
    label.setAttribute("for", key);

    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = key;
    input.checked = Boolean(categories[key]);
    if (isDeprecated) {
      input.disabled = true;
      input.setAttribute("aria-disabled", "true");
      input.title = i18nT("deprecatedCategory");
    }

    const text = document.createElement("span");
    text.textContent = i18nT(LABEL_KEYS[key]);
    if (isDeprecated) {
      text.style.opacity = "0.6";
    }

    label.appendChild(input);
    label.appendChild(text);
    li.appendChild(label);
    fragment.appendChild(li);
  }

  list.appendChild(fragment);

  if (list.childElementCount === 0) {
    const li = document.createElement("li");
    li.className = "row";
    li.textContent = "Cleanup categories failed to render.";
    list.appendChild(li);
  }
}

function getSelectedCategories() {
  const prefs = {};
  for (const key of CLEANUP_ORDER) {
    prefs[key] = Boolean(document.getElementById(key)?.checked);
  }
  return prefs;
}

function renderPresetOptions(expertMode) {
  const select = document.getElementById("defaultPreset");
  if (!select) return;

  select.innerHTML = "";

  const manualOption = document.createElement("option");
  manualOption.value = "";
  manualOption.textContent = i18nT("optionsManualSelection");
  select.appendChild(manualOption);

  for (const preset of Object.values(PRESETS)) {
    if (preset.expertOnly && !expertMode) {
      continue;
    }
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = i18nT(preset.labelKey);
    select.appendChild(option);
  }

  updatePresetDescription();
}

function updatePresetDescription() {
  const select = document.getElementById("defaultPreset");
  const descNode = document.getElementById("presetDescription");
  const riskNode = document.getElementById("presetRisk");
  if (!select || !descNode) return;

  const presetId = select.value;
  const preset = presetId ? getPreset(presetId) : null;

  if (!preset) {
    descNode.textContent = "";
    descNode.hidden = true;
    if (riskNode) {
      riskNode.hidden = true;
      riskNode.className = "preset-risk";
    }
    return;
  }

  descNode.hidden = false;
  descNode.textContent = i18nT(preset.description);

  if (riskNode) {
    riskNode.hidden = false;
    const riskText = preset.riskLevel === "high" ? i18nT("presetRiskHigh") : (preset.riskLevel === "medium" ? i18nT("presetRiskMedium") : i18nT("presetRiskLow"));
    riskNode.textContent = riskText;
    riskNode.className = `preset-risk preset-risk--${preset.riskLevel}`;
  }
}

function renderRangeOptions() {
  const select = document.getElementById("defaultTimeRange");
  if (!select) return;

  const options = [
    [TIME_RANGES.LAST_HOUR, i18nT("timeRangeLastHour")],
    [TIME_RANGES.LAST_24_HOURS, i18nT("timeRangeLast24Hours")],
    [TIME_RANGES.LAST_7_DAYS, i18nT("timeRangeLast7Days")],
    [TIME_RANGES.LAST_4_WEEKS, i18nT("timeRangeLast4Weeks")],
    [TIME_RANGES.ALL_TIME, i18nT("timeRangeAllTime")],
    [TIME_RANGES.CUSTOM, i18nT("timeRangeCustom")]
  ];

  select.innerHTML = "";
  for (const [value, label] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
}

function renderScopeOptions() {
  const select = document.getElementById("defaultScope");
  if (!select) return;

  const options = [
    ["global", i18nT("scopeGlobal")],
    ["currentSite", i18nT("scopeCurrentSite")],
    ["selectedSites", i18nT("scopeSelectedSites")]
  ];

  select.innerHTML = "";
  for (const [value, label] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
}

// The custom range only applies when the selected range is "custom".
function syncCustomRangeVisibility() {
  const select = document.getElementById("defaultTimeRange");
  const field = document.getElementById("customRangeField");
  if (!select || !field) return;
  field.hidden = select.value !== TIME_RANGES.CUSTOM;
}

// <input type="datetime-local"> uses a local "YYYY-MM-DDTHH:mm" value.
function toDateTimeLocalValue(timestamp) {
  if (!Number.isFinite(Number(timestamp)) || Number(timestamp) <= 0) return "";
  const date = new Date(Number(timestamp));
  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getFullYear() +
    "-" + pad(date.getMonth() + 1) +
    "-" + pad(date.getDate()) +
    "T" + pad(date.getHours()) +
    ":" + pad(date.getMinutes())
  );
}

// Returns the custom range start in epoch milliseconds, or null when the
// field is empty or unparsable.
function readCustomRangeStart() {
  const field = document.getElementById("customRangeStart");
  const raw = field && typeof field.value === "string" ? field.value.trim() : "";
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

document.addEventListener("DOMContentLoaded", () => {
  const status = document.getElementById("status");

  if (!assertRuntimeReady()) {
    status.textContent = i18nT("errorRuntimeFailed");
    status.className = "status status--warn";
    return;
  }

  renderPresetOptions(false);
  renderRangeOptions();
  renderScopeOptions();

  readSettings((settings) => {
    const normalized = normalizeSettings(settings || DEFAULT_SETTINGS);
    renderPreferenceItems(normalized.categories);
    renderPresetOptions(Boolean(normalized.expertMode));
    document.getElementById("defaultPreset").value = normalized.presetId || "";
    document.getElementById("notificationsEnabled").checked = Boolean(normalized.uiPreferences.notificationsEnabled);
    document.getElementById("defaultTimeRange").value = normalized.timeRange;
    document.getElementById("defaultScope").value = normalized.scope;
    document.getElementById("defaultOrigins").value = (normalized.origins || []).join("\n");
    document.getElementById("expertMode").checked = Boolean(normalized.expertMode);
    const customRangeStart = document.getElementById("customRangeStart");
    if (customRangeStart) {
      customRangeStart.value = toDateTimeLocalValue(normalized.customRange?.start);
    }
    syncCustomRangeVisibility();
  });

  readAllowlist((origins) => {
    const field = document.getElementById("allowlistOrigins");
    if (field) {
      field.value = normalizeOriginList(origins).join("\n");
    }
  });

  document.getElementById("expertMode").addEventListener("change", (event) => {
    const currentPreset = document.getElementById("defaultPreset").value;
    renderPresetOptions(Boolean(event.target.checked));
    document.getElementById("defaultPreset").value = currentPreset;
    updatePresetDescription();
  });

  document.getElementById("defaultPreset").addEventListener("change", updatePresetDescription);

  document.getElementById("defaultTimeRange").addEventListener("change", syncCustomRangeVisibility);

  document.getElementById("settingsForm").addEventListener("submit", (event) => {
    event.preventDefault();

    const selectedTimeRange = document.getElementById("defaultTimeRange").value;

    // A custom range is only usable with a valid start. Refuse to persist a
    // "custom" range without one -- that combination can never be executed
    // and would break every later cleanup run (#2).
    let customRange = null;
    if (selectedTimeRange === TIME_RANGES.CUSTOM) {
      const customStart = readCustomRangeStart();
      if (!customStart) {
        status.textContent = i18nT("optionsCustomRangeInvalid");
        status.className = "status status--warn";
        return;
      }
      customRange = { start: customStart, end: null };
    }

    const rawOrigins = (document.getElementById("defaultOrigins").value || "")
      .split(/\n|,/)
      .map((v) => v.trim())
      .filter(Boolean);

    const normalizedOrigins = normalizeOriginList(rawOrigins);

    const settings = normalizeSettings({
      categories: getSelectedCategories(),
      timeRange: selectedTimeRange,
      customRange,
      scope: document.getElementById("defaultScope").value,
      origins: normalizedOrigins,
      presetId: document.getElementById("defaultPreset").value,
      expertMode: Boolean(document.getElementById("expertMode").checked),
      uiPreferences: {
        notificationsEnabled: Boolean(document.getElementById("notificationsEnabled").checked)
      }
    });

    const rawAllowlist = (document.getElementById("allowlistOrigins").value || "")
      .split(/\n|,/)
      .map((v) => v.trim())
      .filter(Boolean);

    const allowlist = normalizeOriginList(rawAllowlist);
    if (rawAllowlist.length > 0 && allowlist.length === 0) {
      status.textContent = i18nT("optionsAllowlistInvalid");
      status.className = "status status--warn";
      return;
    }

    const droppedOrigins = rawOrigins.length - normalizedOrigins.length;
    const droppedAllowlist = rawAllowlist.length - allowlist.length;
    const totalDropped = droppedOrigins + droppedAllowlist;
    const totalRaw = rawOrigins.length + rawAllowlist.length;

    saveSettings(settings, (_saved, saveError) => {
      if (saveError) {
        status.textContent = i18nT("optionsSaveFailed");
        status.className = "status status--warn";
        return;
      }

      saveAllowlist(allowlist, (savedAllowlist, allowlistError) => {
        if (allowlistError) {
          status.textContent = i18nT("optionsSaveFailed");
          status.className = "status status--warn";
          return;
        }

        document.getElementById("defaultOrigins").value = normalizedOrigins.join("\n");
        document.getElementById("allowlistOrigins").value = savedAllowlist.join("\n");

        if (totalDropped > 0) {
          status.textContent = i18nT("originsDroppedWarning", [totalDropped, totalRaw]);
          status.className = "status status--warn";
        } else {
          status.textContent = i18nT("optionsSaved");
          status.className = "status status--success";
        }

        setTimeout(() => {
          status.textContent = "";
          status.className = "status";
        }, 1500);
      });
    });
  });
});
