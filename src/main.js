const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

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

function showView(viewName) {
    currentView = viewName;
    document.getElementById('mainView').classList.toggle('hidden', viewName !== 'main');
    document.getElementById('settingsView').classList.toggle('hidden', viewName !== 'settings');
    document.getElementById('aboutView').classList.toggle('hidden', viewName !== 'about');
    const views = ['main', 'settings', 'about'];
    document.querySelectorAll('.sidebar-item').forEach((el, i) => {
        el.classList.toggle('active', views[i] === viewName);
    });
}

function setProgress(percent) {
    const bar = document.getElementById("progressBar");
    const text = document.getElementById("progressText");

    bar.style.width = percent + "%";
    text.innerText = percent + "%";
}


// 初始化
async function init() {
    // 加载分辨率列表
    const resolutions = await invoke('get_resolutions');
    const resolutionSelect = document.getElementById('resolution');
    resolutions.forEach(res => {
        const option = document.createElement('option');
        option.value = res;
        option.textContent = res;
        resolutionSelect.appendChild(option);
    });

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

    const downloadList = document.getElementById('downloadList');
    downloadList.innerHTML = '';

    // 为每个 URL 创建下载项
    urls.forEach((url, index) => {
        const item = document.createElement('div');
        item.className = 'download-item processing';
        item.id = `download-item-${index}`;
        item.textContent = `正在处理: ${url}`;
        downloadList.appendChild(item);
    });

    try {
        // 先获取第一个视频的信息
        if (urls.length > 0) {
            await getVideoInfo(urls[0]);
        }

        const unlisten = await listen("download-progress", (e) => {
            const percent = e.payload;
            setProgress(percent);
        });

        // 批量下载
        const results = await invoke('download_videos', {
            urls: urls,
            resolution: resolution,
            savePath: savePath
        });

        unlisten(); // 停止监听下载进度事件
        setProgress(100); // 确保进度条显示为100%

        // 更新下载项状态
        results.forEach((result, index) => {
            const item = document.getElementById(`download-item-${index}`);
            if (result.success) {
                item.className = 'download-item success';
                item.textContent = `✓ ${result.message}`;
            } else {
                item.className = 'download-item error';
                item.textContent = `✗ ${result.message}`;
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
    init();

    // 右侧边栏：主界面 / 设置 / 关于
    document.getElementById('navMain').addEventListener('click', () => showView('main'));
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
