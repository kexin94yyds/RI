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

# 笔记窗口数据保存问题排查与修复记录

## 概要
- 现象：
  1. 主页 `index.html` 文件被意外清空，导致应用无法启动
  2. 笔记窗口中上传的图片无法保存
  3. 切换模式时，当前模式的笔记内容丢失
- 环境：Electron 应用，使用 IndexedDB 存储数据
- 影响：用户数据可能丢失，严重影响使用体验
- 修复日期：2025-11-01

## 问题 1：index.html 文件被清空

### 复现步骤
- 打开应用发现主窗口无法显示
- 检查 `index.html` 发现文件只剩一行空白

### 根本原因
- 文件被意外清空或覆盖（可能是编辑器误操作）
- 打包好的应用仍在运行是因为使用的是打包时的完整文件副本

### 修复方案
```bash
# 从 git 历史恢复文件
cd /Users/apple/信息置换起/RI
git show HEAD:index.html > index.html
```

### 代码位置
- 受影响文件：`RI/index.html`
- 恢复命令记录在问题排查日志中

## 问题 2 & 3：笔记内容保存时机问题

### 复现步骤
1. 在笔记窗口上传图片
2. 立即切换到另一个模式（不等待）
3. 切换回来发现图片丢失
4. 或者：输入文字后立即切换模式，文字也会丢失

### 根本原因
笔记保存使用了 **500ms 防抖机制**，存在以下问题：
- 图片插入后触发 `handleEditorInput()`，但只是设置了 500ms 后保存的定时器
- 如果用户在 500ms 内切换模式、关闭窗口或窗口失去焦点，定时器被销毁，内容未保存
- 模式切换时虽然调用了 `saveNoteContent()`，但防抖定时器中的最新内容可能还未被保存

### 诊断过程
1. 检查 `note-window.js` 的保存逻辑
2. 发现 `handleEditorInput()` 使用 `setTimeout(saveNoteContent, 500)` 防抖
3. 发现 `switchToMode()` 虽然有保存，但没有清除防抖定时器
4. 发现关闭窗口和失去焦点时没有强制保存

### 修复方案

#### 1. 优化模式切换前的保存
```javascript
// note-window.js:181
async function switchToMode(mode) {
  try {
    // 清除防抖定时器，立即保存当前笔记
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    
    // 确保保存最新的编辑器内容
    await saveNoteContent();
    
    // 切换模式...
  }
}
```

#### 2. 优化图片上传后的保存
```javascript
// note-window.js:698
async function handleImageFile(file) {
  try {
    // 插入图片...
    insertElementAtCursor(img);
    
    // 立即更新并保存内容
    editorContent = editor.innerHTML;
    updateTitle();
    
    // 清除之前的防抖定时器，设置新的保存
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveNoteContent();
    }, 500);
  }
}
```

#### 3. 添加窗口失去焦点时自动保存
```javascript
// note-window.js:303
window.addEventListener('blur', async () => {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  await saveNoteContent();
  console.log('窗口失去焦点，已自动保存');
});
```

#### 4. 优化关闭窗口前的保存
```javascript
// note-window.js:419
async function closeWindow() {
  try {
    // 关闭前清除防抖定时器并保存
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    await saveNoteContent();
  } finally {
    window.close();
  }
}
```

#### 5. 优化接收 IPC 模式切换通知时的保存
```javascript
// note-window.js:334
window.electron.ipcRenderer.on('mode-changed', async (data) => {
  if (data.mode) {
    // 先保存当前笔记
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    await saveNoteContent();
    
    // 切换到新模式...
  }
});
```

### 代码位置
- 核心保存逻辑：`RI/note-window.js:781` (`saveNoteContent`)
- 编辑器输入处理：`RI/note-window.js:340` (`handleEditorInput`)
- 模式切换：`RI/note-window.js:181` (`switchToMode`)
- 图片处理：`RI/note-window.js:698` (`handleImageFile`)
- 窗口关闭：`RI/note-window.js:419` (`closeWindow`)
- 失去焦点保存：`RI/note-window.js:303` (blur 事件监听)
- IPC 模式切换：`RI/note-window.js:334` (mode-changed 监听)

### 修复效果
- ✅ 图片上传后立即切换模式，图片内容仍然保存
- ✅ 输入文字后立即切换模式，文字内容不会丢失
- ✅ 窗口失去焦点时自动保存，防止意外数据丢失
- ✅ 关闭窗口前强制保存，确保数据持久化
- ✅ 多个自动保存触发点，最大程度保护用户数据

### 测试步骤
1. 在笔记窗口输入文字，立即切换模式 → 内容应保留
2. 粘贴或拖拽图片到笔记，立即切换模式 → 图片应保留
3. 编辑笔记后切换到其他应用 → 内容应自动保存
4. 编辑笔记后关闭窗口，重新打开 → 内容应保留

## 数据库锁定问题

### 现象
启动开发版本时出现大量错误：
```
[ERROR:leveldb_factory.cc(88)] Failed to open LevelDB database from 
/Users/apple/Library/Application Support/replace-information/IndexedDB/file__0.indexeddb.leveldb,
IO error: .../LOCK: File currently in use. (ChromeMethodBFE: 15::LockFile::2)

[ERROR:quota_database.cc(950)] Could not open the quota database, resetting.
```

### 症状
- 应用启动后无法读取或保存数据
- 所有模式列表为空
- 历史记录无法加载
- 每次操作都触发数据库错误日志
- 可能导致数据损坏或无法访问

### 根本原因
**IndexedDB 的 LevelDB 后端使用文件锁机制，同一时间只允许一个进程访问数据库。**

常见触发场景：
1. **打包版本在后台运行**：通过应用图标启动的打包版本没有完全退出
2. **崩溃遗留锁**：上次应用崩溃，锁文件没有被清理
3. **多实例同时运行**：开发版本和打包版本同时启动
4. **文件系统问题**：网络驱动器或同步文件夹可能导致锁无法正确释放

### 诊断步骤

#### 1. 检查运行中的进程
```bash
# 查看所有 Electron 相关进程
ps aux | grep -i "electron\|replace-information" | grep -v grep

# 输出示例（有问题）：
# apple  88607  0.6  1588025696  /path/to/Electron.app/Contents/MacOS/Electron .
# apple  90020  0.2   444051472  Electron Helper (GPU)
# apple  90021  0.1   444004848  Electron Helper (network)
```

如果看到多个 Electron 进程，说明有实例在运行。

#### 2. 查看数据库锁文件
```bash
# 检查锁文件是否存在
ls -la "/Users/apple/Library/Application Support/replace-information/IndexedDB/file__0.indexeddb.leveldb/LOCK"

# 如果存在，查看是哪个进程持有
lsof "/Users/apple/Library/Application Support/replace-information/IndexedDB/file__0.indexeddb.leveldb/LOCK"
```

### 解决方案

#### 方案 1：正常关闭所有实例（推荐）
```bash
# 方式 A：使用 pkill（温和关闭）
pkill -f "replace-information"

# 方式 B：使用进程 ID（更精确）
# 先找到进程 ID
ps aux | grep "replace-information" | grep -v grep
# 然后 kill 对应的 PID
kill 88607 88606 90020 90021

# 等待进程完全退出
sleep 2

# 确认已关闭
ps aux | grep -i "electron" | grep -v grep
```

#### 方案 2：强制终止（进程无响应时）
```bash
# 强制关闭所有相关进程
kill -9 $(ps aux | grep "replace-information\|Electron.*replace" | grep -v grep | awk '{print $2}')

# 或者逐个强制关闭
kill -9 88607 88606 90020 90021

# 等待清理
sleep 2
```

#### 方案 3：清理锁文件（最后手段）
⚠️ **警告**：仅在确认没有进程运行时使用，否则可能导致数据损坏！

```bash
# 1. 确保所有进程已退出
ps aux | grep -i "electron" | grep -v grep

# 2. 如果确认没有进程，删除锁文件
rm "/Users/apple/Library/Application Support/replace-information/IndexedDB/file__0.indexeddb.leveldb/LOCK"

# 3. 如果数据库损坏严重，可能需要删除整个数据库
# （注意：这会丢失所有数据！）
# rm -rf "/Users/apple/Library/Application Support/replace-information/IndexedDB/"
```

#### 方案 4：使用活动监视器（图形界面）
1. 打开"活动监视器"（Command + Space，搜索"Activity Monitor"）
2. 搜索 "Electron" 或 "replace-information"
3. 选中所有相关进程
4. 点击左上角的 ❌ 按钮强制退出
5. 等待几秒后重新启动应用

### 重新启动应用
```bash
cd /Users/apple/信息置换起/RI

# 确保在正确的目录
pwd

# 启动开发版本
npm start

# 观察日志，确认没有数据库错误
# 正常启动应该看到：
# ✓ 已注册快捷键...
# 开发模式，跳过更新检查
# （没有 ERROR:leveldb_factory 错误）
```

### 预防措施

#### 1. 开发前检查
```bash
# 在启动开发版本前，先检查是否有进程运行
ps aux | grep -i "replace-information\|electron" | grep -v grep

# 如果有输出，说明有实例在运行，需要先关闭
```

#### 2. 正确退出应用
- **打包版本**：通过菜单栏图标完全退出，不要只关闭窗口
- **开发版本**：在终端使用 Ctrl+C 正常停止，不要直接关闭终端

#### 3. 使用不同的数据目录（可选）
如果需要同时运行开发版和打包版，可以配置不同的数据目录：

```javascript
// electron-main.js
const isDev = !app.isPackaged;
const userDataPath = isDev 
  ? path.join(app.getPath('userData'), 'dev')  // 开发版用独立目录
  : app.getPath('userData');                   // 打包版用默认目录

app.setPath('userData', userDataPath);
```

#### 4. 添加进程互斥锁
在 `electron-main.js` 中添加单实例锁定：

```javascript
// 确保只运行一个实例
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('应用已在运行，退出当前实例');
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // 有人尝试启动第二个实例，聚焦到现有窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
```

### 数据恢复

如果数据库损坏无法打开：

```bash
# 1. 备份损坏的数据库
cp -r "/Users/apple/Library/Application Support/replace-information" \
     "/Users/apple/Library/Application Support/replace-information.backup.$(date +%Y%m%d_%H%M%S)"

# 2. 尝试修复（需要 leveldb 工具）
# brew install leveldb
# leveldbutil repair "/path/to/database"

# 3. 如果无法修复，从备份恢复
# 或者使用导出的 JSON 文件重新导入
```

### 相关日志标识

当遇到数据库问题时，注意以下日志：
- ✅ **正常**：无 ERROR 日志，可以正常加载数据
- ⚠️ **锁定**：`LOCK: File currently in use`
- ⚠️ **损坏**：`Could not open the quota database, resetting`
- ⚠️ **权限**：`Permission denied`
- ⚠️ **崩溃**：`GPU process exited unexpectedly`（可能导致锁未释放）

## 经验与建议

### 防抖保存的最佳实践
- ⚠️ 防抖适合频繁输入场景，但必须在关键操作前强制保存
- ✅ 所有可能导致内容丢失的操作前都要：
  1. 清除防抖定时器
  2. 立即执行保存
  3. 等待保存完成后再执行操作
- ✅ 添加多重保护机制：失去焦点、关闭窗口、模式切换等

### 数据持久化策略
- 使用 IndexedDB 时注意数据库锁定问题
- 多个自动保存触发点：输入防抖、失去焦点、关闭前、切换前
- async/await 确保保存操作完成后再执行下一步

### 调试技巧
- 添加详细的保存日志：`console.log('笔记已自动保存')`
- 使用 git 管理代码，方便回滚和恢复文件
- 定期备份用户数据目录

---

# 不同模式笔记内容串联问题

## 概要
- 现象：在一个模式写的笔记内容出现在另一个模式的笔记页面上
- 环境：Electron 应用，使用 IndexedDB 存储，通过 IPC 同步模式状态
- 影响：用户数据混乱，无法区分不同模式的笔记
- 修复日期：2025-11-01

## 问题描述

### 预期行为
- 每个模式应该有独立的笔记内容
- 在"模式A"写的笔记只应该出现在"模式A"的笔记页面
- 切换到"模式B"应该显示"模式B"的笔记内容（或空白）

### 实际行为
- 在"模式A"写笔记后，切换到"模式B"仍然显示"模式A"的内容
- 或者在"模式B"写笔记后，之前"模式A"的笔记消失了
- 不同模式的笔记内容互相覆盖或混淆

## 根本原因

### 问题1：modes-sync 事件处理不当

主窗口会定期发送 `modes-updated` 事件（经 electron-main.js 转发为 `modes-sync`），原本用于同步模式列表。但笔记窗口错误地处理了这个事件：

```javascript
// 问题代码
window.electron.ipcRenderer.on('modes-sync', (data) => {
  modes = data.modes || [];
  if (data.currentMode) {
    const updatedMode = modes.find(m => m.id === data.currentMode.id);
    if (updatedMode) {
      currentMode = updatedMode;  // ❌ 直接覆盖
      loadNoteContent();           // ❌ 无条件重新加载
    }
  }
});
```

**问题**：
1. `modes-sync` 应该只是同步模式列表（用于下拉菜单），不应该改变当前正在编辑的模式
2. `data.currentMode` 是主窗口的当前模式，不一定是笔记窗口正在编辑的模式
3. 无条件调用 `loadNoteContent()` 会覆盖用户正在编辑的内容

### 问题2：模式对象引用混乱

- 主窗口和笔记窗口可能同时在不同的模式
- `modes-sync` 传递的 `currentMode` 是主窗口的状态，强行同步会导致笔记窗口的模式被改变
- 正确的模式切换应该只通过 `mode-changed` 事件

### 问题3：缺少从数据库重新加载

在某些切换路径中，没有从数据库重新加载完整的模式数据，导致使用了过期或错误的 `notes` 字段。

## 诊断过程

### 1. 复现步骤
1. 创建两个模式："模式A" 和 "模式B"
2. 在主窗口选择"模式A"，打开笔记窗口，输入文字 "这是A的笔记"
3. 在主窗口切换到"模式B"
4. 观察笔记窗口：发现仍显示 "这是A的笔记"（❌ 错误）
5. 或者：在笔记窗口直接切换模式，也可能看到内容混乱

### 2. 日志分析
添加详细日志后发现：
```
📝 笔记窗口收到模式列表更新
✓ 当前模式对象已更新: 模式B
📝 已加载模式 "模式B" 的笔记 (但加载的是过期数据)
```

问题在于 `modes-sync` 不应该触发模式切换。

## 修复方案

### 1. 修复 modes-sync 事件处理

只同步模式列表，不改变当前正在编辑的模式：

```javascript
// note-window.js:316
window.electron.ipcRenderer.on('modes-sync', async (data) => {
  console.log('📝 笔记窗口收到模式列表更新:', data);
  modes = data.modes || [];
  
  // ✅ 重要：只更新模式列表，不改变当前正在编辑的模式
  // 只有在接收到 mode-changed 事件时才真正切换模式
  
  // 但需要更新当前模式的引用（保持最新数据）
  if (currentModeId) {
    const updatedCurrentMode = modes.find(m => m.id === currentModeId);
    if (updatedCurrentMode) {
      // 先保存当前编辑的内容
      if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
      }
      await saveNoteContent();
      
      // 更新当前模式对象（但不重新加载笔记，保持正在编辑的内容）
      currentMode = updatedCurrentMode;
      console.log(`✓ 当前模式对象已更新: ${currentMode.name}`);
    }
  }
  
  updateModeSwitcherDisplay();
});
```

### 2. 增强 mode-changed 事件处理

确保从数据库重新加载正确的笔记内容：

```javascript
// note-window.js:344
window.electron.ipcRenderer.on('mode-changed', async (data) => {
  console.log('📝 笔记窗口收到模式切换通知:', data);
  if (data.mode) {
    // 先保存当前笔记
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    await saveNoteContent();
    console.log(`✓ 已保存旧模式 ${currentMode?.name} 的笔记`);
    
    // 切换到新模式
    currentModeId = data.mode.id;
    
    // ✅ 从数据库重新加载新模式的完整数据
    currentMode = await getMode(currentModeId);
    
    if (!currentMode) {
      console.error(`❌ 模式 ${currentModeId} 不存在`);
      return;
    }
    
    // 保存当前模式 ID
    await setSetting('currentModeId', currentModeId);
    
    // 加载新模式的笔记内容
    loadNoteContent();
    
    console.log(`✓ 已切换到模式: ${currentMode.name}, 笔记内容长度: ${currentMode.notes?.length || 0}`);
  }
});
```

### 3. 改进 switchToMode 函数

确保用户在笔记窗口手动切换模式时也正确保存和加载：

```javascript
// note-window.js:181
async function switchToMode(mode) {
  try {
    const oldModeName = currentMode?.name || '(无)';
    
    // 清除防抖定时器，立即保存当前笔记
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    
    // 确保保存最新的编辑器内容
    await saveNoteContent();
    console.log(`✓ 已保存旧模式 "${oldModeName}" 的笔记`);
    
    // 切换模式
    currentModeId = mode.id;
    
    // ✅ 从数据库重新加载新模式的完整数据（确保获取最新的 notes）
    currentMode = await getMode(currentModeId);
    
    if (!currentMode) {
      console.error(`❌ 目标模式 ${currentModeId} 不存在`);
      return;
    }
    
    // 保存当前模式 ID
    await setSetting('currentModeId', currentModeId);
    
    // 加载新模式的笔记
    loadNoteContent();
    console.log(`✓ 已加载新模式 "${currentMode.name}" 的笔记，内容长度: ${currentMode.notes?.length || 0}`);
    
    // 更新显示
    updateTitle();
    updateModeSwitcherDisplay();
    
    console.log(`🔄 切换完成: "${oldModeName}" → "${currentMode.name}"`);
  } catch (error) {
    console.error('❌ 切换模式失败:', error);
  }
}
```

### 4. 增强日志追踪

添加详细的日志以便追踪问题：

```javascript
// 保存时的日志
console.log(`💾 已保存模式 "${currentMode.name}" 的笔记 (ID: ${currentModeId}, 内容长度: ${editorContent.length})`);

// 加载时的日志
console.log(`📝 已加载模式 "${currentMode.name}" 的笔记 (ID: ${currentMode.id}, 内容长度: ${currentMode.notes.length})`);

// 切换时的日志
console.log(`🔄 切换完成: "${oldModeName}" → "${currentMode.name}"`);
```

## 代码位置

- `modes-sync` 事件处理：`RI/note-window.js:316`
- `mode-changed` 事件处理：`RI/note-window.js:344`
- `switchToMode` 函数：`RI/note-window.js:181`
- `loadNoteContent` 函数：`RI/note-window.js:105`
- `saveNoteContent` 函数：`RI/note-window.js:866`
- IPC 事件转发：`RI/electron-main.js:756` (`modes-updated` → `modes-sync`)
- IPC 事件转发：`RI/electron-main.js:765` (`mode-switched` → `mode-changed`)

## 测试步骤

1. **测试基本切换**
   - 创建"模式A"和"模式B"
   - 在"模式A"的笔记中输入："这是A的内容"
   - 切换到"模式B"，应该看到空白编辑器
   - 在"模式B"输入："这是B的内容"
   - 切换回"模式A"，应该看到："这是A的内容"（✅ 内容独立）

2. **测试主窗口切换**
   - 打开笔记窗口，在"模式A"写笔记
   - 在主窗口切换到"模式B"
   - 笔记窗口应该自动切换到"模式B"并显示空白或B的内容

3. **测试笔记窗口切换**
   - 在笔记窗口的下拉菜单切换模式
   - 确认每个模式的笔记内容独立
   - 快速连续切换多个模式，内容不应混乱

4. **测试保存和重启**
   - 在不同模式写入不同内容
   - 关闭应用
   - 重新打开应用
   - 检查每个模式的笔记是否正确保存

## 修复效果

- ✅ 不同模式的笔记内容完全独立
- ✅ 切换模式时正确保存旧模式、加载新模式
- ✅ 主窗口和笔记窗口的模式切换正确同步
- ✅ 详细的日志帮助追踪问题
- ✅ 从数据库重新加载确保数据一致性

## 经验教训

### IPC 事件语义要清晰
- `modes-sync`：同步模式列表（不改变当前状态）
- `mode-changed`：真正的模式切换（需要保存旧数据、加载新数据）
- 不要混淆"同步列表"和"切换状态"两个概念

### 状态管理要严格
- 主窗口和子窗口可以在不同的模式
- 不要假设所有窗口的状态都一致
- 切换状态前必须先保存当前状态

### 数据源要明确
- 永远从数据库（IndexedDB）加载权威数据
- IPC 传递的数据可能是过期的或不完整的
- 缓存数据要及时更新，但不能依赖缓存

### 调试日志很重要
- 记录模式 ID 和名称
- 记录内容长度以发现异常
- 使用 emoji 提高可读性（💾 保存、📝 加载、🔄 切换）

---
后续如果再有典型问题（如窗口缩放比例下的命中精度、跨显示器拖拽等），请在本文件继续追加"问题 → 诊断 → 修复 → 代码位置"的记录。

