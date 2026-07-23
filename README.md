# Bili Downloader (Tauri Version)

一个基于 Rust + Tauri 2 构建的 Bilibili 视频下载工具。

## ✨ 功能特性

- [x] **视频下载**: 支持通过 BV 号或链接下载 Bilibili 视频。
- [x] **番剧下载**: 支持通过链接下载 Bilibili 番剧/剧集。
- [x] **画质选择**: 自动获取可用画质，默认下载最高画质（如 4K）。
- [x] **二维码登录**: 内置二维码登录功能，支持获取更高画质权限。
- [x] **实时进度**: 显示下载进度、当前速度及预计剩余时间。
- [x] **历史记录**: 自动记录下载历史到本地日志文件。
- [x] **自定义设置**: 支持自定义视频保存路径。
- [x] **黑夜模式**: 支持自定义白天和黑夜模式。


## 📋 环境要求

在开始之前，请确保您的开发环境已安装以下工具：

1.  **Rust**: [安装指南](https://www.rust-lang.org/tools/install)
2.  **Node.js**: [下载地址](https://nodejs.org/) (建议使用的是 LTS 版本)
3.  **FFmpeg**: 必须安装并添加到系统环境变量中。
    - 程序需要调用 `ffmpeg` 命令来合并视频流和音频流。
    - [下载 FFmpeg](https://ffmpeg.org/download.html)

## 🚀 安装与运行

1.  **克隆仓库**

    ```bash
    git clone https://github.com/yourusername/bilidown_tauri.git
    cd bilidown_tauri
    ```

2.  **安装前端依赖**

    ```bash
    npm install
    # 或者使用 yarn / pnpm
    # yarn install
    # pnpm install
    ```

3.  **开发模式运行**

    此命令将同时启动前端服务器和 Rust 后端。

    ```bash
    npm run tauri dev
    ```

4.  **构建生产版本**

    构建完成后，安装包将位于 `src-tauri/target/release/bundle/` 目录下。

    ```bash
    npm run tauri build
    ```

## ⚙️ 配置文件说明

项目会在运行目录下生成以下文件：

- **`config.json`**: 配置文件，存储用户设置。
  ```json
  {
    "save_path": "./download" // 视频下载保存路径
  }
  ```
- **`dat.log`**: 下载历史记录日志文件。
- **`cookie.json`** / **`load`**: 用于存储登录状态和 Cookie 信息。

## 📂 项目结构

```
bilidown_tauri/
├── src/                 # 前端源代码
│   ├── index.html       # 主界面 HTML
│   ├── main.js          # 前端逻辑与 Tauri 交互
│   ├── styles.css       # 全局样式
│   ├── about.html       # 关于页
│   └── ...
├── src-tauri/           # Rust 后端源代码
│   ├── src/
│   │   ├── main.rs      # 程序入口
│   │   ├── lib.rs       # Tauri命令注册与模块管理
│   │   ├── config.rs    # 配置管理
│   │   ├── down_bv.rs   # BV视频下载逻辑
│   │   ├── down_bangumi.rs # 番剧下载逻辑
│   │   └── ...
│   ├── Cargo.toml       # Rust 依赖配置
│   └── tauri.conf.json  # Tauri 项目配置
├── package.json         # Node.js 依赖配置
└── README.md            # 项目说明文档
```

## 📝 许可证

[MIT License](LICENSE)
