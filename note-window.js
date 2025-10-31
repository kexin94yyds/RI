// note-window.js - 完整的笔记窗口功能（一比一复刻）

let editor = null;
let editorContent = '';
let currentMode = null;
let saveTimeout = null;
let modes = [];

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  editor = document.getElementById('md-editor');
  
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
  document.getElementById('cache-btn').addEventListener('click', showStorageStatus);
  document.getElementById('share-btn').addEventListener('click', shareNote);
  document.getElementById('copy-btn').addEventListener('click', quickCopyAllContent);
  
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
  window.electronAPI.window.hide();
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
