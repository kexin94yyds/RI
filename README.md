# Replace-Information

<div align="center">
  <img src="RI.png" alt="Replace-Information Logo" width="128"/>
  <h3>信息置换工具 - 强大的剪贴板管理和笔记应用</h3>
  <p>macOS 桌面应用，支持多模式剪贴板管理、富文本笔记、自动更新</p>
</div>

## ✨ 功能特性

### 📋 剪贴板管理
- **多模式分类**: 创建无限个模式分类（学习、编程、单词等）
- **自动监听**: 实时监听剪贴板内容变化
- **智能去重**: 自动检测并过滤重复内容
- **多格式支持**: 文本、图片、富文本、链接
- **快速搜索**: 实时搜索历史记录
- **拖拽排序**: 支持模式拖拽排序

### 📝 富文本笔记
- **Markdown 支持**: 实时预览 Markdown 渲染
- **图片粘贴**: 直接粘贴图片到笔记
- **模式同步**: 每个模式独立的笔记空间
- **置顶窗口**: 支持笔记窗口置顶显示
- **自动保存**: 实时保存，不丢失内容

### ⌨️ 快捷键
- `Shift+Command+U` - 呼出/隐藏主窗口
- `Command+U` - 快速保存剪贴板（不显示窗口）
- `Command+M` - 呼出/隐藏笔记窗口
- `Command+Delete` - 删除选中项（无需确认）
- `Command+Enter` - 打开链接

### 🔄 自动更新
- **GitHub 集成**: 自动检测 GitHub Releases 新版本
- **智能提示**: 发现新版本时弹窗提示
- **后台下载**: 一键下载更新包
- **平滑更新**: 退出时自动安装更新

## 📦 安装

### 从 Release 下载（推荐）

1. 访问 [GitHub Releases](https://github.com/kexin94yyds/RI/releases)
2. 下载最新版本的 `Replace-Information-X.X.X-arm64.dmg`
3. 双击 DMG 文件
4. 拖拽应用到 Applications 文件夹
5. 首次打开需要右键选择"打开"

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/kexin94yyds/RI.git
cd RI

# 安装依赖
npm install

# 开发运行
npm start

# 打包应用
npm run build:mac
```

## 🚀 快速开始

### 1. 启动应用
- 从 Applications 文件夹打开
- 或使用快捷键 `Shift+Command+U`

### 2. 创建模式
- 点击左侧 "添加模式" 按钮
- 输入模式名称（如：学习、工作、单词）
- 按 Enter 保存

### 3. 保存内容
- **自动保存**: 复制内容后自动添加到当前模式
- **快速保存**: 按 `Command+U` 不显示窗口直接保存
- **手动保存**: 在窗口中点击"保存"按钮

### 4. 使用笔记
- 按 `Command+M` 打开笔记窗口
- 支持 Markdown 语法
- 可以粘贴图片
- 点击置顶按钮固定窗口

## 💻 开发

### 技术栈
- **Electron**: 桌面应用框架
- **JavaScript**: 原生 JS，无构建工具
- **electron-store**: 数据持久化
- **electron-updater**: 自动更新
- **marked.js**: Markdown 渲染

### 项目结构
```
RI/
├── electron-main.js      # Electron 主进程
├── electron-preload.js   # 预加载脚本
├── app.js                # 主窗口逻辑
├── index.html            # 主窗口界面
├── note-window.js        # 笔记窗口逻辑
├── note-window.html      # 笔记窗口界面
├── style.css             # 主样式
├── note-editor.css       # 笔记编辑器样式
├── package.json          # 依赖配置
├── RI.png                # 应用图标
└── dist/                 # 打包输出
```

### 开发命令

```bash
# 开发模式（带日志）
npm run dev

# 生产模式
npm start

# 打包 macOS
npm run build:mac

# 打包 Windows
npm run build:win

# 打包 Linux
npm run build:linux
```

### 数据存储位置

- **macOS**: `~/Library/Application Support/replace-information/`
- **Windows**: `%APPDATA%/replace-information/`
- **Linux**: `~/.config/replace-information/`

配置文件：`config.json`
图片存储：`clipboard-images/`

## 🔄 更新

### 自动更新（v2.1.0+）

应用会自动检测更新，发现新版本时会提示：
1. 点击"立即下载"下载更新
2. 下载完成后点击"立即重启"
3. 应用自动安装并重启

详见 [更新指南](UPDATE_GUIDE.md)

### 手动更新

1. 下载最新的 DMG 文件
2. 拖拽到 Applications 覆盖旧版本
3. 重新打开应用

## 📚 文档

- [更新指南](UPDATE_GUIDE.md) - 如何更新和发布新版本
- [故障排查](TROUBLESHOOTING.md) - 常见问题解决方案
- [笔记功能](NOTE_FEATURE.md) - 笔记功能详细说明
- [集成总结](INTEGRATION_SUMMARY.md) - 功能集成说明

## 🐛 问题反馈

如果遇到问题或有功能建议：

1. 查看 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
2. 搜索 [Issues](https://github.com/kexin94yyds/RI/issues)
3. 提交新的 Issue

## 📝 更新日志

### v2.1.0 (2025-11-01)
- ✨ 添加自动更新功能
- ✨ 添加笔记窗口置顶功能
- ✨ 优化删除操作，支持快捷键直接删除
- 🎨 更新应用图标为黑白放射图标
- 🐛 修复键盘事件冲突问题
- 🐛 修复笔记编辑器输入问题

### v2.0.0
- ✨ 添加富文本笔记功能
- ✨ 添加模式同步功能
- ✨ 支持图片粘贴和预览
- 🎨 全新界面设计
- ⚡️ 性能优化

## 📄 许可证

ISC License

## 👨‍💻 开发者

- GitHub: [@kexin94yyds](https://github.com/kexin94yyds)
- Repository: [RI](https://github.com/kexin94yyds/RI)

## 🙏 致谢

- [Electron](https://www.electronjs.org/) - 桌面应用框架
- [electron-store](https://github.com/sindresorhus/electron-store) - 数据持久化
- [electron-updater](https://github.com/electron-userland/electron-builder) - 自动更新
- [marked](https://marked.js.org/) - Markdown 解析
- [ClipBook](https://github.com/vladimir-ikryanov/ClipBook) - 设计灵感

---

<div align="center">
  Made with ❤️ by kexin94yyds
</div>
