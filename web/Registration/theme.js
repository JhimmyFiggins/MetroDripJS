// Resolves the console theme before first paint and keeps the Light/Dark switch in sync.
// Mirrors mobile/Registration/theme.js: an explicit choice wins, otherwise follow the OS setting.
// Load this synchronously in <head> so the page never flashes the wrong theme.
(() => {
  const STORAGE_KEY = 'metrodripTheme'; // same key the ASP.NET console pages use
  const root = document.documentElement;
  const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  const readSaved = () => {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null; // storage blocked (private window, disabled site data)
    }
  };

  const systemTheme = () => (darkQuery && darkQuery.matches ? 'dark' : 'light');

  const syncButtons = (theme) => {
    document.querySelectorAll('[data-theme-option]').forEach((button) => {
      const active = button.dataset.themeOption === theme;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };

  const apply = (theme) => {
    root.dataset.theme = theme;
    syncButtons(theme);
  };

  apply(readSaved() || systemTheme());

  darkQuery?.addEventListener('change', () => {
    if (!readSaved()) apply(systemTheme());
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-theme-option]');
    if (!button) return;
    const theme = button.dataset.themeOption;
    apply(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // The choice still applies for this page view.
    }
  });

  document.addEventListener('DOMContentLoaded', () => syncButtons(root.dataset.theme));
})();
