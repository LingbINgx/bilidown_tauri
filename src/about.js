const { getCurrent } = window.__TAURI__.window;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('closeBtn').addEventListener('click', () => {
        getCurrent().close();
    });
});
