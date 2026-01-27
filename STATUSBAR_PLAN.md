# RI 笔记窗口底部状态栏实现计划

参考项目：[vmark](https://github.com/xiaolai/vmark.git)

## 功能目标

模仿 vmark 的底部状态栏，为 RI 笔记窗口添加：

### 1. 底部状态栏 UI ✅ 当前任务

**左侧**：
- `+` 新建笔记按钮
- 标签页列表（pill 样式，可滚动）

**右侧**：
- 字数/字符统计（实时更新）
- 编辑模式切换按钮（T 图标）

### 2. 标签页管理（后续实现）

- 内存中维护 tabs 数组
- 每个 tab = { id, noteId, title, content, isDirty }
- 关闭标签时自动保存到 IndexedDB（notes 表）
- 可选：标签页状态持久化（下次打开恢复）

### 3. 快捷键 ✅ 当前任务

| 快捷键 | 功能 |
|--------|------|
| Cmd+N | 当前模式下新建笔记（新标签） |
| Cmd+W | 关闭当前标签 |
| Cmd+1~6 | 标题级别 H1~H6（可选） |

## 实现步骤

- [x] 1. 创建实现计划文档
- [ ] 2. 实现底部状态栏 UI (note-window.html + CSS)
- [ ] 3. 实现快捷键 Cmd+N/W/1~6 (note-window.js)
- [ ] 4. 实现标签页管理逻辑
- [ ] 5. 测试验证

## 技术参考

### vmark 关键文件
- `src/components/StatusBar/StatusBar.tsx` - 状态栏组件
- `src/components/StatusBar/StatusBar.css` - 状态栏样式
- `src/stores/tabStore.ts` - 标签页状态管理
- `src/stores/shortcutsStore.ts` - 快捷键管理

### RI 需要修改的文件
- `note-window.html` - 添加底部状态栏 HTML
- `note-editor.css` 或内联样式 - 状态栏样式
- `note-window.js` - 标签页逻辑和快捷键处理
