(function attachTimeRange(globalScope) {
  const TIME_RANGES = {
    LAST_HOUR: "lastHour",
    LAST_24_HOURS: "last24h",
    LAST_7_DAYS: "last7d",
    LAST_4_WEEKS: "last4w",
    ALL_TIME: "allTime",
    CUSTOM: "custom"
  };

  const RANGE_VALUES = new Set(Object.values(TIME_RANGES));

  function normalizeTimeRange(range) {
    if (RANGE_VALUES.has(range)) {
      return range;
    }
    return TIME_RANGES.ALL_TIME;
  }

  function normalizeCustomRange(customRange) {
    if (!customRange || typeof customRange !== "object") {
      return null;
    }

    const start = Number(customRange.start || customRange.startMs || 0);
    const endRaw = customRange.end || customRange.endMs;
    const end = endRaw == null ? null : Number(endRaw);

    if (!Number.isFinite(start) || start <= 0) {
      return null;
    }

    if (end != null && (!Number.isFinite(end) || end < start)) {
      return null;
    }

    return { start, end };
  }

  function toSinceTimestamp(range, nowMs, customRange) {
    const safeNow = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
    const normalizedRange = normalizeTimeRange(range);

    switch (normalizedRange) {
      case TIME_RANGES.LAST_HOUR:
        return safeNow - 60 * 60 * 1000;
      case TIME_RANGES.LAST_24_HOURS:
        return safeNow - 24 * 60 * 60 * 1000;
      case TIME_RANGES.LAST_7_DAYS:
        return safeNow - 7 * 24 * 60 * 60 * 1000;
      case TIME_RANGES.LAST_4_WEEKS:
        return safeNow - 28 * 24 * 60 * 60 * 1000;
      case TIME_RANGES.CUSTOM: {
        const normalizedCustom = normalizeCustomRange(customRange);
        return normalizedCustom ? normalizedCustom.start : 0;
      }
      case TIME_RANGES.ALL_TIME:
      default:
        return 0;
    }
  }

  function buildRemovalWindow(range, customRange, nowMs) {
    const normalizedRange = normalizeTimeRange(range);
    if (normalizedRange === TIME_RANGES.ALL_TIME) {
      return {};
    }

    const since = toSinceTimestamp(normalizedRange, nowMs, customRange);
    if (!since || since <= 0) {
      return {};
    }

    return { since };
  }

  const api = {
    TIME_RANGES,
    normalizeTimeRange,
    normalizeCustomRange,
    toSinceTimestamp,
    buildRemovalWindow
  };

  globalScope.KlickKleanTimeRange = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
