// note-window.js - 完整的笔记窗口功能（一比一复刻）

let editor = null;
let editorContent = '';
let currentMode = null;
let saveTimeout = null;
let modes = [];

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
  
  // 加载模式和内容
  await loadModesAndContent();
  
  // 设置所有事件监听
  setupEventListeners();
  
  console.log('笔记窗口初始化完成');
});

// ==================== 模式管理 ====================

// 加载模式列表和内容
async function loadModesAndContent() {
  try {
    const wordModes = await window.electronAPI.store.get('wordModes') || [
      { id: 'default', name: '默认', words: [], notes: '' }
    ];
    const currentWordMode = await window.electronAPI.store.get('currentWordMode') || wordModes[0];
    
    modes = wordModes;
    currentMode = currentWordMode;
    
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
}

// 更新标题
function updateTitle() {
  const titleEl = document.getElementById('md-title');
  if (currentMode) {
    // 获取笔记的第一行作为标题
    const firstLine = getFirstLineText(editorContent);
    titleEl.textContent = firstLine || `${currentMode.name}`;
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
    // 先保存当前笔记
    await saveNoteContent();
    
    // 切换模式
    currentMode = mode;
    await window.electronAPI.store.set('currentWordMode', mode);
    
    // 加载新模式的笔记
    loadNoteContent();
    
    // 更新显示
    updateTitle();
    updateModeSwitcherDisplay();
    
    // 关闭下拉菜单
    document.getElementById('mode-dropdown').style.display = 'none';
    
    // 显示通知
    showNotification(`已切换到：${mode.name}`);
    
    console.log('切换到模式:', mode.name);
  } catch (error) {
    console.error('切换模式失败:', error);
  }
}

// ==================== 事件监听设置 ====================

function setupEventListeners() {
  // 编辑器输入事件
  editor.addEventListener('input', handleEditorInput);
  
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
  document.getElementById('pin-btn').addEventListener('click', togglePinWindow);
  
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
  
  // 监听主窗口的模式更新事件（IPC）
  if (window.electron && window.electron.ipcRenderer) {
    // 监听模式列表更新
    window.electron.ipcRenderer.on('modes-sync', (data) => {
      console.log('📝 笔记窗口收到模式列表更新:', data);
      modes = data.modes || [];
      if (data.currentMode) {
        // 查找对应的模式对象
        const updatedMode = modes.find(m => m.id === data.currentMode.id);
        if (updatedMode) {
          currentMode = updatedMode;
          // 重新加载当前模式的笔记内容
          loadNoteContent();
        }
      }
      updateModeSwitcherDisplay();
      updateTitle();
      showNotification('✓ 模式列表已同步', true);
    });
    
    // 监听当前模式切换
    window.electron.ipcRenderer.on('mode-changed', (data) => {
      console.log('📝 笔记窗口收到模式切换通知:', data);
      if (data.mode) {
        // 查找对应的模式对象
        const newMode = modes.find(m => m.id === data.mode.id);
        if (newMode) {
          currentMode = newMode;
          // 加载新模式的笔记内容
          loadNoteContent();
          updateModeSwitcherDisplay();
          updateTitle();
          showNotification(`✓ 已切换到: ${data.mode.name}`, true);
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
  
  // 自动保存（防抖）
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveNoteContent();
  }, 500);
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
function closeWindow() {
  // 使用 window.close() 会触发 electron-main.js 中的 'close' 事件
  // 该事件会自动将窗口隐藏而不是真正关闭
  window.close();
}

// 置顶窗口切换
let isPinned = false;
function togglePinWindow() {
  isPinned = !isPinned;
  const pinBtn = document.getElementById('pin-btn');
  
  if (isPinned) {
    pinBtn.classList.add('pinned');
    pinBtn.title = '取消置顶';
  } else {
    pinBtn.classList.remove('pinned');
    pinBtn.title = '置顶窗口';
  }
  
  // 发送消息给主进程
  if (window.electron && window.electron.ipcRenderer) {
    window.electron.ipcRenderer.send('toggle-note-pin', isPinned);
  }
}

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

    const wordModes = await window.electronAPI.store.get('wordModes') || [];
    let cm = await window.electronAPI.store.get('currentWordMode');
    if (!cm && wordModes.length) cm = wordModes[0];
    if (!cm) return;

    const modeIndex = wordModes.findIndex(m => m.id === cm.id);
    if (modeIndex === -1) return;

    // 如果最近一条已是相同 html，则不重复添加
    const list = wordModes[modeIndex].words || [];
    const duplicate = list.length > 0 && typeof list[0] === 'object' && list[0].type === 'rich' && list[0].html === content;
    if (!duplicate) {
      const entry = { type: 'rich', html: content, createdAt: Date.now() };
      wordModes[modeIndex].words = [entry, ...list];
      await window.electronAPI.store.set('wordModes', wordModes);
      await window.electronAPI.store.set('currentWordMode', wordModes[modeIndex]);
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

function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = e.target.result;
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

async function saveNoteContent() {
  try {
    if (!currentMode) return;
    
    const wordModes = await window.electronAPI.store.get('wordModes') || [];
    const modeIndex = wordModes.findIndex(m => m.id === currentMode.id);
    
    if (modeIndex !== -1) {
      wordModes[modeIndex].notes = editorContent;
      await window.electronAPI.store.set('wordModes', wordModes);
      
      currentMode.notes = editorContent;
      await window.electronAPI.store.set('currentWordMode', currentMode);
      
      console.log('笔记已自动保存');
    }
  } catch (error) {
    console.error('保存失败:', error);
  }
}

// ==================== 辅助函数 ====================

// 获取第一行文本
function getFirstLineText(html) {
  if (!html || html.trim() === '') return '';
  
  const div = document.createElement('div');
  div.innerHTML = html;
  const text = div.textContent || div.innerText || '';
  const lines = text.split('\n');
  
  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      return trimmed.length > 20 ? trimmed.substring(0, 20) + '...' : trimmed;
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
      openSearchBox();
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
