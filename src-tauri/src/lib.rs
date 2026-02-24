// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod down_bangumi;
mod down_bv;
mod init_;
mod progress;
mod qrcode_login;
mod refresh_cookie;
mod resolution;
mod wbi;

use anyhow::Result;
use config::ConfigState;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::Emitter;
use tokio::sync::mpsc;

#[derive(Debug, Serialize, Deserialize)]
struct VideoInfo {
    title: String,
    pic_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct DownloadResult {
    success: bool,
    message: String,
    title: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct LoginResult {
    success: bool,
    message: String,
    qr_code_path: Option<String>,
}

/// 获取支持的分辨率列表
#[tauri::command]
fn get_resolutions() -> Vec<String> {
    vec![
        "HDR".to_string(),
        "4K".to_string(),
        "1080P+".to_string(),
        "1080P60".to_string(),
        "1080P".to_string(),
        "720P".to_string(),
        "480P".to_string(),
        "360P".to_string(),
    ]
}

/// 登录 - 生成二维码并返回路径
#[tauri::command]
async fn login() -> Result<LoginResult, String> {
    let client = Client::new();

    match qrcode_login::login_qrcode(&client).await {
        true => Ok(LoginResult {
            success: true,
            message: "登录成功".to_string(),
            qr_code_path: Some("output.png".to_string()),
        }),
        false => Ok(LoginResult {
            success: false,
            message: "登录失败或已取消".to_string(),
            qr_code_path: None,
        }),
    }
}

/// 登出 - 删除 Cookie 文件
#[tauri::command]
async fn logout() -> Result<(), String> {
    match std::fs::remove_file("load") {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("登出失败: {}", e)),
    }
}

/// 获取视频信息（标题和封面）
#[tauri::command]
async fn get_video_info(url: String) -> Result<VideoInfo, String> {
    let video = init_::get_epid_season(&url).map_err(|e| format!("解析 URL 失败: {}", e))?;

    let (title, pic_url) = init_::get_title_pic(&video)
        .await
        .map_err(|e| format!("获取视频信息失败: {}", e))?;

    Ok(VideoInfo { title, pic_url })
}

/// 内部：执行单任务下载并可选上报进度与标题
async fn download_video_with_tx(
    url: String,
    resolution: String,
    save_path: String,
    progress_tx: Option<mpsc::Sender<progress::DownloadProgress>>,
    title_tx: Option<(usize, mpsc::Sender<(usize, String)>)>,
) -> Result<DownloadResult, String> {
    let video = init_::get_epid_season(&url).map_err(|e| format!("解析 URL 失败: {}", e))?;

    let rsl = if resolution.is_empty() {
        "4K".to_string()
    } else {
        resolution
    };

    match init_::choose_download_method(&video, &rsl, &save_path, progress_tx, title_tx).await {
        Ok(title) => Ok(DownloadResult {
            success: true,
            message: format!("下载完成: {}", title),
            title: Some(title),
        }),
        Err(e) => Ok(DownloadResult {
            success: false,
            message: format!("下载失败: {}", e),
            title: None,
        }),
    }
}

/// 下载视频（带实时进度）
#[tauri::command]
async fn download_video(
    app: tauri::AppHandle,
    url: String,
    resolution: String,
    save_path: String,
) -> Result<DownloadResult, String> {
    let (tx, mut rx) = mpsc::channel::<progress::DownloadProgress>(64);
    let app_emit = app.clone();
    let recv_handle = tokio::spawn(async move {
        while let Some(p) = rx.recv().await {
            let _ = app_emit.emit("download-progress", &p);
        }
    });

    let result = download_video_with_tx(url, resolution, save_path, Some(tx.clone()), None).await;
    drop(tx);
    recv_handle.await.ok();
    result
}

/// 批量下载视频：每个任务独立进度，进度事件带 url_index
#[tauri::command]
async fn download_videos(
    app: tauri::AppHandle,
    urls: Vec<String>,
    resolution: String,
    save_path: String,
) -> Result<Vec<DownloadResult>, String> {
    let rsl = if resolution.is_empty() {
        "4K".to_string()
    } else {
        resolution
    };

    let (tx_agg, mut rx_agg) = mpsc::channel::<(usize, progress::DownloadProgress)>(64);
    let (title_tx, mut title_rx) = mpsc::channel::<(usize, String)>(8);
    let app_emit = app.clone();
    let recv_handle = tokio::spawn(async move {
        while let Some((url_index, p)) = rx_agg.recv().await {
            let payload = serde_json::json!({
                "url_index": url_index,
                "downloaded": p.downloaded,
                "total": p.total,
                "percent": p.percent,
                "speed": p.speed,
                "eta_secs": p.eta_secs,
                "file_index": p.file_index,
                "file_count": p.file_count,
            });
            let _ = app_emit.emit("download-progress", payload);
        }
    });
    let app_title = app.clone();
    let title_handle = tokio::spawn(async move {
        while let Some((url_index, title)) = title_rx.recv().await {
            let payload = serde_json::json!({ "url_index": url_index, "title": title });
            let _ = app_title.emit("download-task-title", payload);
        }
    });

    let mut results = Vec::new();
    for (index, url) in urls.into_iter().enumerate() {
        let (tx_per, mut rx_per) = mpsc::channel::<progress::DownloadProgress>(64);
        let tx_agg = tx_agg.clone();
        let index = index;
        let forwarder = tokio::spawn(async move {
            while let Some(p) = rx_per.recv().await {
                let _ = tx_agg.send((index, p)).await;
            }
        });

        let result = download_video_with_tx(
            url,
            rsl.clone(),
            save_path.clone(),
            Some(tx_per.clone()),
            Some((index, title_tx.clone())),
        )
        .await;
        drop(tx_per);
        forwarder.await.ok();

        match result {
            Ok(r) => results.push(r),
            Err(e) => results.push(DownloadResult {
                success: false,
                message: e,
                title: None,
            }),
        }
    }

    drop(tx_agg);
    drop(title_tx);
    recv_handle.await.ok();
    title_handle.await.ok();
    Ok(results)
}

/// 获取保存路径
#[tauri::command]
async fn get_save_path(state: tauri::State<'_, ConfigState>) -> Result<String, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.save_path.clone())
}

/// 设置保存路径
#[tauri::command]
async fn set_save_path(state: tauri::State<'_, ConfigState>, path: String) -> Result<(), String> {
    {
        let mut config = state.config.lock().map_err(|e| e.to_string())?;
        config.save_path = path;
    }
    state.save()?; // 保存到文件
    Ok(())
}

/// 检查是否已登录
#[tauri::command]
async fn check_login() -> Result<bool, String> {
    let path = Path::new("load");
    Ok(path.exists())
}

/// 读取下载历史记录
#[tauri::command]
async fn read_history_log() -> Result<String, String> {
    if Path::new("dat.log").exists() {
        std::fs::read_to_string("dat.log").map_err(|e| e.to_string())
    } else {
        Ok(String::new())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化配置，如果不存在先创建一个默认的
    let config_state = ConfigState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(config_state) // 注入状态
        .invoke_handler(tauri::generate_handler![
            get_resolutions,
            get_save_path,
            set_save_path,
            check_login,
            login,
            logout,
            get_video_info,
            download_video,
            download_videos,
            read_history_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
