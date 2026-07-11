(function attachCapabilityMatrix(globalScope) {
  const CATEGORY_CAPABILITIES = {
    tabs: { scoped: false, exclude: false, globalOnly: true, deprecated: false, measurable: false, chromeKey: null },
    history: { scoped: false, exclude: false, globalOnly: true, deprecated: false, measurable: false, chromeKey: "history" },
    cookies: { scoped: true, exclude: true, globalOnly: false, deprecated: false, measurable: false, chromeKey: "cookies" },
    downloads: { scoped: false, exclude: false, globalOnly: true, deprecated: false, measurable: false, chromeKey: "downloads" },
    formData: { scoped: false, exclude: false, globalOnly: true, deprecated: false, measurable: false, chromeKey: "formData" },
    cache: { scoped: true, exclude: true, globalOnly: false, deprecated: false, measurable: false, chromeKey: "cache" },
    appcache: { scoped: false, exclude: false, globalOnly: true, deprecated: true, measurable: false, chromeKey: null },
    cacheStorage: { scoped: true, exclude: true, globalOnly: false, deprecated: false, measurable: false, chromeKey: "cacheStorage" },
    localStorage: { scoped: true, exclude: true, globalOnly: false, deprecated: false, measurable: false, chromeKey: "localStorage" },
    indexedDB: { scoped: true, exclude: true, globalOnly: false, deprecated: false, measurable: false, chromeKey: "indexedDB" },
    fileSystems: { scoped: true, exclude: true, globalOnly: false, deprecated: false, measurable: false, chromeKey: "fileSystems" },
    webSQL: { scoped: true, exclude: true, globalOnly: false, deprecated: true, measurable: false, chromeKey: null },
    serviceWorkers: { scoped: true, exclude: true, globalOnly: false, deprecated: false, measurable: false, chromeKey: "serviceWorkers" },
    pluginData: { scoped: false, exclude: false, globalOnly: true, deprecated: true, measurable: false, chromeKey: null },
    passwords: { scoped: false, exclude: false, globalOnly: true, deprecated: true, measurable: false, chromeKey: null }
  };

  const SCOPED_SUPPORTED = new Set([
    "cookies",
    "cache",
    "cacheStorage",
    "localStorage",
    "indexedDB",
    "fileSystems",
    "webSQL",
    "serviceWorkers"
  ]);

  const EXCLUDE_SUPPORTED = new Set([
    "cookies",
    "cache",
    "cacheStorage",
    "localStorage",
    "indexedDB",
    "fileSystems",
    "webSQL",
    "serviceWorkers"
  ]);

  const GLOBAL_ONLY = new Set([
    "tabs",
    "history",
    "downloads",
    "formData",
    "appcache"
  ]);

  const DEPRECATED = new Set(["pluginData", "passwords", "appcache", "webSQL"]);

  const HIGH_RISK_KEYS = new Set([
    "cookies",
    "localStorage",
    "indexedDB",
    "serviceWorkers",
    "cacheStorage",
    "fileSystems",
    "webSQL",
    "history",
    "tabs"
  ]);

  function isScopedSupported(key) {
    return SCOPED_SUPPORTED.has(key);
  }

  function isExcludeSupported(key) {
    return EXCLUDE_SUPPORTED.has(key);
  }

  function isHighRisk(key) {
    return HIGH_RISK_KEYS.has(key);
  }

  function isGlobalOnly(key) {
    return GLOBAL_ONLY.has(key);
  }

  function isDeprecated(key) {
    return DEPRECATED.has(key);
  }

  function getChromeKey(key) {
    const cap = CATEGORY_CAPABILITIES[key];
    return cap ? cap.chromeKey : null;
  }

  function isCleanable(key) {
    return CLEANABLE_KEYS_LIST.includes(key);
  }

  const CLEANABLE_KEYS_LIST = [
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

  const api = {
    CATEGORY_CAPABILITIES,
    SCOPED_SUPPORTED,
    EXCLUDE_SUPPORTED,
    GLOBAL_ONLY,
    DEPRECATED,
    HIGH_RISK_KEYS,
    CLEANABLE_KEYS_LIST,
    isScopedSupported,
    isExcludeSupported,
    isHighRisk,
    isGlobalOnly,
    isDeprecated,
    getChromeKey,
    isCleanable
  };

  globalScope.KlickKleanCapabilities = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
