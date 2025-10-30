# 单词记录器 - Tauri桌面应用

基于Tauri + TypeScript构建的跨平台单词记录器桌面应用。

## 功能特性

- **多模式管理**: 支持创建多个单词分类模式（如英语、日语、专业词汇等）
- **一键保存**: 快速保存剪贴板单词到当前模式
- **智能复习**: 随机抽取当前模式下的单词进行复习
- **模式切换**: 轻松在不同单词分类间切换
- **独立存储**: 每个模式的单词列表完全独立
- **批量导入导出**: 支持TXT格式的批量导入和按模式导出
- **全局快捷键**: 支持 CMD+U (Mac) / Ctrl+U (Windows) 快速显示/隐藏窗口

## 技术栈

- **前端**: TypeScript + Vite
- **桌面框架**: Tauri 2.x (Rust)
- **存储**: Tauri Store Plugin
- **剪贴板**: Tauri Clipboard Manager Plugin
- **通知**: Tauri Notification Plugin

## 开发环境要求

- Node.js 20.11.0 或更高版本
- Rust (通过 [rustup](https://rustup.rs/) 安装)
- macOS Sonoma 14+ 或 Windows 10+

## 安装依赖

```bash
npm install
```

## 开发运行

```bash
npm run tauri dev
```

## 构建应用

```bash
npm run tauri build
```

构建产物将位于 `src-tauri/target/release/` 目录下。

## 项目结构

```
RI/
├── src/                    # TypeScript 前端源代码
│   ├── main.ts            # 主入口文件
│   └── utils/             # 工具函数
│       ├── storage.ts     # 存储适配器
│       ├── clipboard.ts   # 剪贴板工具
│       ├── shortcut.ts    # 快捷键处理
│       └── notification.ts # 通知工具
├── src-tauri/             # Rust 后端
│   ├── src/
│   │   ├── main.rs        # Rust 入口
│   │   └── lib.rs         # 主逻辑和IPC处理
│   ├── Cargo.toml         # Rust 依赖配置
│   └── tauri.conf.json    # Tauri 配置
├── index.html             # 主HTML文件
├── style.css              # 样式文件
└── package.json           # Node.js 依赖配置
```

## 从Chrome插件转换

本项目已从Chrome插件成功转换为Tauri桌面应用，主要变更：

- `chrome.storage` → `@tauri-apps/plugin-store`
- `navigator.clipboard` → `@tauri-apps/plugin-clipboard-manager`
- `chrome.commands` → `@tauri-apps/plugin-global-shortcut`
- `chrome.notifications` → `@tauri-apps/plugin-notification`
- `chrome.downloads` → `@tauri-apps/plugin-dialog` + `@tauri-apps/api/fs`

## 许可证

MIT License
