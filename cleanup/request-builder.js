(function attachRequestBuilder(globalScope) {
  const prefs = globalScope.KlickKleanPrefs;
  const timeRangeApi = globalScope.KlickKleanTimeRange;
  const capability = globalScope.KlickKleanCapabilities;
  const { normalizeOrigin, normalizeOriginList } = globalScope.KlickKleanUtils || {};

  const SCOPE = {
    GLOBAL: "global",
    CURRENT_SITE: "currentSite",
    SELECTED_SITES: "selectedSites"
  };

  function normalizeScope(scope) {
    if (scope === SCOPE.CURRENT_SITE || scope === SCOPE.SELECTED_SITES) {
      return scope;
    }
    return SCOPE.GLOBAL;
  }

  function uniqueOrigins(items) {
    return normalizeOriginList ? normalizeOriginList(items) : [];
  }

  function buildCleanupPlan(input, runtimeContext) {
    const categories = prefs.normalizePreferences(input.categories || input.preferences || {});
    const selected = prefs.CLEANUP_ORDER.filter((key) => categories[key]);

    const scope = normalizeScope(input.scope);
    const timeRange = timeRangeApi.normalizeTimeRange(input.timeRange);
    const customRange = timeRangeApi.normalizeCustomRange(input.customRange);
    const allowlistOrigins = uniqueOrigins(input.allowlistOrigins || []);

    const runtimeOrigins = [];
    if (scope === SCOPE.CURRENT_SITE) {
      runtimeOrigins.push(runtimeContext?.activeOrigin || "");
    }
    if (scope === SCOPE.SELECTED_SITES) {
      runtimeOrigins.push(...(input.origins || []));
    }
    const requestedOrigins = uniqueOrigins(runtimeOrigins);

    const scopedEligible = [];
    const scopedUnsupported = [];
    const removeData = {};
    const globalOnlyData = {};
    const selectedStates = {};
    const warnings = [];
    const limitations = [];
    const errors = [];

    for (const key of selected) {
      if (key === "tabs") {
        selectedStates[key] = "planned";
        continue;
      }

      if (capability.isDeprecated(key)) {
        selectedStates[key] = "deprecated";
        continue;
      }

      if (!capability.isCleanable(key)) {
        selectedStates[key] = "skipped";
        continue;
      }

      if (scope === SCOPE.GLOBAL) {
        removeData[key] = true;
        selectedStates[key] = "planned";
        continue;
      }

      if (capability.isScopedSupported(key)) {
        scopedEligible.push(key);
        selectedStates[key] = "planned";
      } else {
        scopedUnsupported.push(key);
        globalOnlyData[key] = true;
        selectedStates[key] = "unsupported";
      }
    }

    for (const key of scopedEligible) {
      removeData[key] = true;
    }

    const removeOptions = {
      ...timeRangeApi.buildRemovalWindow(timeRange, customRange)
    };

    const scopedRun = scope !== SCOPE.GLOBAL;
    if (timeRange === timeRangeApi.TIME_RANGES.CUSTOM && !customRange) {
      errors.push({
        code: "INVALID_CUSTOM_RANGE",
        messageKey: "errorInvalidRequest"
      });
    }

    if (scopedRun && requestedOrigins.length > 0) {
      removeOptions.origins = requestedOrigins;
    }

    if (!scopedRun && allowlistOrigins.length > 0) {
      if (Object.keys(removeData).some((key) => capability.isExcludeSupported(key))) {
        removeOptions.excludeOrigins = allowlistOrigins;
      }
      for (const key of selected) {
        if (key !== "tabs" && capability.isCleanable(key) && !capability.isExcludeSupported(key)) {
          limitations.push({
            code: "EXCLUDE_UNSUPPORTED",
            category: key,
            messageKey: "limitationExcludeUnsupported"
          });
        }
      }
    }

    if (scopedRun && requestedOrigins.length === 0) {
      errors.push({
        code: "SCOPE_WITHOUT_ORIGIN",
        messageKey: "limitationScopeNeedsOrigin"
      });
    }

    if (scopedUnsupported.length > 0) {
      warnings.push({
        code: "SCOPED_UNSUPPORTED_GLOBAL_ONLY",
        categories: scopedUnsupported,
        messageKey: "warningScopedUnsupported"
      });
    }

    return {
      categories,
      selected,
      scope,
      timeRange,
      customRange,
      allowlistOrigins,
      requestedOrigins,
      removeOptions,
      removeData,
      globalOnlyData,
      selectedStates,
      warnings,
      limitations,
      errors,
      scopedUnsupported,
      hasTabsAction: Boolean(categories.tabs)
    };
  }

  const api = {
    SCOPE,
    normalizeScope,
    normalizeOrigin,
    uniqueOrigins,
    buildCleanupPlan
  };

  globalScope.KlickKleanRequestBuilder = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
