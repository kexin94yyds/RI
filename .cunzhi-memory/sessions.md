# 会话摘要

## 2025-12-31 11:08
## 会话摘要 2025-12-31

### 任务目标
实现 Cmd+N 打开新窗口并动态更新标题功能

### 已完成
1. **分享菜单位置调整** - `ContentView.swift:255,264`
   - 从中间改为右上角工具栏按钮下方
   - x: `maxX - 50`, y: `maxY - 40`

### 暂时搁置
2. **窗口标题动态更新** - ES6 模块加载时序问题
   - 尝试了多种方案：延迟调用、轮询检查、KVO观察
   - 根因：ES6 模块可能未成功加载
   - 需要检查 WebView JavaScript 控制台日志

### 修改的文件
- `ContentView.swift` - KVO观察、分享菜单位置
- `note-window.js` - updateTitle 改用 document.title
- `note-window.html` - 占位函数

## 2025-12-31 17:30
### Notebook-Mac 全局呼出与工具化改造

**1. 核心进展**：
- **全局快捷键**：实现了 `Option + M` 全局呼出/隐藏逻辑（基于 Carbon API `HotKeyManager.swift`）。
- **工具化 (Type B)**：应用已切换为附属应用模式 (`.accessory`)，**Dock 图标已隐藏**。
- **跨桌面跟随**：窗口配置为 `.canJoinAllSpaces`，可在所有 macOS Spaces 和全屏应用上弹出。
- **状态持久化**：将 WebView 加载状态 (`loadedFileName`) 移至 `Coordinator`，解决了窗口切换导致的内容重置/白屏问题。
- **关闭拦截**：拦截了窗口关闭事件，改为隐藏应用，确保笔记内容不因误关而丢失。

**2. 遗留任务**：
- **Cmd + N 增强**：用户希望 `Cmd + N` 能新建独立的笔记窗口（目前默认为打开新的主窗口）。
- **UI 恢复**：用户反馈之前的“原生感”或特定页面显示有出入，需要检查 `App-Native-Shell.swift` 中的旧样式并按需迁移到 `ContentView.swift`。
- **布局优化**：考虑重新引入 `.windowStyle(.hiddenTitleBar)` 以增强沉浸感。

**3. 技术交接点**：
- `HotKeyManager.swift`: 底层快捷键逻辑。
- `AppDelegate`: 位于 `Notebook_MacApp.swift`，负责生命周期、Dock 隐藏、窗口拦截及 Space 跟随逻辑。
- `ContentView.swift`: 目前的主逻辑容器，包含 WebView 通信。

