# 项目上下文信息

- ## 待解决问题：窗口标题动态更新

**状态**: 暂时搁置

**问题描述**:
- Cmd+N 打开新窗口后，窗口标题没有根据笔记内容动态更新
- ES6 模块加载时序问题导致 JavaScript 代码可能未执行

**已尝试方案**:
1. 延迟调用 updateTitle() - 失败
2. 轮询检查函数是否存在 - 失败（2秒后仍不存在）
3. 内联占位函数 + KVO 观察 document.title - 未生效

**根因猜测**:
- ES6 模块导入失败（db.js 或 migrate.js）
- 需要检查 WebView 的 JavaScript 控制台日志

**相关文件**:
- ContentView.swift: KVO 观察 webView.title
- note-window.js: updateTitle() 更新 document.title
- note-window.html: 占位函数
