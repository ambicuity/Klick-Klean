(function attachI18n(globalScope) {
  const TOKEN_PATTERN = /__MSG_([A-Za-z0-9_@]+)__/g;

  function t(key, substitutions) {
    if (!key) {
      return "";
    }

    try {
      if (
        typeof chrome !== "undefined" &&
        chrome.i18n &&
        typeof chrome.i18n.getMessage === "function"
      ) {
        const value = chrome.i18n.getMessage(key, substitutions);
        if (value) {
          return value;
        }
      }
    } catch (_error) {
      // Fall through to key fallback.
    }

    if (typeof globalScope !== "undefined" && globalScope && globalScope.DEBUG_I18N) {
      // eslint-disable-next-line no-console
      console.warn("Missing i18n key:", key);
    }

    return key;
  }

  function replaceMessageTokens(input) {
    if (typeof input !== "string" || input.indexOf("__MSG_") === -1) {
      return input;
    }

    return input.replace(TOKEN_PATTERN, (_match, key) => t(key));
  }

  function localizeDocument(doc) {
    if (!doc || !doc.documentElement) {
      return;
    }

    const elements = doc.querySelectorAll("*");
    for (const element of elements) {
      for (const attrName of element.getAttributeNames()) {
        const currentValue = element.getAttribute(attrName);
        const localizedValue = replaceMessageTokens(currentValue);
        if (localizedValue !== currentValue) {
          element.setAttribute(attrName, localizedValue);
        }
      }
    }

    const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      const currentValue = textNode.nodeValue;
      const localizedValue = replaceMessageTokens(currentValue);
      if (localizedValue !== currentValue) {
        textNode.nodeValue = localizedValue;
      }
      textNode = walker.nextNode();
    }
  }

  function localizeCurrentDocument() {
    if (typeof document === "undefined") {
      return;
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => localizeDocument(document), { once: true });
      return;
    }

    localizeDocument(document);
  }

  function applyDocumentLanguage() {
    if (typeof document === "undefined" || !document.documentElement) {
      return;
    }

    let uiLanguage = "";
    try {
      if (
        typeof chrome !== "undefined" &&
        chrome.i18n &&
        typeof chrome.i18n.getUILanguage === "function"
      ) {
        uiLanguage = (chrome.i18n.getUILanguage() || "").trim();
      }
    } catch (_error) {
      uiLanguage = "";
    }

    if (!uiLanguage) {
      return;
    }

    const normalized = uiLanguage.replace(/_/g, "-");
    if (!document.documentElement.lang) {
      document.documentElement.lang = normalized;
    }

    const primary = normalized.split("-")[0].toLowerCase();
    const rtlLangs = new Set(["ar", "fa", "he", "ur"]);
    document.documentElement.dir = rtlLangs.has(primary) ? "rtl" : "ltr";
  }

  globalScope.i18nT = t;
  globalScope.localizeDocument = localizeDocument;
  applyDocumentLanguage();
  localizeCurrentDocument();
})(typeof globalThis !== "undefined" ? globalThis : this);
