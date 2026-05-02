(function attachUtils(globalScope) {
  function normalizeOrigin(value) {
    if (typeof value !== "string") {
      return "";
    }

    try {
      const parsed = new URL(value.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "";
      }
      return parsed.origin;
    } catch (_error) {
      return "";
    }
  }

  function normalizeOriginList(origins) {
    const set = new Set();
    for (const value of Array.isArray(origins) ? origins : []) {
      const normalized = normalizeOrigin(value);
      if (normalized) {
        set.add(normalized);
      }
    }
    return Array.from(set);
  }

  globalScope.KlickKleanUtils = {
    normalizeOrigin,
    normalizeOriginList
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { normalizeOrigin, normalizeOriginList };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
