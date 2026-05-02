document.addEventListener("DOMContentLoaded", () => {
  const openShortcutSettingsButton = document.getElementById("openShortcutSettings");
  const shortcutCurrent = document.getElementById("shortcutCurrent");
  const shortcutHelp = document.getElementById("shortcutHelp");

  if (!openShortcutSettingsButton || !shortcutCurrent || !shortcutHelp) {
    return;
  }

  KlickKleanShortcuts.getCurrentShortcut((shortcut) => {
    const displayShortcut = shortcut || i18nT("shortcutNotSet");
    shortcutCurrent.textContent = i18nT("shortcutCurrentLabel", displayShortcut);
  });

  openShortcutSettingsButton.addEventListener("click", () => {
    shortcutHelp.textContent = "";
    KlickKleanShortcuts.openShortcutSettings(() => {
      shortcutHelp.textContent = i18nT("shortcutFallbackInstruction");
    });
  });
});
