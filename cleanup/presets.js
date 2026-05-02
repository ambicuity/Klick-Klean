(function attachPresets(globalScope) {
  const { CLEANUP_ORDER } = globalScope.KlickKleanPrefs || {};
  const { TIME_RANGES } = globalScope.KlickKleanTimeRange || {};

  function boolMap(enabledKeys) {
    const map = {};
    for (const key of CLEANUP_ORDER || []) {
      map[key] = enabledKeys.includes(key);
    }
    return map;
  }

  const RISK_LEVELS = {
    LOW: "low",
    MEDIUM: "medium",
    HIGH: "high"
  };

  const PRESET_IDS = {
    QUICK_PRIVACY: "quickPrivacy",
    FIX_BROKEN_SITE: "fixBrokenWebsite",
    LOGOUT_EVERYWHERE: "logoutEverywhere",
    STORAGE_RESET: "storageReset",
    DEV_RESET_CURRENT_SITE: "devResetCurrentSite",
    FULL_WIPE: "fullWipe"
  };

  const PRESETS = {
    [PRESET_IDS.QUICK_PRIVACY]: {
      id: PRESET_IDS.QUICK_PRIVACY,
      labelKey: "presetLabelQuickPrivacy",
      description: "presetDescQuickPrivacy",
      timeRange: TIME_RANGES.LAST_24_HOURS,
      scope: "global",
      categories: boolMap(["history", "cookies", "cache", "downloads", "formData"]),
      riskLevel: RISK_LEVELS.MEDIUM,
      expertOnly: false,
      requiresConfirmation: true
    },
    [PRESET_IDS.FIX_BROKEN_SITE]: {
      id: PRESET_IDS.FIX_BROKEN_SITE,
      labelKey: "presetLabelFixBrokenSite",
      description: "presetDescFixBrokenSite",
      timeRange: TIME_RANGES.ALL_TIME,
      scope: "currentSite",
      categories: boolMap(["cookies", "cache", "cacheStorage", "localStorage", "indexedDB", "serviceWorkers", "fileSystems", "webSQL"]),
      riskLevel: RISK_LEVELS.MEDIUM,
      expertOnly: false,
      requiresConfirmation: true
    },
    [PRESET_IDS.LOGOUT_EVERYWHERE]: {
      id: PRESET_IDS.LOGOUT_EVERYWHERE,
      labelKey: "presetLabelLogoutEverywhere",
      description: "presetDescLogoutEverywhere",
      timeRange: TIME_RANGES.ALL_TIME,
      scope: "global",
      categories: boolMap(["cookies"]),
      riskLevel: RISK_LEVELS.HIGH,
      expertOnly: false,
      requiresConfirmation: true
    },
    [PRESET_IDS.STORAGE_RESET]: {
      id: PRESET_IDS.STORAGE_RESET,
      labelKey: "presetLabelStorageReset",
      description: "presetDescStorageReset",
      timeRange: TIME_RANGES.ALL_TIME,
      scope: "global",
      categories: boolMap(["cacheStorage", "localStorage", "indexedDB", "fileSystems", "webSQL", "serviceWorkers", "cache"]),
      riskLevel: RISK_LEVELS.HIGH,
      expertOnly: false,
      requiresConfirmation: true
    },
    [PRESET_IDS.DEV_RESET_CURRENT_SITE]: {
      id: PRESET_IDS.DEV_RESET_CURRENT_SITE,
      labelKey: "presetLabelDevResetCurrentSite",
      description: "presetDescDevReset",
      timeRange: TIME_RANGES.ALL_TIME,
      scope: "currentSite",
      categories: boolMap(["cache", "cacheStorage", "localStorage", "indexedDB", "serviceWorkers", "fileSystems", "webSQL", "cookies"]),
      riskLevel: RISK_LEVELS.HIGH,
      expertOnly: false,
      requiresConfirmation: true
    },
    [PRESET_IDS.FULL_WIPE]: {
      id: PRESET_IDS.FULL_WIPE,
      labelKey: "presetLabelFullWipe",
      description: "presetDescFullWipe",
      timeRange: TIME_RANGES.ALL_TIME,
      scope: "global",
      categories: boolMap((CLEANUP_ORDER || []).filter((key) => key !== "tabs")),
      riskLevel: RISK_LEVELS.HIGH,
      expertOnly: true,
      requiresConfirmation: true
    }
  };

  function getPreset(presetId) {
    return PRESETS[presetId] || null;
  }

  function isHighRiskPreset(presetId) {
    const preset = PRESETS[presetId];
    if (!preset) return false;
    return preset.riskLevel === RISK_LEVELS.HIGH;
  }

  const api = {
    PRESET_IDS,
    PRESETS,
    RISK_LEVELS,
    getPreset,
    isHighRiskPreset
  };

  globalScope.KlickKleanPresets = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
