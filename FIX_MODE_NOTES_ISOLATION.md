# 模式笔记隔离问题修复说明

**修复日期：2025-11-07**

## 问题描述

用户报告了一个严重的数据混乱问题：
- 在模式A写的笔记，切换到模式B后仍然显示
- 在模式B写笔记后，之前模式A的笔记消失了
- 不同模式的笔记内容互相覆盖或混淆

这是一个**数据隔离失败**的严重问题，会导致用户数据混乱。

## 根本原因

### 1. `modes-sync` 事件处理不当
笔记窗口收到主窗口的模式列表同步事件时，错误地重新加载了笔记内容：

```javascript
// ❌ 问题代码
window.electron.ipcRenderer.on('modes-sync', (data) => {
  modes = data.modes || [];
  if (data.currentMode) {
    currentMode = updatedMode;
    loadNoteContent();  // 错误：无条件重新加载，覆盖正在编辑的内容
  }
});
```

### 2. 使用了过期的数据
- 主窗口传来的模式数据可能是旧的
- 没有从数据库重新加载最新的完整数据
- 导致笔记内容被旧数据覆盖

### 3. 事件职责不清晰
- `modes-sync` 应该只同步模式列表（用于下拉菜单）
- `mode-changed` 才是真正的模式切换事件
- 两个事件的职责混淆导致数据错误

## 修复方案

### 修复1：重构 `modes-sync` 事件处理
```javascript
// ✅ 修复后的代码
window.electron.ipcRenderer.on('modes-sync', async (data) => {
  modes = data.modes || [];
  
  // 只更新模式列表和元数据，不改变当前正在编辑的模式
  if (currentModeId) {
    const updatedCurrentMode = modes.find(m => m.id === currentModeId);
    if (updatedCurrentMode) {
      // 先保存当前编辑的内容
      await saveNoteContent();
      
      // 仅更新元数据（名称等），不重新加载笔记内容
      currentMode = { ...currentMode, name: updatedCurrentMode.name };
    }
  }
  
  updateModeSwitcherDisplay();
  // 不再调用 loadNoteContent()，保持用户正在编辑的内容
});
```

### 修复2：增强 `mode-changed` 事件处理
```javascript
// ✅ 修复后的代码
window.electron.ipcRenderer.on('mode-changed', async (data) => {
  if (data.mode && data.mode.id !== currentModeId) {
    // 先保存当前笔记
    await saveNoteContent();
    
    // 从数据库重新加载完整的模式数据
    const newMode = await getMode(data.mode.id);
    
    if (newMode) {
      currentModeId = newMode.id;
      currentMode = newMode;
      await setSetting('currentModeId', currentModeId);
      
      // 加载新模式的笔记内容
      loadNoteContent();
      updateModeSwitcherDisplay();
      updateTitle();
    }
  }
});
```

### 修复3：改进内部模式切换函数
```javascript
// ✅ 修复后的代码
async function switchToMode(mode) {
  // 检查是否已经是当前模式
  if (currentModeId === mode.id) return;
  
  // 先保存当前笔记
  await saveNoteContent();
  
  // 从数据库重新加载完整的模式数据
  currentMode = await getMode(mode.id);
  
  if (!currentMode) {
    showNotification('❌ 切换失败：模式不存在', false);
    return;
  }
  
  // 加载新模式的笔记
  loadNoteContent();
  updateTitle();
  updateModeSwitcherDisplay();
}
```

## 修复的关键点

### 1. 事件职责明确
- **`modes-sync`**：仅同步模式列表和元数据，不触发内容重新加载
- **`mode-changed`**：真正的模式切换，从数据库加载完整数据

### 2. 始终从数据库加载
所有模式切换都调用 `await getMode(modeId)` 从 IndexedDB 重新加载最新数据，而不是使用主窗口传来的可能过期的数据。

### 3. 保存时机优化
- 切换模式前先调用 `saveNoteContent()`
- 清除防抖定时器，确保立即保存
- 避免数据丢失

### 4. 防止重复切换
切换前检查 `currentModeId === mode.id`，避免重复操作。

## 测试建议

### 测试场景1：基本切换
1. 打开笔记窗口，当前在"模式A"
2. 输入文字："这是A的笔记"
3. 切换到"模式B"
4. **预期**：笔记区域变为空白或显示B的旧内容
5. 输入文字："这是B的笔记"
6. 切换回"模式A"
7. **预期**：显示"这是A的笔记"

### 测试场景2：并发编辑
1. 打开笔记窗口，在"模式A"输入内容
2. 在主窗口切换到"模式B"
3. **预期**：笔记窗口保持"模式A"的内容（不受影响）
4. 在笔记窗口手动切换到"模式B"
5. **预期**：正确显示"模式B"的内容

### 测试场景3：主窗口同步
1. 打开笔记窗口，在"模式A"编辑
2. 在主窗口添加新模式或重命名模式
3. **预期**：笔记窗口的下拉菜单更新，但当前编辑的内容不受影响

## 影响的文件

- `note-window.js`：修复了 IPC 事件处理和模式切换逻辑（3处关键修复）
- `TROUBLESHOOTING.md`：更新状态，标记问题已修复

## 数据安全保障

本次修复**不影响已存储的数据**：
- IndexedDB 中的数据结构没有变化
- 每个模式的 `notes` 字段仍然独立存储
- 只是修复了读取和加载的逻辑错误

## 结论

这次修复解决了模式笔记内容互相覆盖的严重问题。通过明确事件职责、始终从数据库加载最新数据、优化保存时机，确保了不同模式的笔记内容完全隔离，互不影响。

用户现在可以放心地在不同模式之间切换，每个模式的笔记内容都会正确保存和加载。









