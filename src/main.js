const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
import { initThemeControls } from './theme.js';

document.addEventListener("contextmenu", function (e) {

    if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.isContentEditable
    ) {
        return;
    }

    e.preventDefault();
});


let currentView = 'main';

// 下载进度视图：每个任务的状态 { url, percent, speed, eta_secs, status }
let downloadTasks = [];

// 读取历史记录
async function loadHistory() {
    const historyView = document.getElementById('historyView');
    if (!historyView || historyView.classList.contains('hidden')) return;

    const contentEl = document.getElementById('historyContent');
    if (!contentEl) return;

    contentEl.textContent = "加载中...";
    try {
        const content = await invoke('read_history_log');
        contentEl.textContent = content || "暂无历史记录 (dat.log 不存在或为空)";
    } catch (e) {
        contentEl.textContent = "读取失败: " + e;
    }
}

function showView(viewName) {
    currentView = viewName;
    document.getElementById('mainView').classList.toggle('hidden', viewName !== 'main');
    document.getElementById('progressView').classList.toggle('hidden', viewName !== 'progress');
    document.getElementById('historyView').classList.toggle('hidden', viewName !== 'history');
    document.getElementById('settingsView').classList.toggle('hidden', viewName !== 'settings');
    document.getElementById('aboutView').classList.toggle('hidden', viewName !== 'about');
    const hintEl = document.getElementById('progressViewHint');
    if (hintEl) hintEl.classList.toggle('hidden', viewName !== 'progress' || downloadTasks.length > 0);
    const views = ['main', 'progress', 'history', 'settings', 'about'];
    document.querySelectorAll('.sidebar-item').forEach((el, i) => {
        el.classList.toggle('active', views[i] === viewName);
    });

    if (viewName === 'history') {
        loadHistory();
    }
}

// 格式化速度显示 (bytes/s -> MB/s 或 KB/s)
function formatSpeed(bytesPerSec) {
    if (bytesPerSec >= 1024 * 1024) {
        return (bytesPerSec / (1024 * 1024)).toFixed(2) + " MB/s";
    }
    if (bytesPerSec >= 1024) {
        return (bytesPerSec / 1024).toFixed(2) + " KB/s";
    }
    return bytesPerSec.toFixed(0) + " B/s";
}

// 格式化剩余时间 (秒 -> "剩余 1:23" 或 "剩余 未知")
function formatEta(etaSecs) {
    if (etaSecs <= 0 || !Number.isFinite(etaSecs)) return "";
    const m = Math.floor(etaSecs / 60);
    const s = Math.floor(etaSecs % 60);
    return "剩余 " + m + ":" + (s < 10 ? "0" : "") + s;
}

// 更新主界面单条下载进度（单任务或兼容旧事件）
function setProgress(payload) {
    const fill = document.getElementById("progressFill");
    const text = document.getElementById("progressText");
    const speedEl = document.getElementById("progressSpeed");
    const etaEl = document.getElementById("progressEta");
    if (!fill || !text) return;

    let percent = 0;
    let speed = 0;
    let etaSecs = 0;

    if (typeof payload === "number") {
        percent = payload;
    } else if (payload && typeof payload === "object") {
        const fileCount = payload.file_count || 1;
        const fileIndex = payload.file_index || 0;
        percent = fileCount > 1
            ? (fileIndex * 100 + (payload.percent || 0)) / fileCount
            : (payload.percent || 0);
        speed = payload.speed || 0;
        etaSecs = payload.eta_secs || 0;
    }

    fill.style.width = Math.min(100, Math.max(0, percent)) + "%";
    text.innerText = percent.toFixed(1) + "%";
    if (speedEl) speedEl.textContent = speed > 0 ? "速度 " + formatSpeed(speed) : "";
    if (etaEl) etaEl.textContent = formatEta(etaSecs);
}

// 初始化下载进度视图：为每个 URL 建立一行（标题先显示为 URL，收到 download-task-title 后更新为视频名）
function initDownloadProgressView(urls) {
    downloadTasks = urls.map((url, i) => ({
        id: i,
        url: url.trim(),
        title: "",
        percent: 0,
        speed: 0,
        eta_secs: 0,
        status: "downloading",
    }));
    const listEl = document.getElementById("downloadProgressList");
    const hintEl = document.getElementById("progressViewHint");
    if (!listEl) return;
    if (hintEl) hintEl.classList.add("hidden");
    listEl.innerHTML = "";
    downloadTasks.forEach((task, index) => {
        const item = document.createElement("div");
        item.className = "progress-task downloading";
        item.id = `progress-task-${index}`;
        const labelText = "任务 " + (index + 1) + ": " + truncateUrl(task.url);
        item.innerHTML = `
            <div class="progress-task-label" title="${escapeHtml(task.url)}">${escapeHtml(labelText)}</div>
            <div class="progress-task-bar-wrap">
                <div class="progress-task-bar">
                    <div class="progress-task-fill" style="width:0%"></div>
                </div>
            </div>
            <div class="progress-task-meta">
                <span class="progress-task-percent">0%</span>
                <span class="progress-task-speed"></span>
                <span class="progress-task-eta"></span>
            </div>
        `;
        listEl.appendChild(item);
    });
}

// 更新某任务的进度条标题为视频名称（由后端 download-task-title 事件触发）
function updateDownloadProgressTaskTitle(urlIndex, title) {
    if (urlIndex < 0 || urlIndex >= downloadTasks.length || !title) return;
    downloadTasks[urlIndex].title = title;
    const item = document.getElementById(`progress-task-${urlIndex}`);
    if (!item) return;
    const labelEl = item.querySelector(".progress-task-label");
    if (labelEl) {
        labelEl.textContent = title;
        labelEl.title = title;
    }
}

function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
}

function truncateUrl(url, maxLen = 50) {
    if (url.length <= maxLen) return url;
    return url.slice(0, maxLen - 3) + "...";
}

// 更新下载进度视图中某一行的进度
function updateDownloadProgressItem(urlIndex, payload) {
    if (urlIndex < 0 || urlIndex >= downloadTasks.length) return;
    const task = downloadTasks[urlIndex];
    const fileCount = payload.file_count || 1;
    const fileIndex = payload.file_index || 0;
    task.percent = fileCount > 1
        ? (fileIndex * 100 + (payload.percent || 0)) / fileCount
        : (payload.percent || 0);
    task.speed = payload.speed || 0;
    task.eta_secs = payload.eta_secs || 0;

    const item = document.getElementById(`progress-task-${urlIndex}`);
    if (!item) return;
    const fill = item.querySelector(".progress-task-fill");
    const percentEl = item.querySelector(".progress-task-percent");
    const speedEl = item.querySelector(".progress-task-speed");
    const etaEl = item.querySelector(".progress-task-eta");
    if (fill) fill.style.width = Math.min(100, Math.max(0, task.percent)) + "%";
    if (percentEl) percentEl.textContent = task.percent.toFixed(1) + "%";
    if (speedEl) speedEl.textContent = task.speed > 0 ? "速度 " + formatSpeed(task.speed) : "";
    if (etaEl) etaEl.textContent = formatEta(task.eta_secs);
}

// 下载结束后更新每行状态
function finishDownloadProgressView(results) {
    results.forEach((result, index) => {
        if (index >= downloadTasks.length) return;
        downloadTasks[index].status = result.success ? "success" : "error";
        downloadTasks[index].message = result.message;
        const item = document.getElementById(`progress-task-${index}`);
        if (!item) return;
        item.classList.remove("downloading");
        item.classList.add(result.success ? "success" : "error");
        const meta = item.querySelector(".progress-task-meta");
        if (meta) {
            const msg = document.createElement("span");
            msg.className = "progress-task-message";
            msg.textContent = result.success ? "✓ " + result.message : "✗ " + result.message;
            meta.innerHTML = "";
            meta.appendChild(msg);
        }
    });
}


// 初始化
async function init() {
    // 加载设置
    await loadSettings();

    // 加载分辨率列表
    try {
        const resolutions = await invoke('get_resolutions');
        const resolutionSelect = document.getElementById('resolution');
        // 保留第一个默认选项
        while (resolutionSelect.options.length > 1) {
            resolutionSelect.remove(1);
        }
        resolutions.forEach(res => {
            const option = document.createElement('option');
            option.value = res;
            option.textContent = res;
            resolutionSelect.appendChild(option);
        });
    } catch (e) {
        console.error("加载分辨率失败:", e);
    }

    // 检查登录状态
    await checkLoginStatus();


    // 加载保存路径
    try {
        const savePath = await invoke('get_save_path');
        document.getElementById('savePath').value = savePath;
    } catch (e) {
        console.error('获取保存路径失败:', e);
    }
}

// 检查登录状态
async function checkLoginStatus() {
    try {
        const isLoggedIn = await invoke('check_login');
        const statusText = document.getElementById('loginStatus');
        if (isLoggedIn) {
            statusText.textContent = '✓ 已登录';
            statusText.style.color = '#52c41a';
        } else {
            statusText.textContent = '未登录';
            statusText.style.color = '#999';
        }
    } catch (e) {
        console.error('检查登录状态失败:', e);
    }
}

// 登录
async function handleLogin() {
    const loginBtn = document.getElementById('loginBtn');
    const statusText = document.getElementById('loginStatus');

    loginBtn.disabled = true;
    statusText.textContent = '正在生成二维码...';
    statusText.style.color = '#1890ff';

    try {
        const result = await invoke('login');
        if (result.success) {
            statusText.textContent = '✓ 登录成功';
            statusText.style.color = '#52c41a';
            if (result.qr_code_path) {
                showToast('请扫描二维码登录（二维码已保存到 output.png）', 'success');
            }
        } else {
            statusText.textContent = '✗ ' + result.message;
            statusText.style.color = '#ff4d4f';
        }
    } catch (e) {
        statusText.textContent = '✗ 登录失败: ' + e;
        statusText.style.color = '#ff4d4f';
    } finally {
        loginBtn.disabled = false;
    }
}


// 显示消息提示
function showToast(msg, type = "success") {
    const toast = document.createElement("div");
    toast.innerText = msg;

    toast.style.position = "fixed";
    toast.style.bottom = "30px";
    toast.style.right = "30px";
    toast.style.padding = "12px 18px";
    toast.style.color = "#fff";
    toast.style.borderRadius = "8px";
    toast.style.zIndex = "9999";
    toast.style.fontSize = "14px";
    toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
    toast.style.background = type === "error" ? "#e74c3c" : "#2ecc71";

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// 登出
async function handleLogout() {
    try {
        await invoke('logout');
        const statusText = document.getElementById('loginStatus');
        statusText.textContent = '已登出';
        statusText.style.color = '#999';
        showToast('登出成功', 'success');
    } catch (e) {
        showToast('登出失败: ' + e, 'error');
    }
}

// 获取视频信息
async function getVideoInfo(url) {
    if (!url.trim()) return;

    try {
        const info = await invoke('get_video_info', { url: url.trim() });

        // 显示标题
        document.getElementById('titleText').textContent = info.title || '无标题';

        // 显示封面
        const coverImage = document.getElementById('coverImage');
        const noCover = document.getElementById('noCover');
        if (info.pic_url) {
            coverImage.referrerPolicy = "no-referrer";
            coverImage.src = info.pic_url;
            coverImage.style.display = 'block';
            noCover.style.display = 'none';
        } else {
            coverImage.style.display = 'none';
            noCover.style.display = 'block';
        }
    } catch (e) {
        console.error('获取视频信息失败:', e);
        document.getElementById('titleText').textContent = '获取信息失败: ' + e;
        showToast('获取视频信息失败: ' + e, 'error');
    }
}

// 下载视频
async function handleDownload() {
    const urlInput = document.getElementById('videoUrl');
    const resolutionSelect = document.getElementById('resolution');

    const urls = urlInput.value.trim().split('\n').filter(u => u.trim());
    if (urls.length === 0) {
        showToast('请输入视频链接', 'error');
        return;
    }

    const resolution = resolutionSelect.value || '4K';
    let savePath = './download';
    try {
        savePath = await invoke('get_save_path') || savePath;
    } catch (_) { }

    const downloadBtn = document.getElementById('downloadBtn');
    downloadBtn.disabled = true;
    downloadBtn.textContent = '下载中...';

    setProgress({ percent: 0, speed: 0, eta_secs: 0, file_index: 0, file_count: 1 });

    const downloadList = document.getElementById('downloadList');
    downloadList.innerHTML = '';

    // 为每个 URL 创建主界面下载项（简要状态）
    urls.forEach((url, index) => {
        const item = document.createElement('div');
        item.className = 'download-item processing';
        item.id = `download-item-${index}`;
        item.textContent = `正在处理: ${url}`;
        downloadList.appendChild(item);
    });

    // 打开下载进度界面并为每个任务建立独立进度条
    initDownloadProgressView(urls);
    showView('progress');

    try {
        if (urls.length > 0) {
            await getVideoInfo(urls[0]);
        }

        const unlistenProgress = await listen("download-progress", (e) => {
            const p = e.payload;
            if (p != null && typeof p === "object" && typeof p.url_index === "number") {
                updateDownloadProgressItem(p.url_index, p);
            } else {
                setProgress(p);
            }
        });
        const unlistenTitle = await listen("download-task-title", (e) => {
            const p = e.payload;
            if (p != null && typeof p === "object" && typeof p.url_index === "number" && p.title != null) {
                updateDownloadProgressTaskTitle(p.url_index, p.title);
            }
        });

        const results = await invoke('download_videos', {
            urls: urls,
            resolution: resolution,
            savePath: savePath
        });

        unlistenProgress();
        unlistenTitle();
        setProgress({ percent: 100, speed: 0, eta_secs: 0, file_index: 0, file_count: 1 });

        finishDownloadProgressView(results);

        // 同步更新主界面下载列表状态
        results.forEach((result, index) => {
            const item = document.getElementById(`download-item-${index}`);
            if (item) {
                if (result.success) {
                    item.className = 'download-item success';
                    item.textContent = `✓ ${result.message}`;
                } else {
                    item.className = 'download-item error';
                    item.textContent = `✗ ${result.message}`;
                }
            }
        });

        showToast(`下载完成！成功: ${results.filter(r => r.success).length}, 失败: ${results.filter(r => !r.success).length}`, 'success');
    } catch (e) {
        showToast('下载失败: ' + e, 'error');
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.textContent = '下载';
    }
}

// 加载设置
async function loadSettings() {
    try {
        const path = await invoke('get_save_path');
        if (path) {
            document.getElementById('savePath').value = path;
        }
    } catch (e) {
        showToast('加载设置失败: ' + e, 'error');
    }
}

// 保存设置
async function saveSettings() {
    const savePath = document.getElementById('savePath').value;
    try {
        await invoke('set_save_path', { path: savePath });
        showToast('设置已保存', 'success');
    } catch (e) {
        showToast('保存设置失败: ' + e, 'error');
    }
}

// 事件监听
document.addEventListener('DOMContentLoaded', () => {
    initThemeControls({ selectId: 'themeMode' });
    init();

    // 侧栏：主界面 / 下载进度 / 设置 / 关于

    // 侧栏：主界面 / 下载进度 / 设置 / 关于
    document.getElementById('navMain').addEventListener('click', () => showView('main'));
    document.getElementById('navProgress').addEventListener('click', () => showView('progress'));
    document.getElementById('navHistory').addEventListener('click', () => showView('history'));
    document.getElementById('navSettings').addEventListener('click', () => showView('settings'));
    document.getElementById('navAbout').addEventListener('click', () => showView('about'));

    // 登录/登出
    document.getElementById('loginBtn').addEventListener('click', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // 下载
    document.getElementById('downloadBtn').addEventListener('click', handleDownload);

    // 保存设置
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);

    // URL 输入变化时获取视频信息（防抖）
    let urlTimeout;
    document.getElementById('videoUrl').addEventListener('input', (e) => {
        clearTimeout(urlTimeout);
        urlTimeout = setTimeout(() => {
            const url = e.target.value.trim().split('\n')[0];
            if (url) {
                getVideoInfo(url);
            }
        }, 500);
    });
});
