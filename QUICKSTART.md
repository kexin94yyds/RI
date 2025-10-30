# 快速开始指南

## 安装步骤

1. **安装Rust**（如果尚未安装）:
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

2. **安装项目依赖**:
   ```bash
   npm install
   ```

3. **开发模式运行**:
   ```bash
   npm run tauri dev
   ```

## 快捷键

- **macOS**: `Command+U` 显示/隐藏窗口
- **Windows**: `Ctrl+U` 显示/隐藏窗口

## 注意事项

- 首次运行可能需要下载Rust依赖，请耐心等待
- 如果遇到权限问题，请确保已授予应用必要的系统权限
- 窗口默认在失焦时自动隐藏

## 构建发布版本

```bash
npm run tauri build
```

构建完成后，应用将位于 `src-tauri/target/release/` 目录。

