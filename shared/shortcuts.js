(function attachShortcutHelpers(globalScope) {
  const ACTION_COMMAND = "_execute_action";
  const SHORTCUTS_URL = "chrome://extensions/shortcuts";
  const EXTENSIONS_URL = "chrome://extensions";

  function isMac() {
    if (typeof navigator === "undefined") {
      return false;
    }
    return /mac/i.test(navigator.platform || "");
  }

  function getFallbackShortcut() {
    return isMac() ? "Command+Shift+E" : "Ctrl+Shift+E";
  }

  function getCurrentShortcut(callback) {
    if (
      typeof chrome === "undefined" ||
      !chrome.commands ||
      typeof chrome.commands.getAll !== "function"
    ) {
      callback(getFallbackShortcut());
      return;
    }

    chrome.commands.getAll((commands) => {
      const actionCommand = Array.isArray(commands)
        ? commands.find((command) => command && command.name === ACTION_COMMAND)
        : null;

      if (!actionCommand) {
        callback(getFallbackShortcut());
        return;
      }

      const assignedShortcut = actionCommand.shortcut ? actionCommand.shortcut : "";
      callback(assignedShortcut);
    });
  }

  function openShortcutSettings(onFallback) {
    if (
      typeof chrome === "undefined" ||
      !chrome.tabs ||
      typeof chrome.tabs.create !== "function"
    ) {
      if (typeof onFallback === "function") {
        onFallback();
      }
      return;
    }

    chrome.tabs.create({ url: SHORTCUTS_URL }, () => {
      if (!chrome.runtime || !chrome.runtime.lastError) {
        return;
      }

      chrome.tabs.create({ url: EXTENSIONS_URL }, () => {
        if (typeof onFallback === "function") {
          onFallback();
        }
      });
    });
  }

  globalScope.KlickKleanShortcuts = {
    getCurrentShortcut,
    openShortcutSettings
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
