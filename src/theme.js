const THEME_STORAGE_KEY = 'theme_mode';
const THEME_AUTO = 'auto';
const THEME_LIGHT = 'light';
const THEME_DARK = 'dark';

function isValidThemeMode(mode) {
    return mode === THEME_AUTO || mode === THEME_LIGHT || mode === THEME_DARK;
}

function readStoredThemeMode() {
    try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        return isValidThemeMode(saved) ? saved : THEME_AUTO;
    } catch (_) {
        return THEME_AUTO;
    }
}

function writeStoredThemeMode(mode) {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (_) {
    }
}

function getSystemTheme() {
    if (typeof window.matchMedia !== 'function') {
        return THEME_LIGHT;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? THEME_DARK : THEME_LIGHT;
}

function resolveTheme(mode) {
    return mode === THEME_AUTO ? getSystemTheme() : mode;
}

function applyTheme(mode) {
    const resolvedTheme = resolveTheme(mode);
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.setAttribute('data-theme-mode', mode);
}

function listenSystemThemeChange() {
    if (typeof window.matchMedia !== 'function') {
        return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
        const currentMode = readStoredThemeMode();
        if (currentMode === THEME_AUTO) {
            applyTheme(THEME_AUTO);
        }
    };

    if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', listener);
    } else if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(listener);
    }
}

export function initThemeControls(options = {}) {
    const selectId = options.selectId;
    const currentMode = readStoredThemeMode();
    applyTheme(currentMode);
    listenSystemThemeChange();

    if (!selectId) {
        return;
    }

    const select = document.getElementById(selectId);
    if (!select) {
        return;
    }

    select.value = currentMode;
    select.addEventListener('change', (event) => {
        const nextMode = event.target.value;
        const safeMode = isValidThemeMode(nextMode) ? nextMode : THEME_AUTO;
        writeStoredThemeMode(safeMode);
        applyTheme(safeMode);
    });
}