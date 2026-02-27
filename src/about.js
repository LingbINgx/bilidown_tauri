const { getCurrent } = window.__TAURI__.window;
import { initThemeControls } from './theme.js';

document.addEventListener('DOMContentLoaded', () => {
    initThemeControls();
    document.getElementById('closeBtn').addEventListener('click', () => {
        getCurrent().close();
    });
});
