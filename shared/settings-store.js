(function attachSettingsStore(globalScope) {
  const { DEFAULT_SETTINGS, normalizeSettings } = globalScope.KlickKleanPrefs;
  const { normalizeOriginList: normalizeOriginListImpl } = globalScope.KlickKleanUtils || {};

  const SYNC_KEYS = {
    SETTINGS: "settings",
    LEGACY_PREFERENCES: "preferences",
    UI_PREFERENCES: "uiPreferences"
  };

  // KlickKleanUtils is a hard dependency of this module in every shipped
  // surface, but the store must never throw even if it is missing: a throw
  // inside a chrome.storage callback leaves the caller's promise unsettled.
  function fallbackNormalizeOriginList(origins) {
    const seen = new Set();
    for (const value of Array.isArray(origins) ? origins : []) {
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
        seen.add(parsed.origin);
      } catch (_error) {
        // Not a parsable URL - drop it.
      }
    }
    return Array.from(seen);
  }

  const normalizeOriginList =
    typeof normalizeOriginListImpl === "function"
      ? normalizeOriginListImpl
      : fallbackNormalizeOriginList;

  // chrome.runtime.lastError is only readable inside the storage callback.
  function lastStorageError() {
    try {
      return chrome.runtime && chrome.runtime.lastError ? chrome.runtime.lastError : null;
    } catch (_error) {
      return null;
    }
  }

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
      (items) => {
        // A failed read invokes the callback with an undefined result and
        // sets chrome.runtime.lastError. Falling back to the defaults keeps
        // the caller unblocked instead of throwing inside the callback.
        const error = lastStorageError();
        if (error) {
          console.error("KlickKlean: failed to read settings", error.message || error);
        }
        const settings = fromStorageItems(items || {});
        if (typeof callback === "function") {
          callback(settings, error);
        }
      }
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
        const error = lastStorageError();
        if (error) {
          console.error("KlickKlean: failed to save settings", error.message || error);
        }
        if (typeof callback === "function") {
          callback(normalized, error);
        }
      }
    );
  }

  function readAllowlist(callback) {
    chrome.storage.local.get({ allowlistOrigins: [] }, (items) => {
      const error = lastStorageError();
      if (error) {
        console.error("KlickKlean: failed to read allowlist", error.message || error);
      }
      // `items` is undefined when the read failed - guard before use.
      const value = Array.isArray(items?.allowlistOrigins) ? items.allowlistOrigins : [];
      const origins = normalizeOriginList(value);
      if (typeof callback === "function") {
        callback(origins, error);
      }
    });
  }

  function saveAllowlist(origins, callback) {
    const normalized = normalizeOriginList(origins);
    chrome.storage.local.set({ allowlistOrigins: normalized }, () => {
      const error = lastStorageError();
      if (error) {
        console.error("KlickKlean: failed to save allowlist", error.message || error);
      }
      if (typeof callback === "function") {
        callback(normalized, error);
      }
    });
  }

  globalScope.KlickKleanSettingsStore = {
    SYNC_KEYS,
    fromStorageItems,
    readSettings,
    saveSettings,
    readAllowlist,
    saveAllowlist,
    // Re-exported so surfaces that already depend on this namespace (popup,
    // options) do not have to reach into KlickKleanUtils directly.
    normalizeOriginList
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
