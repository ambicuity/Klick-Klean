(function attachSettingsStore(globalScope) {
  const { DEFAULT_SETTINGS, normalizeSettings } = globalScope.KlickKleanPrefs;
  const { normalizeOriginList } = globalScope.KlickKleanUtils || {};

  const SYNC_KEYS = {
    SETTINGS: "settings",
    LEGACY_PREFERENCES: "preferences",
    UI_PREFERENCES: "uiPreferences"
  };

  function fromStorageItems(items) {
    const sourceSettings = items?.[SYNC_KEYS.SETTINGS] || {};
    const legacy = items?.[SYNC_KEYS.LEGACY_PREFERENCES] || {};
    const ui = items?.[SYNC_KEYS.UI_PREFERENCES] || {};

    const merged = {
      ...DEFAULT_SETTINGS,
      ...sourceSettings,
      categories: sourceSettings.categories || sourceSettings.preferences || legacy,
      uiPreferences: {
        ...DEFAULT_SETTINGS.uiPreferences,
        ...sourceSettings.uiPreferences,
        ...ui
      }
    };

    return normalizeSettings(merged);
  }

  function readSettings(callback) {
    chrome.storage.sync.get(
      {
        [SYNC_KEYS.SETTINGS]: DEFAULT_SETTINGS,
        [SYNC_KEYS.LEGACY_PREFERENCES]: DEFAULT_SETTINGS.categories,
        [SYNC_KEYS.UI_PREFERENCES]: DEFAULT_SETTINGS.uiPreferences
      },
      (items) => callback(fromStorageItems(items))
    );
  }

  function saveSettings(settings, callback) {
    const normalized = normalizeSettings(settings);
    chrome.storage.sync.set(
      {
        [SYNC_KEYS.SETTINGS]: normalized,
        [SYNC_KEYS.LEGACY_PREFERENCES]: normalized.categories,
        [SYNC_KEYS.UI_PREFERENCES]: normalized.uiPreferences
      },
      () => {
        if (typeof callback === "function") {
          callback(normalized);
        }
      }
    );
  }

  function readAllowlist(callback) {
    chrome.storage.local.get({ allowlistOrigins: [] }, (items) => {
      const value = Array.isArray(items.allowlistOrigins) ? items.allowlistOrigins : [];
      callback(normalizeOriginList(value));
    });
  }

  function saveAllowlist(origins, callback) {
    const normalized = normalizeOriginList(origins);
    chrome.storage.local.set({ allowlistOrigins: normalized }, () => {
      if (typeof callback === "function") {
        callback(normalized);
      }
    });
  }

  globalScope.KlickKleanSettingsStore = {
    SYNC_KEYS,
    fromStorageItems,
    readSettings,
    saveSettings,
    readAllowlist,
    saveAllowlist
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
