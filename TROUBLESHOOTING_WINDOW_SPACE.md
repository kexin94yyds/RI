# RI 应用问题排除记录

> 记录典型问题的原因、排查步骤和解决方案，方便后续遇到类似问题时快速定位。

---

## 1. 提示词窗口在不同桌面/全屏 Space 呼出时跳回固定桌面

### 现象
- 在多个桌面/全屏 Space（A、C、D）按快捷键呼出窗口时，系统会自动切换到某个固定的桌面（B）再弹出窗口，而不是在当前 Space 就地显示。
- 主窗口和笔记窗口都存在此问题。

### 原因
- Electron 窗口在调用 `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` 后，如果在显示后立即调用 `setVisibleOnAllWorkspaces(false)`，macOS 会把窗口"拉回"到它最初所在的 Space，而不是停留在当前激活的 Space/全屏应用上。
- 之前的实现为了"短暂跨 Space 显示后恢复"，在短时间后就关闭了跨 Space 可见性，导致系统强制把窗口带回旧 Space。
- 笔记窗口的修复逻辑只停留在注释阶段，没有实际实现。

### 解决方案

#### 主窗口修复（electron-main.js 第70-78行）
```js
// 200ms后恢复用户置顶偏好，并适度恢复工作区可见性
setTimeout(() => {
  try {
    const pinned = !!store.get('mainPinned');
    mainWindow.setAlwaysOnTop(pinned, pinned ? 'floating' : undefined);
    // 适度恢复工作区可见性，避免后续桌面切换时被系统强制带回旧 Space
    mainWindow.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true });
  } catch (_) {}
}, 200);
```

#### 笔记窗口修复（electron-main.js 第263-270行）
```js
// 在短暂延时后恢复工作区可见性设置，避免后续桌面切换时被系统强制带回旧 Space
setTimeout(() => {
  try {
    if (noteWindow && !noteWindow.isDestroyed()) {
      noteWindow.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true });
    }
  } catch (_) {}
}, 300);
```

**关键改动：**
- 主窗口：保持 `setVisibleOnAllWorkspaces(true)` 在显示期间生效，200ms 后适度恢复工作区可见性
- 笔记窗口：完整实现与主窗口一致的修复策略，300ms 后恢复工作区可见性
- 延时差异确保窗口稳定显示后再恢复设置

### 验证步骤
1. 打开多个桌面/全屏 Space（例如：Safari 全屏、VSCode 全屏、普通桌面）。
2. 在每个 Space 里分别按快捷键：
   - `Shift + ⌘ + U` 测试主窗口
   - `⌘ + M` 测试笔记窗口
3. 确认窗口在当前 Space 就地弹出，不再跳回固定桌面。
4. 在全屏应用前测试窗口是否不再跳动。

### 更新脚本
使用 `update-local.sh` 脚本可以快速应用修复：
```bash
cd "/Users/apple/信息置换起/RI"
./update-local.sh
```

---

## 2. 如何快速复现和测试多桌面/全屏 Space 问题

### 测试环境准备
1. 创建至少 3 个桌面/全屏 Space：
   - 桌面 1：Safari 全屏
   - 桌面 2：VSCode 全屏  
   - 桌面 3：普通桌面（Finder）
2. 确保应用已启动但窗口隐藏。

### 测试步骤
1. 在桌面 1 按快捷键，观察窗口是否在桌面 1 就地弹出。
2. 切换到桌面 2，按快捷键，观察是否在桌面 2 就地弹出。
3. 切换到桌面 3，重复测试。
4. 记录任何跳回固定桌面的情况。

### 预期结果
- 窗口应在当前激活的 Space/显示器上居中弹出。
- 不应出现系统自动切换到其他桌面的情况。
- 在全屏应用前窗口应该稳定显示，不跳动。

---

## 3. 常见调试技巧

### 查看 Electron 主进程日志
- 开发环境：控制台直接输出 `console.log` 内容。
- 打包后：通过 `~/Library/Logs/replace-information/` 查看日志文件。

### 检查窗口状态
在 `showOnActiveSpace` 中添加调试输出：
```js
console.log('[DEBUG] cursorPoint:', cursorPoint);
console.log('[DEBUG] display:', display);
console.log('[DEBUG] targetX/Y:', targetX, targetY);
console.log('[DEBUG] setVisibleOnAllWorkspaces called');
```

### 验证快捷键注册
在 `globalShortcut.register` 后添加：
```js
if (!ret) {
  console.log('⚠️ 快捷键注册失败（可能已被其他应用占用）');
} else {
  console.log('✅ 快捷键注册成功');
}
```

---

## 4. 版本信息

- 文档创建时间：2025-11-27
- 涉及版本：RI 2.1.1
- 涉及平台：macOS (Sonoma 及以上)

---

> **注意**：每次解决问题后，请及时更新本文档，记录新问题的现象、原因和解决方案，以便团队共享知识。
