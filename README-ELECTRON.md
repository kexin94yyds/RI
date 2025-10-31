# 单词记录器 - Electron 桌面版

✅ **已成功转换为 Electron 应用！**

## 🚀 快速开始

### 运行应用
```bash
npm start
```

### 开发模式（带控制台）
```bash
npm run dev
```

## ⌨️ 全局快捷键

- **macOS**: `Shift + Command + U` - 显示/隐藏窗口
- **Windows/Linux**: `Shift + Ctrl + U` - 显示/隐藏窗口

## ✨ 功能特性

1. **多模式管理** - 支持创建、编辑、删除多个单词模式
2. **快捷保存** - 一键保存剪贴板中的单词
3. **智能复习** - 随机复习单词，记住后可移除
4. **导入导出** - 支持 TXT 格式的批量导入导出
5. **无边框窗口** - 始终置顶，失焦自动隐藏
6. **全局快捷键** - 任何时候都能快速呼出

## 📂 项目结构

```
RI/
├── electron-main.js     # Electron 主进程
├── electron-preload.js  # 安全桥接层
├── app.js               # 前端逻辑
├── index.html           # 主界面
├── style.css            # 样式
└── package.json         # 项目配置
```

## 🔧 技术栈

- **Electron 28** - 跨平台桌面应用框架
- **electron-store** - 持久化存储
- 原生 JavaScript - 无需编译

## 📦 打包发布

安装打包工具：
```bash
npm install --save-dev electron-builder
```

添加到 `package.json`：
```json
"scripts": {
  "build": "electron-builder"
},
"build": {
  "appId": "com.wordrecorder.app",
  "productName": "单词记录器",
  "mac": {
    "category": "public.app-category.productivity"
  }
}
```

执行打包：
```bash
npm run build
```

## 🎉 完成

现在您可以：
1. 按 `npm start` 启动应用
2. 使用快捷键随时呼出窗口
3. 享受流畅的单词记录体验！

---

**注意**: 如果遇到任何问题，可以运行 `npm run dev` 查看控制台输出。


