# 拖拽排序问题排查与修复记录（RI）

## 概要
- 现象：在左侧模式列表拖拽某个模式时，拖拽“幽灵预览”显示到当前窗口背后，用户看不到；某些情况下拖拽开始后立即结束，无法排序；最初还出现“只能拖拽当前选定的模式”。
- 环境：Electron 28（Chromium 内核），macOS。参见 `RI/package.json:1`。
- 影响：模式排序不可用，严重影响使用体验。

## 复现步骤（当时）
- 在侧栏按住某个模式按钮拖动，发现：
  - 幽灵预览不在窗口上层，而是“在背后”；
  - 控制台无 dragover/drop 日志，仅有 dragstart 紧接 dragend；
  - 只能拖拽当前选中的模式项（早期现象）。

## 初始假设（候选根因）
- 原生 HTML5 DnD 在 macOS/Electron 下的层级问题：dragImage 被绘制到窗口背后。
- 我们隐藏了 dragImage 后，插入线不够明显，主观“看不见拖拽对象”。
- 事件目标不稳定（使用 `e.target` 命中子元素，导致插入线/计算错位）。
- 容器裁剪/层级（overflow/z-index）导致插入线被遮挡或裁剪。
- 页面无“允许放置”的目标，Chromium 取消拖拽（只有 dragstart→dragend）。
- 窗口/区域劫持（`-webkit-app-region: drag`、DevTools 停靠等）导致 DOM 层拖拽被中断。
- 拖拽瞬间触发焦点切换/重渲染，销毁源元素导致拖拽中断。

## 诊断与验证
- 加入分层调试日志（按钮级 / 容器级 / 文档级）：`RI/app.js:24`、`RI/app.js:283`、`RI/app.js:574`。
  - 按钮级：`[DND] dragstart/dragover/dragleave/drop/dragend`
  - 容器级（侧栏捕获）：`[sidebar] dragenter/dragover/...`
  - 文档级（捕获）：`[doc] dragstart/drag/dragover/drop/dragend`
- 运行时开关：`window.__dndDebug.setHideNative(false|true)`，`window.__dndDebug.enableLogs(true|false)`，`window.__dndDebug.enableGlobalAllowDrop(true)`（`RI/app.js:400` 附近），便于定位是“预览层级”还是“无 droppable 目标”。
- 关键观察：
  - 日志只出现 `[doc] dragstart` 与 `[DND] dragstart`，随后立刻 `[doc] dragend` 与 `[DND] dragend`；没有任何 drag/dragover/drop。
  - 即使启用全局 allow drop 也无 dragover，说明不是简单的“没有 droppable 目标”。
  - 焦点切换日志显示拖拽过程中没有必然的 focus/blur 干扰。
- 结论：Electron/Chromium 在该环境下的原生 HTML5 DnD 会被立即取消（窗口/区域策略导致），属于环境相关问题，继续在 HTML5 DnD 方案上兜底成本高、可预期性差。

## 修复方案（最终）
采用“自定义鼠标拖拽”替代原生 HTML5 DnD：
- 行为：mousedown 超过阈值后进入拖拽，创建“悬浮预览卡片”（fixed + 高 z-index），随鼠标移动；通过 `document.elementFromPoint` 命中按钮并显示上/下插入线；mouseup 计算索引并更新  顺序。
- 细节：
  - 容器级事件委托，避免“只能拖选中项”的限制（新绑定见 `bindSidebarMouseDnDDelegation`）。
  - 拖拽时 `body.no-select` 禁止选中文本，插入线 3px 蓝色、提高 z-index，侧栏边缘自动滚动。
  - 拖拽完成后抑制一次 click，避免误切换模式。

## 代码位置
- 委托绑定与挂载完成日志：
  - `RI/app.js:283`（sidebar items attached）
  - `RI/app.js:284` 调用 `bindSidebarMouseDnDDelegation()`
  - `RI/app.js:412` 定义 `bindSidebarMouseDnDDelegation`
- 自定义拖拽核心：
  - `RI/app.js:425` `function startModeMouseDrag(ev, button, modeId)`
  - 悬浮预览创建：`RI/app.js:441` 附近（clone 节点、fixed 定位、z-index 10000）
  - 命中检测与插入线：`RI/app.js:494` 附近（elementFromPoint + insert-before/after）
  - 计算并提交排序：`RI/app.js:515`（调用 `moveModeToIndex`）
- 辅助样式：
  - 插入线与禁选：`RI/style.css:96`（insert-before）、`RI/style.css:101`（insert-after）、`RI/style.css:107`（body.no-select）

## 行为验证
- 拖拽任意模式项，悬浮预览卡片始终在当前窗口上层；目标项上下展示清晰蓝线；松手后顺序更新。
- 不依赖原生 HTML5 DnD，规避了在特定 macOS/Electron 组合下 drag 立即被取消的问题。

## 经验与建议
- 在 Electron/macOS 环境中，如遇：
  - 只有 `dragstart`→`dragend`，没有 `drag/dragover/drop`：优先怀疑环境导致的原生 DnD 取消；可考虑自定义鼠标拖拽替代。
  - 幽灵预览在窗口后面：可尝试自定义 dragImage 或直接隐藏原生 dragImage + 自定义悬浮预览。
  - 插入反馈不明显：用上/下边框 + 提高 z-index，必要时加阴影；同时避免 overflow 裁剪。
- 调试技巧：
  - 分层日志（按钮/容器/文档）能快速判断事件流到达层级；
  - 运行时开关便于线上快速甄别问题源头；
  - 关注窗口 focus/blur 与重渲染是否打断拖拽。

## 变更摘要
- 移除侧栏按钮原生 DnD，改为容器级委托 + 自定义鼠标拖拽；新增悬浮预览卡片、自动滚动、点击抑制与禁选样式。
- 保留旧的 DnD 调试代码与运行时开关（便于将来切回对比）。

---
后续如果再有典型问题（如窗口缩放比例下的命中精度、跨显示器拖拽等），请在本文件继续追加“问题 → 诊断 → 修复 → 代码位置”的记录。

