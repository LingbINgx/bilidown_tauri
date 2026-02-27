const { invoke } = window.__TAURI__.core;
const { getCurrent } = window.__TAURI__.window;
import { initThemeControls } from './theme.js';

async function init() {
    try {
        const savePath = await invoke('get_save_path');
        document.getElementById('savePath').value = savePath;
    } catch (e) {
        console.error('获取保存路径失败:', e);
    }
}

function showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    toast.innerText = msg;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.padding = '10px 16px';
    toast.style.color = '#fff';
    toast.style.borderRadius = '8px';
    toast.style.zIndex = '9999';
    toast.style.fontSize = '14px';
    toast.style.background = type === 'error' ? '#e74c3c' : '#2ecc71';
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

async function saveSettings() {
    const savePath = document.getElementById('savePath').value;
    try {
        await invoke('set_save_path', { path: savePath });
        showToast('设置已保存', 'success');
    } catch (e) {
        showToast('保存设置失败: ' + e, 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initThemeControls({ selectId: 'themeMode' });
    init();
    document.getElementById('closeBtn').addEventListener('click', () => {
        getCurrent().close();
    });
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
});
