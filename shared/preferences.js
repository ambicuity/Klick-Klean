(function attachPreferences(globalScope) {
  const CLEANUP_ORDER = [
    "tabs",
    "history",
    "cookies",
    "downloads",
    "formData",
    "cache",
    "appcache",
    "cacheStorage",
    "localStorage",
    "indexedDB",
    "fileSystems",
    "webSQL",
    "serviceWorkers"
  ];

  const CLEANABLE_KEYS = [
    "cache",
    "cacheStorage",
    "cookies",
    "downloads",
    "fileSystems",
    "formData",
    "history",
    "indexedDB",
    "localStorage",
    "serviceWorkers"
  ];

  const LABEL_KEYS = {
    tabs: "labelTabs",
    history: "labelHistory",
    cookies: "labelCookies",
    downloads: "labelDownloads",
    formData: "labelFormData",
    cache: "labelCache",
    appcache: "labelAppcache",
    cacheStorage: "labelCacheStorage",
    localStorage: "labelLocalStorage",
    indexedDB: "labelIndexedDB",
    fileSystems: "labelFileSystems",
    webSQL: "labelWebSQL",
    serviceWorkers: "labelServiceWorkers"
  };

  const WARNING_KEYS = {
    tabs: "warnTabs",
    history: "warnHistory",
    cookies: "warnCookies",
    downloads: "warnDownloads",
    formData: "warnFormData",
    cache: "warnCache",
    appcache: "warnAppcache",
    cacheStorage: "warnCacheStorage",
    localStorage: "warnLocalStorage",
    indexedDB: "warnIndexedDB",
    fileSystems: "warnFileSystems",
    webSQL: "warnWebSQLDeprecated",
    serviceWorkers: "warnServiceWorkers"
  };

  const HIGH_RISK_KEYS = [
    "tabs",
    "history",
    "cookies",
    "localStorage",
    "indexedDB",
    "serviceWorkers",
    "cacheStorage",
    "fileSystems",
    "webSQL"
  ];

  const DEFAULT_PREFERENCES = CLEANUP_ORDER.reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {});

  const DEFAULT_SETTINGS = {
    categories: { ...DEFAULT_PREFERENCES },
    timeRange: "allTime",
    customRange: null,
    scope: "global",
    origins: [],
    presetId: "",
    expertMode: false,
    uiPreferences: {
      notificationsEnabled: true
    }
  };

  function normalizePreferences(input) {
    const output = {};
    for (const key of CLEANUP_ORDER) {
      output[key] = Boolean(input && input[key]);
    }
    return output;
  }

  function normalizeCustomRangeForSettings(customRange) {
    const timeRangeApi = globalScope.KlickKleanTimeRange;
    if (timeRangeApi && typeof timeRangeApi.normalizeCustomRange === "function") {
      return timeRangeApi.normalizeCustomRange(customRange);
    }

    // The time-range module is not loaded in every surface (the storage store
    // can be used on its own), so keep a minimal fallback.
    if (!customRange || typeof customRange !== "object") {
      return null;
    }
    const start = Number(customRange.start || customRange.startMs || 0);
    if (!Number.isFinite(start) || start <= 0) {
      return null;
    }
    return { start, end: null };
  }

  function normalizeSettings(input) {
    const source = input || {};
    const categories = normalizePreferences(source.categories || source.preferences || DEFAULT_PREFERENCES);

    const timeRangeApi = globalScope.KlickKleanTimeRange;
    const customKey = timeRangeApi && timeRangeApi.TIME_RANGES
      ? timeRangeApi.TIME_RANGES.CUSTOM
      : "custom";
    const allTimeKey = timeRangeApi && timeRangeApi.TIME_RANGES
      ? timeRangeApi.TIME_RANGES.ALL_TIME
      : DEFAULT_SETTINGS.timeRange;

    const rawTimeRange = typeof source.timeRange === "string" ? source.timeRange : DEFAULT_SETTINGS.timeRange;
    const customRange = normalizeCustomRangeForSettings(source.customRange);

    // A custom range without usable bounds can never be executed, so it must
    // never be persisted in that state: fall back to "all time" instead of
    // bricking every later cleanup run (#2).
    const timeRange = rawTimeRange === customKey && !customRange ? allTimeKey : rawTimeRange;

    return {
      categories,
      timeRange,
      customRange,
      scope: typeof source.scope === "string" ? source.scope : DEFAULT_SETTINGS.scope,
      origins: Array.isArray(source.origins) ? source.origins : [],
      presetId: typeof source.presetId === "string" ? source.presetId : "",
      expertMode: Boolean(source.expertMode),
      uiPreferences: {
        notificationsEnabled: Boolean(source.uiPreferences?.notificationsEnabled ?? DEFAULT_SETTINGS.uiPreferences.notificationsEnabled)
      }
    };
  }

  globalScope.KlickKleanPrefs = {
    CLEANUP_ORDER,
    CLEANABLE_KEYS,
    LABEL_KEYS,
    WARNING_KEYS,
    HIGH_RISK_KEYS,
    DEFAULT_PREFERENCES,
    DEFAULT_SETTINGS,
    normalizePreferences,
    normalizeSettings
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
