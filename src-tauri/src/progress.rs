use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    /// 当前文件已下载字节数
    pub downloaded: u64,
    /// 当前文件总字节数（未知时为 0）
    pub total: u64,
    /// 当前文件进度 0-100
    pub percent: f64,
    /// 下载速度 字节/秒
    pub speed: f64,
    /// 预计剩余秒数
    pub eta_secs: u64,
    /// 当前是第几个文件（如 0=视频 1=音频）
    pub file_index: u32,
    /// 当前任务总文件数（如 2=视频+音频）
    pub file_count: u32,
}
