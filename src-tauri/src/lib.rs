// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod down_bangumi;
mod down_bv;
mod init_;
mod qrcode_login;
mod refresh_cookie;
mod resolution;
mod wbi;

use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::Emitter;

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

/// 下载视频
#[tauri::command]
async fn download_video(
    url: String,
    resolution: String,
    save_path: String,
) -> Result<DownloadResult, String> {
    let video = init_::get_epid_season(&url).map_err(|e| format!("解析 URL 失败: {}", e))?;

    let rsl = if resolution.is_empty() {
        "4K".to_string()
    } else {
        resolution
    };

    // 更新保存路径（如果需要）
    if !save_path.is_empty() {
        // 这里可以更新全局保存路径
    }

    match init_::choose_download_method(&video, &rsl, &save_path).await {
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

/// 批量下载视频
#[tauri::command]
async fn download_videos(
    urls: Vec<String>,
    resolution: String,
    save_path: String,
) -> Result<Vec<DownloadResult>, String> {
    let mut results = Vec::new();
    let rsl = if resolution.is_empty() {
        "4K".to_string()
    } else {
        resolution
    };

    for url in urls {
        let result = download_video(url, rsl.clone(), save_path.clone()).await;
        match result {
            Ok(r) => results.push(r),
            Err(e) => results.push(DownloadResult {
                success: false,
                message: e,
                title: None,
            }),
        }
    }

    Ok(results)
}

/// 获取保存路径
#[tauri::command]
async fn get_save_path() -> Result<String, String> {
    let path = Path::new("load");
    // 这里可以从配置文件读取，暂时返回默认值
    Ok("./download".to_string())
}

/// 设置保存路径
#[tauri::command]
async fn set_save_path(path: String) -> Result<(), String> {
    // 这里可以保存到配置文件
    Ok(())
}

/// 检查是否已登录
#[tauri::command]
async fn check_login() -> Result<bool, String> {
    let path = Path::new("load");
    Ok(path.exists())
}

#[tauri::command]
async fn download_progress(app: tauri::AppHandle) -> Result<(), String> {
    let total_steps = 100;
    for i in 0..=total_steps {
        app.emit("download-progress", i)
            .map_err(|e| e.to_string())?;
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            download_progress,
            get_resolutions,
            get_save_path,
            set_save_path,
            check_login,
            login,
            logout,
            get_video_info,
            download_video,
            download_videos
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
