// note-window.js - 完整的笔记窗口功能（使用 IndexedDB）

import { 
  getAllModes, 
  getMode,
  updateMode,
  getNotesByMode,
  getWordsByMode,
  saveWord,
  getSetting,
  setSetting
} from './src/db.js';
import { autoCheckAndMigrate } from './src/migrate.js';

let editor = null;
let editorContent = '';
let currentMode = null;
let currentModeId = null;
let saveTimeout = null;
let isSavingBeforeHide = false;
let modes = [];

// 自动历史记录保存
let autoHistoryTimeout = null;
let lastHistorySavedContent = '';
const AUTO_HISTORY_INTERVAL = 120000; // 2分钟自动保存历史

// 搜索相关变量
let searchBox = null;
let searchInput = null;
let searchCount = null;
let searchMatches = [];
let currentMatchIndex = -1;
let originalContent = '';

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  editor = document.getElementById('md-editor');
  searchBox = document.getElementById('search-box');
  searchInput = document.getElementById('search-input');
  searchCount = document.getElementById('search-count');
  
  // 检查并自动迁移数据
  const needsMigration = await autoCheckAndMigrate();
  if (needsMigration) {
    console.log('等待数据迁移完成...');
    return; // 迁移完成后会自动刷新页面
  }
  
  // 加载模式和内容
  await loadModesAndContent();
  
  // 设置所有事件监听
  setupEventListeners();
  
  console.log('笔记窗口初始化完成');
});

// 窗口关闭前保存
window.addEventListener('beforeunload', async (e) => {
  try {
    // 取消待处理的保存
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    
    // 立即保存
    await saveNoteContent();
    
    // 仅当文本有差异时才保存到历史
    await saveToHistory();
  } catch (error) {
    console.error('窗口关闭前保存失败:', error);
  }
});

// ==================== 模式管理 ====================

// 加载模式列表和内容
async function loadModesAndContent() {
  try {
    // 从 IndexedDB 获取所有模式
    modes = await getAllModes();
    
    if (modes.length === 0) {
      console.warn('没有找到模式');
      return;
    }
    
    // 获取当前模式 ID
    currentModeId = await getSetting('currentModeId');
    
    // 如果 IndexedDB 中没有 currentModeId，尝试从 electron-store 迁移
    if (!currentModeId) {
      try {
        const oldModeId = await window.electronAPI.store.get('currentModeId');
        if (oldModeId) {
          console.log('🔄 从 electron-store 迁移 currentModeId:', oldModeId);
          await setSetting('currentModeId', oldModeId);
          currentModeId = oldModeId;
        }
      } catch (e) {
        console.warn('无法从 electron-store 读取 currentModeId:', e);
      }
    }
    
    if (!currentModeId || !modes.find(m => m.id === currentModeId)) {
      // 如果还是没有或无效，使用第一个模式
      currentModeId = modes[0].id;
      await setSetting('currentModeId', currentModeId);
    }
    
    // 加载当前模式
    currentMode = await getMode(currentModeId);
    
    // 加载笔记内容
    loadNoteContent();
    
    // 更新标题和模式显示
    updateTitle();
    updateModeSwitcherDisplay();
    
  } catch (error) {
    console.error('加载模式失败:', error);
  }
}

// 加载笔记内容
function loadNoteContent() {
  if (currentMode && currentMode.notes) {
    editor.innerHTML = currentMode.notes;
    editorContent = currentMode.notes;
    editor.removeAttribute('data-placeholder');
  } else {
    editor.innerHTML = '';
    editorContent = '';
    editor.setAttribute('data-placeholder', '在此输入内容或粘贴富文本...');
  }
  
  // 重置自动历史记录的追踪
  lastHistorySavedContent = editorContent;
  
  // 清除旧的定时器，加载新内容后重新开始计时
  if (autoHistoryTimeout) {
    clearTimeout(autoHistoryTimeout);
    autoHistoryTimeout = null;
  }
}

// 更新标题
function updateTitle() {
  const titleEl = document.getElementById('md-title');
  if (currentMode) {
    // 获取笔记的第一行作为标题（不截断，让 CSS 处理截断）
    const firstLine = getFirstLineText(editorContent);
    if (firstLine) {
      titleEl.textContent = firstLine;
      titleEl.title = firstLine; // 完整内容作为 tooltip
    } else {
      titleEl.textContent = currentMode.name;
      titleEl.title = currentMode.name;
    }
  }
}

// 更新模式切换器显示
function updateModeSwitcherDisplay() {
  const switcherBtn = document.getElementById('mode-switcher-btn');
  if (currentMode) {
    const displayName = currentMode.name.length > 6 
      ? currentMode.name.substring(0, 6) + '...' 
      : currentMode.name;
    switcherBtn.textContent = displayName;
  }
}

// 切换模式下拉菜单
function toggleModeDropdown() {
  const dropdown = document.getElementById('mode-dropdown');
  if (dropdown.style.display === 'none' || !dropdown.style.display) {
    loadModesIntoDropdown();
    dropdown.style.display = 'block';
  } else {
    dropdown.style.display = 'none';
  }
}

// 加载模式到下拉菜单
function loadModesIntoDropdown() {
  const dropdown = document.getElementById('mode-dropdown');
  dropdown.innerHTML = '';
  
  modes.forEach(mode => {
    const modeItem = document.createElement('div');
    modeItem.className = 'mode-item';
    
    if (currentMode && currentMode.id === mode.id) {
      modeItem.classList.add('active');
    }
    
    const modeName = document.createElement('span');
    modeName.textContent = mode.name;
    
    const checkMark = document.createElement('span');
    checkMark.className = 'check-mark';
    if (currentMode && currentMode.id === mode.id) {
      checkMark.textContent = '✓';
    }
    
    modeItem.appendChild(modeName);
    modeItem.appendChild(checkMark);
    
    modeItem.addEventListener('click', () => switchToMode(mode));
    
    dropdown.appendChild(modeItem);
  });
}

// 切换到指定模式
async function switchToMode(mode) {
  try {
    // 如果已经是当前模式，不需要切换
    if (currentModeId === mode.id) {
      document.getElementById('mode-dropdown').style.display = 'none';
      return;
    }
    
    // 先保存当前笔记和历史记录
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    await saveNoteContent();
    
    // 💾 切换模式前，保存到历史记录
    await saveToHistory();
    
    // ✅ 从数据库重新加载完整的模式数据
    currentModeId = mode.id;
    currentMode = await getMode(currentModeId);
    
    if (!currentMode) {
      console.error('目标模式不存在:', currentModeId);
      showNotification('❌ 切换失败：模式不存在', false);
      return;
    }
    
    // 保存当前模式 ID 到设置
    await setSetting('currentModeId', currentModeId);
    
    // 加载新模式的笔记
    loadNoteContent();
    
    // 更新显示
    updateTitle();
    updateModeSwitcherDisplay();
    
    // 关闭下拉菜单
    document.getElementById('mode-dropdown').style.display = 'none';
    
    // 显示通知
    showNotification(`✓ 已切换到：${currentMode.name}`);
    
    console.log(`✓ 已从数据库加载模式 "${currentMode.name}" (ID: ${currentModeId})`);
  } catch (error) {
    console.error('切换模式失败:', error);
    showNotification('❌ 切换失败: ' + error.message, false);
  }
}

// ==================== 事件监听设置 ====================

function setupEventListeners() {
  // 编辑器输入事件
  editor.addEventListener('input', handleEditorInput);
  
  // 监听格式化操作（如 Cmd+B 加粗等）
  // 这些操作可能不触发 input 事件，所以额外监听
  editor.addEventListener('keydown', (e) => {
    // 检测格式化快捷键
    if ((e.metaKey || e.ctrlKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
      // 延迟一点点让格式化完成
      setTimeout(() => {
        handleEditorInput();
      }, 10);
    }
  });
  
  // 使用 MutationObserver 监听 DOM 变化（捕获所有格式修改）
  const observer = new MutationObserver(() => {
    handleEditorInput();
  });
  
  observer.observe(editor, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeOldValue: true
  });
  
  // 占位符处理
  editor.addEventListener('focus', () => {
    if (!editor.textContent.trim()) {
      editor.removeAttribute('data-placeholder');
    }
  });
  
  editor.addEventListener('blur', () => {
    if (!editor.textContent.trim()) {
      editor.setAttribute('data-placeholder', '在此输入内容或粘贴富文本...');
    }
  });
  
  // Tab 键处理
  editor.addEventListener('keydown', handleKeyDown);
  
  // 图片粘贴
  editor.addEventListener('paste', handlePaste);
  
  // 图片拖放
  editor.addEventListener('dragover', handleDragOver);
  editor.addEventListener('dragleave', handleDragLeave);
  editor.addEventListener('drop', handleDrop);
  
  // 图片点击放大
  editor.addEventListener('click', handleEditorClick);
  
  // 按钮事件
  document.getElementById('close-btn').addEventListener('click', closeWindow);
  document.getElementById('export-btn').addEventListener('click', exportMarkdown);
  
  // 模式切换器
  document.getElementById('mode-switcher-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleModeDropdown();
  });
  
  // 点击外部关闭下拉菜单
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('mode-dropdown');
    const switcherContainer = document.querySelector('.mode-switcher-container');
    if (!switcherContainer.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
  
  // 搜索相关事件
  setupSearchListeners();

  // 页面隐藏时兜底保存
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      performSaveBeforeHide('visibilitychange');
    }
  });
  
  // 监听主窗口的模式更新事件（IPC）
  if (window.electron && window.electron.ipcRenderer) {
    // 监听窗口隐藏事件（在隐藏前保存）
    window.electron.ipcRenderer.on('window-hiding', async () => {
      console.log('📝 窗口即将隐藏，保存内容...');
      await performSaveBeforeHide('window-hiding');
    });
    
    // 监听模式列表更新
    window.electron.ipcRenderer.on('modes-sync', async (data) => {
      console.log('📝 笔记窗口收到模式列表更新:', data);
      modes = data.modes || [];
      
      // ✅ 重要：只更新模式列表，不改变当前正在编辑的模式
      // 只有在接收到 mode-changed 事件时才真正切换模式
      
      // 但需要更新当前模式的引用（保持最新的模式名称等元数据）
      if (currentModeId) {
        const updatedCurrentMode = modes.find(m => m.id === currentModeId);
        if (updatedCurrentMode) {
          // 先保存当前编辑的内容
          if (saveTimeout) {
            clearTimeout(saveTimeout);
            saveTimeout = null;
          }
          await saveNoteContent();
          
          // ✅ 仅更新当前模式对象的元数据（名称等），不重新加载笔记内容
          // 这样可以保持用户正在编辑的内容
          currentMode = { ...currentMode, name: updatedCurrentMode.name };
          console.log(`✓ 当前模式元数据已更新: ${currentMode.name}`);
        }
      }
      
      updateModeSwitcherDisplay();
      console.log('✓ 模式列表已同步（不影响当前编辑内容）');
    });
    
    // 监听当前模式切换
    window.electron.ipcRenderer.on('mode-changed', async (data) => {
      console.log('📝 笔记窗口收到模式切换通知:', data);
      if (data.mode && data.mode.id !== currentModeId) {
        // 先保存当前笔记
        if (saveTimeout) {
          clearTimeout(saveTimeout);
          saveTimeout = null;
        }
        await saveNoteContent();
        
        // ✅ 从数据库重新加载完整的模式数据（而不是使用主窗口传来的数据）
        const newModeId = data.mode.id;
        const newMode = await getMode(newModeId);
        
        if (newMode) {
          currentModeId = newModeId;
          currentMode = newMode;
          await setSetting('currentModeId', currentModeId);
          
          // 加载新模式的笔记内容
          loadNoteContent();
          updateModeSwitcherDisplay();
          updateTitle();
          showNotification(`✓ 已切换到: ${newMode.name}`, true);
          console.log(`✓ 已从数据库加载模式 "${newMode.name}" 的完整数据`);
        } else {
          console.error('无法从数据库加载模式:', newModeId);
        }
      }
    });
    
    console.log('✓ 笔记窗口模式同步监听器已设置');
  }
}

// ==================== 编辑器事件处理 ====================

function handleEditorInput() {
  editorContent = editor.innerHTML;
  
  // 更新标题
  updateTitle();
  
  // 自动保存到模式的 notes 字段（防抖）
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveNoteContent();
  }, 500);
  
  // 启动自动历史记录保存定时器
  startAutoHistorySave();
}

function handleKeyDown(e) {
  if (e.key === 'Tab') {
    e.preventDefault();
    document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
  }
}

function handleDragOver(e) {
  e.preventDefault();
  editor.style.backgroundColor = '#f0f8ff';
}

function handleDragLeave(e) {
  e.preventDefault();
  editor.style.backgroundColor = '';
}

async function handleDrop(e) {
  e.preventDefault();
  editor.style.backgroundColor = '';
  
  const files = e.dataTransfer.files;
  for (let i = 0; i < files.length; i++) {
    if (files[i].type.startsWith('image/')) {
      await handleImageFile(files[i]);
      break;
    }
  }
}

async function handlePaste(e) {
  const items = e.clipboardData.items;
  
  // 检查是否有图片
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      e.preventDefault();
      const file = items[i].getAsFile();
      await handleImageFile(file);
      return;
    }
  }
  
  // 处理富文本
  if (e.clipboardData.types.includes('text/html')) {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    document.execCommand('insertHTML', false, html);
  }
}

function handleEditorClick(e) {
  if (e.target.tagName === 'IMG') {
    showImageModal(e.target.src);
  }
}

// ==================== 按钮功能 ====================

// 关闭窗口
async function closeWindow() {
  try {
    // 关闭前确保保存当前内容
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    await saveNoteContent();
    
    // 仅当文本有差异时才保存到历史记录
    await saveToHistory();
    
    // 清除定时器
    if (autoHistoryTimeout) {
      clearTimeout(autoHistoryTimeout);
      autoHistoryTimeout = null;
    }
    
    console.log('✅ 关闭前已保存所有内容');
  } catch (error) {
    console.error('关闭前保存失败:', error);
  } finally {
    // 使用 window.close() 会触发 electron-main.js 中的 'close' 事件
    // 该事件会自动将窗口隐藏而不是真正关闭
    window.close();
  }
}

// 窗口始终置顶，不需要切换功能

// 导出 Markdown - 直接复制到剪贴板
async function exportMarkdown() {
  try {
    // 先保存当前内容
    await saveNoteContent();
    
    // 检查是否有内容
    if (!editorContent || !editorContent.trim()) {
      showNotification('编辑器中没有内容！', false);
      return;
    }
    
    // 转换为 Markdown 格式
    const markdown = convertHtmlToMarkdown(editorContent);
    
    // 直接复制到剪贴板
    await window.electronAPI.clipboard.writeText(markdown);
    
    // 同步保存“图文合一”的笔记项（不再自动单独保存图片）
    await saveCombinedNoteEntry();

    // 显示成功通知
    showNotification('✅ 已导出并保存图文到笔记！');
    console.log('笔记已导出到剪贴板');
  } catch (error) {
    console.error('导出失败:', error);
    showNotification('❌ 导出失败: ' + error.message, false);
  }
}

// 取消自动保存图片：仅保存图文合一的富文本条目

// 保存图文合一的笔记项（作为一个记录项渲染到主界面右侧预览）
async function saveCombinedNoteEntry() {
  try {
    const content = editorContent || '';
    const plain = htmlToPlainTextForNote(content).trim();
    if (!content || plain.length === 0) return;

    if (!currentMode || !currentModeId) return;

    // 从 IndexedDB 获取当前模式的所有记录
    const list = await getWordsByMode(currentModeId);
    
    // 如果最近一条已是相同 html，则不重复添加
    const duplicate = list.length > 0 && 
                     typeof list[0] === 'object' && 
                     list[0].type === 'rich' && 
                     list[0].html === content;
    
    if (!duplicate) {
      const entry = { 
        type: 'rich', 
        html: content,
        content: plain, // 添加纯文本内容用于搜索
        createdAt: Date.now() 
      };
      
      // 保存到 IndexedDB
      await saveWord(currentModeId, entry);
      console.log('✅ 笔记已保存到 IndexedDB');
      
      // 通知主窗口刷新数据
      if (window.electron && window.electron.ipcRenderer) {
        window.electron.ipcRenderer.send('note-saved', { 
          modeId: currentModeId,
          timestamp: Date.now()
        });
        console.log('📤 已通知主窗口刷新数据');
      }
    }
  } catch (err) {
    console.error('保存图文合一笔记失败:', err);
  }
}

// 提取纯文本（给去重/空内容判断）
function htmlToPlainTextForNote(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
}

// 检查内容是否相比上次历史有变化（包含纯文本和图片等富文本差异）
function hasContentChanged(content) {
  const plainText = htmlToPlainTextForNote(content).trim();
  const lastPlain = htmlToPlainTextForNote(lastHistorySavedContent || '').trim();

  if (plainText !== lastPlain) return true;

  // 若纯文本相同，但富文本（如图片、格式）有差异，也视为变化
  const normalized = (content || '').replace(/\s+/g, ' ').trim();
  const normalizedLast = (lastHistorySavedContent || '').replace(/\s+/g, ' ').trim();

  if (normalized !== normalizedLast) {
    // 优先关注包含图片等富文本的改动
    const hasImg = /<img[^>]*src=/i.test(normalized) || /<img[^>]*>/i.test(normalized);
    if (hasImg) return true;
  }

  return false;
}

// 显示存储状态
async function showStorageStatus() {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    z-index: 10000;
    display: flex;
    justify-content: center;
    align-items: center;
  `;
  
  const panel = document.createElement('div');
  panel.style.cssText = `
    background: white;
    padding: 25px;
    border-radius: 10px;
    max-width: 450px;
    width: 90%;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  `;
  
  // 计算笔记占用空间
  let totalSize = 0;
  modes.forEach(mode => {
    if (mode.notes) {
      totalSize += new Blob([mode.notes]).size;
    }
  });
  
  const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
  
  panel.innerHTML = `
    <h3 style="margin-top: 0; color: #2c3e50;">📊 笔记存储状态</h3>
    <div style="margin: 20px 0;">
      <p style="margin: 10px 0; font-size: 14px; color: #7f8c8d;">
        笔记总数: ${modes.length} 个模式
      </p>
      <p style="margin: 10px 0; font-size: 14px; color: #7f8c8d;">
        占用空间: ${sizeMB} MB
      </p>
      <p style="margin: 10px 0; font-size: 12px; color: #95a5a6;">
        所有笔记都保存在本地，安全可靠
      </p>
    </div>
    <div style="margin-top: 20px;">
      <button id="closeStatus" style="background: #3498db; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">确定</button>
    </div>
  `;
  
  modal.appendChild(panel);
  document.body.appendChild(modal);
  
  panel.querySelector('#closeStatus').onclick = () => {
    document.body.removeChild(modal);
  };
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

// 分享笔记
async function shareNote() {
  if (!editorContent.trim()) {
    showNotification('编辑器中没有内容可分享！', false);
    return;
  }
  
  try {
    const textContent = htmlToPlainText(editorContent);
    const title = getFirstLineText(editorContent) || '我的笔记';
    
    // 显示分享选项
    showShareOptions(title, textContent);
    
  } catch (error) {
    console.error('分享失败:', error);
    showNotification('分享失败: ' + error.message, false);
  }
}

// 显示分享选项
function showShareOptions(title, content) {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    z-index: 10000;
    display: flex;
    justify-content: center;
    align-items: center;
  `;
  
  const panel = document.createElement('div');
  panel.style.cssText = `
    background: white;
    padding: 25px;
    border-radius: 10px;
    max-width: 400px;
    width: 90%;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  `;
  
  panel.innerHTML = `
    <h3 style="margin-top: 0; color: #2c3e50;">📤 分享笔记</h3>
    <div style="margin: 20px 0;">
      <button id="copyContent" style="width: 100%; background: #3498db; color: white; border: none; padding: 12px; border-radius: 6px; margin: 8px 0; cursor: pointer; font-size: 14px;">📋 复制内容</button>
      <button id="openMail" style="width: 100%; background: #9b59b6; color: white; border: none; padding: 12px; border-radius: 6px; margin: 8px 0; cursor: pointer; font-size: 14px;">✉️ 通过邮件</button>
    </div>
    <button id="closeShare" style="background: #95a5a6; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">关闭</button>
  `;
  
  modal.appendChild(panel);
  document.body.appendChild(modal);
  
  // 复制内容
  panel.querySelector('#copyContent').onclick = async () => {
    await window.electronAPI.clipboard.writeText(content);
    showNotification('内容已复制到剪贴板！');
    document.body.removeChild(modal);
  };
  
  // 通过邮件
  panel.querySelector('#openMail').onclick = () => {
    const mailUrl = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(content)}`;
    window.electronAPI.shell.openExternal(mailUrl);
    showNotification('正在打开邮件应用...');
    document.body.removeChild(modal);
  };
  
  // 关闭
  panel.querySelector('#closeShare').onclick = () => {
    document.body.removeChild(modal);
  };
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

// 一键复制全部内容
async function quickCopyAllContent() {
  if (!editorContent.trim()) {
    showNotification('编辑器中没有内容可复制！', false);
    return;
  }
  
  try {
    editor.focus();
    
    // 全选内容
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    
    // 复制
    document.execCommand('copy');
    
    // 取消选择
    selection.removeAllRanges();
    
    showNotification('✅ 内容已复制到剪贴板！');
    console.log('内容已复制');
  } catch (error) {
    console.error('复制失败:', error);
    showNotification('复制失败: ' + error.message, false);
  }
}

// ==================== 图片处理 ====================

async function handleImageFile(file) {
  try {
    const dataUrl = await compressImage(file);
    // 在编辑器中插入图片
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.margin = '10px 0';
    img.style.borderRadius = '4px';
    img.style.cursor = 'pointer';
    
    insertElementAtCursor(img);
    
    handleEditorInput();
    
    console.log('图片已插入');
  } catch (error) {
    console.error('处理图片失败:', error);
    showNotification('图片处理失败: ' + error.message, false);
  }
}

function compressImage(file, maxWidth = 4096, maxHeight = 4096, quality = 0.98) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const originalDataUrl = e.target.result;
      const img = new Image();

      img.onload = () => {
        // 如果图片尺寸已经在可接受范围内，直接返回原始数据，避免重复压缩导致画质损失
        const needsResize = img.width > maxWidth || img.height > maxHeight;
        if (!needsResize) {
          resolve(originalDataUrl);
          return;
        }

        const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
        const width = Math.round(img.width * ratio);
        const height = Math.round(img.height * ratio);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // 保持原始 MIME 类型；仅在 JPEG 时使用质量参数，其余使用无损导出
        const mime = (file.type && file.type.startsWith('image/')) ? file.type : 'image/png';
        const exportQuality = mime === 'image/jpeg' ? quality : 1.0;

        const dataUrl = canvas.toDataURL(mime, exportQuality);
        resolve(dataUrl);
      };

      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = originalDataUrl;
    };

    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

function insertElementAtCursor(element) {
  const selection = window.getSelection();
  
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    range.deleteContents();
    
    const br1 = document.createElement('br');
    const br2 = document.createElement('br');
    
    range.insertNode(br2);
    range.insertNode(element);
    range.insertNode(br1);
    
    range.setStartAfter(br2);
    range.setEndAfter(br2);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    editor.appendChild(document.createElement('br'));
    editor.appendChild(element);
    editor.appendChild(document.createElement('br'));
  }
  
  editor.removeAttribute('data-placeholder');
}

// ==================== 保存功能 ====================

function sendNoteHideAck(reason = 'window-hiding', skipped = false) {
  try {
    if (window.electron && window.electron.ipcRenderer) {
      window.electron.ipcRenderer.send('note-hide-ack', {
        reason,
        skipped,
        ts: Date.now()
      });
    }
  } catch (error) {
    console.error('发送隐藏确认失败:', error);
  }
}

async function performSaveBeforeHide(reason = 'window-hiding') {
  if (isSavingBeforeHide) {
    sendNoteHideAck(reason, true);
    return;
  }

  isSavingBeforeHide = true;

  try {
    // 清理待执行的自动保存/历史定时器
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    if (autoHistoryTimeout) {
      clearTimeout(autoHistoryTimeout);
      autoHistoryTimeout = null;
    }

    await saveNoteContent();
    await saveToHistory();
  } catch (error) {
    console.error('隐藏前保存失败:', error);
  } finally {
    sendNoteHideAck(reason, false);
    isSavingBeforeHide = false;
  }
}

async function saveNoteContent() {
  try {
    if (!currentMode || !currentModeId) return;
    
    // 确保获取最新的编辑器内容（包括格式化修改）
    editorContent = editor.innerHTML;
    
    // 更新模式的笔记内容
    await updateMode(currentModeId, {
      notes: editorContent
    });
    
    // 更新本地缓存
    currentMode.notes = editorContent;
    
    console.log('笔记已自动保存');
  } catch (error) {
    console.error('保存失败:', error);
  }
}

// ==================== 自动历史记录保存 ====================

// 启动自动历史记录保存定时器
function startAutoHistorySave() {
  // 清除之前的定时器
  if (autoHistoryTimeout) {
    clearTimeout(autoHistoryTimeout);
  }
  
  // 设置新的定时器
  autoHistoryTimeout = setTimeout(async () => {
    await saveToHistory();
  }, AUTO_HISTORY_INTERVAL);
}

// 保存当前内容到历史记录
async function saveToHistory() {
  try {
    const content = editorContent || '';
    const plainText = htmlToPlainTextForNote(content).trim();
    
    // 检查是否有内容（纯文本或图片都算有内容）
    const hasImage = content.includes('<img');
    if (!content || (plainText.length === 0 && !hasImage)) {
      console.log('⏭️ 跳过保存：内容为空');
      return;
    }
    
    // 检查文本或富文本是否有变化（包含图片变动）
    if (!hasContentChanged(content)) {
      console.log('⏭️ 跳过保存：内容无变化');
      // 继续下一次定时
      startAutoHistorySave();
      return;
    }
    
    if (!currentMode || !currentModeId) {
      console.log('⏭️ 跳过保存：模式未加载');
      return;
    }
    
    // 创建历史记录条目
    const entry = {
      type: 'rich',
      html: content,
      content: plainText || '[图片]',
      createdAt: Date.now()
    };
    
    // 保存到 IndexedDB
    await saveWord(currentModeId, entry);
    
    // 更新最后保存的内容
    lastHistorySavedContent = content;
    
    console.log('✅ 已自动保存到历史记录');
    
    // 显示保存提示（不打扰用户，仅在右下角短暂提示）
    showAutoSaveNotification();
    
    // 通知主窗口刷新数据
    if (window.electron && window.electron.ipcRenderer) {
      window.electron.ipcRenderer.send('note-saved', {
        modeId: currentModeId,
        timestamp: Date.now()
      });
    }
    
    // 继续下一次定时保存
    startAutoHistorySave();
  } catch (error) {
    console.error('自动保存到历史记录失败:', error);
    // 出错后也继续定时
    startAutoHistorySave();
  }
}

// 强制保存到历史记录（隐藏窗口时使用，跳过内容相同检查）
async function saveToHistoryForce() {
  try {
    const content = editorContent || '';
    const plainText = htmlToPlainTextForNote(content).trim();
    
    // 检查是否有内容（纯文本或图片都算有内容）
    const hasImage = content.includes('<img');
    if (!content || (plainText.length === 0 && !hasImage)) {
      console.log('⏭️ 跳过保存：内容为空');
      return;
    }
    
    if (!currentMode || !currentModeId) {
      console.log('⏭️ 跳过保存：模式未加载');
      return;
    }
    
    // 🔥 强制保存模式：即使内容相同也保存（作为隐藏时的备份点）
    const entry = {
      type: 'rich',
      html: content,
      content: plainText,
      createdAt: Date.now()
    };
    
    // 保存到 IndexedDB
    await saveWord(currentModeId, entry);
    
    // 更新最后保存的内容
    lastHistorySavedContent = content;
    
    console.log('✅ 已强制保存到历史记录（窗口隐藏）');
    
    // 显示保存提示
    showAutoSaveNotification();
    
    // 通知主窗口刷新数据
    if (window.electron && window.electron.ipcRenderer) {
      window.electron.ipcRenderer.send('note-saved', {
        modeId: currentModeId,
        timestamp: Date.now()
      });
    }
  } catch (error) {
    console.error('强制保存到历史记录失败:', error);
  }
}

// 显示自动保存提示（轻量级，不打扰）
function showAutoSaveNotification() {
  const notification = document.createElement('div');
  notification.className = 'auto-save-notification';
  notification.textContent = '💾 已自动保存';
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: rgba(52, 199, 89, 0.9);
    color: white;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 12px;
    z-index: 9999;
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
  `;
  
  document.body.appendChild(notification);
  
  // 淡入
  setTimeout(() => {
    notification.style.opacity = '1';
  }, 10);
  
  // 1.5秒后淡出并移除
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 300);
  }, 1500);
}

// ==================== 辅助函数 ====================

// 获取第一行文本
function getFirstLineText(html) {
  if (!html || html.trim() === '') return '';
  
  const div = document.createElement('div');
  div.innerHTML = html;
  const text = div.textContent || div.innerText || '';
  const lines = text.split('\n');
  
  // 只返回第一行，不截断（让 CSS 处理截断和省略号）
  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      return trimmed; // 返回完整的第一行，不在这里截断
    }
  }
  
  return '';
}

// HTML 转纯文本
function htmlToPlainText(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

// HTML 转 Markdown
function convertHtmlToMarkdown(html) {
  let markdown = html;
  
  // 换行
  markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
  markdown = markdown.replace(/<\/p>/gi, '\n\n');
  markdown = markdown.replace(/<p[^>]*>/gi, '');
  markdown = markdown.replace(/<div[^>]*>/gi, '');
  markdown = markdown.replace(/<\/div>/gi, '\n');
  
  // 格式
  markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
  markdown = markdown.replace(/<pre[^>]*>(.*?)<\/pre>/gi, '\n```\n$1\n```\n');
  
  // 链接
  markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  
  // 图片
  markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '\n![$2]($1)\n');
  markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, '\n![]($1)\n');
  
  // 标题
  for (let i = 1; i <= 6; i++) {
    const regex = new RegExp(`<h${i}[^>]*>(.*?)<\/h${i}>`, 'gi');
    const prefix = '#'.repeat(i);
    markdown = markdown.replace(regex, `\n${prefix} $1\n`);
  }
  
  // 列表
  markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  markdown = markdown.replace(/<\/?[uo]l[^>]*>/gi, '\n');
  
  // 清理 HTML 标签
  markdown = markdown.replace(/<[^>]+>/g, '');
  
  // HTML 实体
  markdown = markdown.replace(/&nbsp;/g, ' ');
  markdown = markdown.replace(/&lt;/g, '<');
  markdown = markdown.replace(/&gt;/g, '>');
  markdown = markdown.replace(/&amp;/g, '&');
  markdown = markdown.replace(/&quot;/g, '"');
  
  // 清理多余空行
  markdown = markdown.replace(/\n{3,}/g, '\n\n');
  markdown = markdown.trim();
  
  return markdown;
}

// 显示通知
function showNotification(message, isSuccess = true) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.style.background = isSuccess ? '#34C759' : '#e74c3c';
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in forwards';
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// 图片模态框
function showImageModal(src) {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    z-index: 10000;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
  `;
  
  const img = document.createElement('img');
  img.src = src;
  img.style.cssText = `
    max-width: 90%;
    max-height: 90%;
    object-fit: contain;
    border-radius: 8px;
  `;
  
  modal.appendChild(img);
  document.body.appendChild(modal);
  
  modal.addEventListener('click', () => {
    document.body.removeChild(modal);
  });
}

// ==================== 搜索功能 ====================

// 设置搜索相关的事件监听器
function setupSearchListeners() {
  // 全局快捷键监听 Cmd+F 或 Ctrl+F
  document.addEventListener('keydown', (e) => {
    // Cmd+F (Mac) 或 Ctrl+F (Windows/Linux)
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      // 切换搜索框：如果已打开就关闭，否则打开
      if (searchBox.classList.contains('active')) {
        closeSearchBox();
      } else {
        openSearchBox();
      }
    }
    
    // Esc 键关闭搜索框
    if (e.key === 'Escape' && searchBox.classList.contains('active')) {
      closeSearchBox();
    }
  });
  
  // 搜索输入框事件
  searchInput.addEventListener('input', () => {
    performSearch(searchInput.value);
  });
  
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        navigateToPrevMatch();
      } else {
        navigateToNextMatch();
      }
    }
    if (e.key === 'Escape') {
      closeSearchBox();
    }
  });
  
  // 上一个/下一个按钮
  document.getElementById('search-prev').addEventListener('click', navigateToPrevMatch);
  document.getElementById('search-next').addEventListener('click', navigateToNextMatch);
  
  // 关闭按钮
  document.getElementById('search-close').addEventListener('click', closeSearchBox);
}

// 打开搜索框
function openSearchBox() {
  searchBox.classList.add('active');
  searchInput.focus();
  searchInput.select();
  
  // 保存原始内容
  originalContent = editor.innerHTML;
}

// 关闭搜索框
function closeSearchBox() {
  searchBox.classList.remove('active');
  clearSearchHighlights();
  searchInput.value = '';
  searchMatches = [];
  currentMatchIndex = -1;
  updateSearchCount();
}

// 执行搜索
function performSearch(query) {
  // 清除之前的高亮
  clearSearchHighlights();
  
  if (!query || query.trim() === '') {
    searchMatches = [];
    currentMatchIndex = -1;
    updateSearchCount();
    return;
  }
  
  // 获取编辑器的纯文本内容
  const textContent = editor.innerText || editor.textContent;
  const lowerQuery = query.toLowerCase();
  const lowerText = textContent.toLowerCase();
  
  // 查找所有匹配项的位置
  searchMatches = [];
  let index = 0;
  while ((index = lowerText.indexOf(lowerQuery, index)) !== -1) {
    searchMatches.push(index);
    index += query.length;
  }
  
  if (searchMatches.length > 0) {
    // 高亮所有匹配项
    highlightMatches(query);
    currentMatchIndex = 0;
    scrollToMatch(currentMatchIndex);
  } else {
    currentMatchIndex = -1;
  }
  
  updateSearchCount();
}

// 高亮所有匹配项
function highlightMatches(query) {
  const innerHTML = editor.innerHTML;
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = innerHTML;
  
  // 递归处理所有文本节点
  highlightTextNodes(tempDiv, query);
  
  editor.innerHTML = tempDiv.innerHTML;
}

// 递归高亮文本节点
function highlightTextNodes(node, query) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    
    if (lowerText.includes(lowerQuery)) {
      const parent = node.parentNode;
      const fragment = document.createDocumentFragment();
      
      let lastIndex = 0;
      let index = 0;
      let matchCount = 0;
      
      while ((index = lowerText.indexOf(lowerQuery, lastIndex)) !== -1) {
        // 添加匹配前的文本
        if (index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.substring(lastIndex, index)));
        }
        
        // 创建高亮元素
        const span = document.createElement('span');
        span.className = matchCount === 0 ? 'search-highlight-active' : 'search-highlight';
        span.textContent = text.substring(index, index + query.length);
        span.dataset.searchMatch = matchCount;
        fragment.appendChild(span);
        
        lastIndex = index + query.length;
        matchCount++;
      }
      
      // 添加剩余文本
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
      }
      
      parent.replaceChild(fragment, node);
    }
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    // 跳过已经是高亮的元素
    if (node.classList && (node.classList.contains('search-highlight') || node.classList.contains('search-highlight-active'))) {
      return;
    }
    
    // 递归处理子节点
    const children = Array.from(node.childNodes);
    children.forEach(child => highlightTextNodes(child, query));
  }
}

// 清除搜索高亮
function clearSearchHighlights() {
  const highlights = editor.querySelectorAll('.search-highlight, .search-highlight-active');
  highlights.forEach(span => {
    const text = span.textContent;
    const textNode = document.createTextNode(text);
    span.parentNode.replaceChild(textNode, span);
  });
  
  // 合并相邻的文本节点
  editor.normalize();
}

// 导航到下一个匹配项
function navigateToNextMatch() {
  if (searchMatches.length === 0) return;
  
  currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
  scrollToMatch(currentMatchIndex);
  updateSearchCount();
}

// 导航到上一个匹配项
function navigateToPrevMatch() {
  if (searchMatches.length === 0) return;
  
  currentMatchIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
  scrollToMatch(currentMatchIndex);
  updateSearchCount();
}

// 滚动到指定匹配项
function scrollToMatch(index) {
  const highlights = editor.querySelectorAll('.search-highlight, .search-highlight-active');
  
  if (highlights.length === 0) return;
  
  // 移除所有 active 类
  highlights.forEach(span => {
    span.classList.remove('search-highlight-active');
    span.classList.add('search-highlight');
  });
  
  // 添加 active 类到当前匹配项
  if (highlights[index]) {
    highlights[index].classList.remove('search-highlight');
    highlights[index].classList.add('search-highlight-active');
    
    // 滚动到可见区域
    highlights[index].scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }
}

// 更新搜索计数显示
function updateSearchCount() {
  if (searchMatches.length === 0) {
    searchCount.textContent = '0/0';
  } else {
    searchCount.textContent = `${currentMatchIndex + 1}/${searchMatches.length}`;
  }
}
