// popup.js - 多模式单词记录器

// 全局变量
let modes = [];
let currentMode = null;
let isAddingMode = false;
let editingModeId = null;

// 初始化
document.addEventListener('DOMContentLoaded', function() {
  loadModes();
  showClipboard();
  setupEventListeners();
});

// 显示剪贴板内容
async function showClipboard() {
  let word = '';
  try {
    word = await navigator.clipboard.readText();
  } catch (e) {
    word = '无法读取剪贴板';
  }
  document.getElementById('clipboard-word').innerText = word || '剪贴板为空';
}

// 设置事件监听器
function setupEventListeners() {
  // 模式切换器
  document.getElementById('mode-switcher').addEventListener('click', toggleModeDropdown);
  
  // 添加模式
  document.getElementById('add-mode-item').addEventListener('click', showAddModeDialog);
  
  // 模式对话框
  document.getElementById('close-mode-dialog').addEventListener('click', closeModeDialog);
  document.getElementById('cancel-mode-btn').addEventListener('click', closeModeDialog);
  document.getElementById('save-mode-btn').addEventListener('click', saveMode);
  
  // 保存单词按钮
  document.getElementById('save-btn').addEventListener('click', saveWord);
  
  // 其他现有功能
  setupExistingEventListeners();
}

// 设置现有功能的事件监听器
function setupExistingEventListeners() {
  // 复习功能
  document.getElementById('review-btn').addEventListener('click', startReview);
  document.getElementById('next-btn').addEventListener('click', showRandomReviewWord);
  document.getElementById('remember-btn').addEventListener('click', markAsRemembered);
  
  // 单词列表管理
  document.getElementById('show-list-btn').addEventListener('click', toggleWordList);
  document.getElementById('clear-all-btn').addEventListener('click', clearAllWords);
  document.getElementById('export-btn').addEventListener('click', exportTXT);
  document.getElementById('import-btn').addEventListener('click', toggleImportArea);
  
  // 导入功能
  document.getElementById('paste-import-btn').addEventListener('click', pasteAndImport);
  document.getElementById('file-import-btn').addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('file-input').addEventListener('change', handleFileImport);
  document.getElementById('cancel-import-btn').addEventListener('click', cancelImport);
}

// 模式管理功能
function loadModes() {
  chrome.storage.local.get(['wordModes', 'currentWordMode'], (result) => {
    modes = result.wordModes || [
      { id: 'default', name: '默认', words: [] }
    ];
    currentMode = result.currentWordMode || modes[0];
    updateModeUI();
  });
}

function saveModes() {
  chrome.storage.local.set({
    wordModes: modes,
    currentWordMode: currentMode
  });
}

function updateModeUI() {
  document.getElementById('current-mode-name').textContent = currentMode.name;
  updateModeDropdown();
}

function updateModeDropdown() {
  const modesList = document.getElementById('modes-list');
  modesList.innerHTML = '';
  
  modes.forEach(mode => {
    const modeItem = document.createElement('div');
    modeItem.className = `mode-item ${mode.id === currentMode.id ? 'active' : ''}`;
    modeItem.innerHTML = `
      <span class="mode-name">${mode.name}</span>
      <div class="mode-actions">
        <button class="mode-action-btn edit" data-mode-id="${mode.id}">编辑</button>
        <button class="mode-action-btn delete" data-mode-id="${mode.id}">删除</button>
      </div>
    `;
    
    // 切换模式
    modeItem.addEventListener('click', (e) => {
      if (!e.target.classList.contains('mode-action-btn')) {
        switchToMode(mode);
      }
    });
    
    // 编辑模式
    const editBtn = modeItem.querySelector('.edit');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      editMode(mode);
    });
    
    // 删除模式
    const deleteBtn = modeItem.querySelector('.delete');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteMode(mode);
    });
    
    modesList.appendChild(modeItem);
  });
}

function toggleModeDropdown() {
  const dropdown = document.getElementById('mode-dropdown-menu');
  const switcher = document.getElementById('mode-switcher');
  
  if (dropdown.style.display === 'none' || dropdown.style.display === '') {
    dropdown.style.display = 'block';
    switcher.classList.add('active');
  } else {
    dropdown.style.display = 'none';
    switcher.classList.remove('active');
  }
}

function switchToMode(mode) {
  currentMode = mode;
  saveModes();
  updateModeUI();
  showWordList();
  document.getElementById('mode-dropdown-menu').style.display = 'none';
  document.getElementById('mode-switcher').classList.remove('active');
  showStatus(`已切换到模式：${mode.name}`);
}

function showAddModeDialog() {
  isAddingMode = true;
  editingModeId = null;
  document.getElementById('mode-dialog-title').textContent = '添加模式';
  document.getElementById('mode-name-input').value = '';
  document.getElementById('mode-dialog').style.display = 'flex';
  document.getElementById('mode-name-input').focus();
}

function editMode(mode) {
  isAddingMode = false;
  editingModeId = mode.id;
  document.getElementById('mode-dialog-title').textContent = '编辑模式';
  document.getElementById('mode-name-input').value = mode.name;
  document.getElementById('mode-dialog').style.display = 'flex';
  document.getElementById('mode-name-input').focus();
  document.getElementById('mode-name-input').select();
}

function closeModeDialog() {
  document.getElementById('mode-dialog').style.display = 'none';
  document.getElementById('mode-name-input').value = '';
  isAddingMode = false;
  editingModeId = null;
}

function saveMode() {
  const name = document.getElementById('mode-name-input').value.trim();
  
  if (!name) {
    alert('请输入模式名称');
    return;
  }
  
  if (isAddingMode) {
    // 检查名称是否已存在
    if (modes.some(mode => mode.name === name)) {
      alert('模式名称已存在');
      return;
    }
    
    const newMode = {
      id: Date.now().toString(),
      name: name,
      words: []
    };
    
    modes.push(newMode);
    currentMode = newMode;
    showStatus(`已添加模式：${name}`);
  } else {
    // 编辑现有模式
    const modeIndex = modes.findIndex(mode => mode.id === editingModeId);
    if (modeIndex !== -1) {
      // 检查名称是否与其他模式重复
      if (modes.some((mode, index) => mode.name === name && index !== modeIndex)) {
        alert('模式名称已存在');
        return;
      }
      
      modes[modeIndex].name = name;
      if (currentMode.id === editingModeId) {
        currentMode.name = name;
      }
      showStatus(`已更新模式：${name}`);
    }
  }
  
  saveModes();
  updateModeUI();
  closeModeDialog();
}

function deleteMode(mode) {
  if (modes.length <= 1) {
    alert('至少需要保留一个模式');
    return;
  }
  
  if (confirm(`确定要删除模式"${mode.name}"吗？\n该模式下的所有单词也将被删除。`)) {
    modes = modes.filter(m => m.id !== mode.id);
    
    if (currentMode.id === mode.id) {
      currentMode = modes[0];
    }
    
    saveModes();
    updateModeUI();
    showWordList();
    showStatus(`已删除模式：${mode.name}`);
  }
}

// 保存单词功能（多模式版本）
async function saveWord() {
  let word = '';
  try {
    word = await navigator.clipboard.readText();
  } catch (e) {
    showStatus('无法读取剪贴板');
    return;
  }
  
  if (!word.trim()) {
    showStatus('剪贴板为空');
    return;
  }
  
  word = word.trim();
  
  if (!currentMode.words.includes(word)) {
    currentMode.words.push(word);
    
    // 更新模式数据
    const modeIndex = modes.findIndex(mode => mode.id === currentMode.id);
    if (modeIndex !== -1) {
      modes[modeIndex] = currentMode;
    }
    
    saveModes();
    showStatus('已保存：' + word);
    showWordList();
  } else {
    showStatus('单词已存在');
  }
}

function showStatus(message) {
  document.getElementById('save-status').innerText = message;
}

// 复习功能（多模式版本）
let reviewWords = [];
let currentReview = '';

function startReview() {
  reviewWords = [...currentMode.words];
  if (reviewWords.length === 0) {
    document.getElementById('review-area').style.display = 'none';
    alert('当前模式下暂无单词可复习');
    return;
  }
  document.getElementById('review-area').style.display = '';
  showRandomReviewWord();
}

function showRandomReviewWord() {
  if (reviewWords.length === 0) {
    document.getElementById('review-area').style.display = 'none';
    alert('复习完成！');
    return;
  }
  const idx = Math.floor(Math.random() * reviewWords.length);
  currentReview = reviewWords[idx];
  document.getElementById('review-word').innerText = currentReview;
  reviewWords.splice(idx, 1);
}

function markAsRemembered() {
  if (!currentReview) return;
  
  // 从当前模式的单词列表中移除
  currentMode.words = currentMode.words.filter(w => w !== currentReview);
  
  // 更新模式数据
  const modeIndex = modes.findIndex(mode => mode.id === currentMode.id);
  if (modeIndex !== -1) {
    modes[modeIndex] = currentMode;
  }
  
  saveModes();
  document.getElementById('review-word').innerText = '已移除：' + currentReview;
  setTimeout(() => {
    showRandomReviewWord();
    showWordList();
  }, 800);
}

// 单词列表管理（多模式版本）
const wordListDiv = document.getElementById('word-list');

function toggleWordList() {
  if (wordListDiv.style.display === 'none') {
    showWordList();
    wordListDiv.style.display = '';
  } else {
    wordListDiv.style.display = 'none';
  }
}

function clearAllWords() {
  if (confirm(`确定要清空当前模式"${currentMode.name}"下的所有单词吗？`)) {
    currentMode.words = [];
    
    // 更新模式数据
    const modeIndex = modes.findIndex(mode => mode.id === currentMode.id);
    if (modeIndex !== -1) {
      modes[modeIndex] = currentMode;
    }
    
    saveModes();
    showWordList();
    showStatus('已清空当前模式的所有单词');
  }
}

function showWordList() {
  const words = currentMode.words;
  if (words.length === 0) {
    wordListDiv.innerHTML = `<div style="color:#888;">当前模式"${currentMode.name}"下暂无单词</div>`;
    return;
  }
  
  wordListDiv.innerHTML = '';
  words.forEach(word => {
    const item = document.createElement('div');
    item.className = 'word-item';
    item.innerHTML = `
      <span class="word-text" data-word="${word}">${word}</span>
      <button class="delete-btn" data-word="${word}">删除</button>
    `;
    wordListDiv.appendChild(item);
  });
  
  // 绑定单词文本点击编辑事件
  Array.from(document.getElementsByClassName('word-text')).forEach(wordSpan => {
    wordSpan.addEventListener('click', (e) => {
      const originalWord = e.target.getAttribute('data-word');
      const currentText = e.target.textContent;
      const wordItem = e.target.closest('.word-item');
      const deleteBtn = wordItem.querySelector('.delete-btn');
      
      // 创建多行文本框替换文本
      const textarea = document.createElement('textarea');
      textarea.value = currentText;
      textarea.className = 'edit-textarea-inline';
      
      // 自动调整高度以适应内容
      textarea.style.height = 'auto';
      textarea.style.minHeight = '20px';
      
      // 隐藏原文本和删除按钮
      e.target.style.display = 'none';
      deleteBtn.style.display = 'none';
      
      // 插入文本框
      wordItem.insertBefore(textarea, e.target);
      textarea.focus();
      textarea.select();
      
      // 自动调整高度函数
      const adjustHeight = () => {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
      };
      
      // 初始调整高度
      setTimeout(adjustHeight, 0);
      
      // 输入时自动调整高度
      textarea.addEventListener('input', adjustHeight);
      
      // 保存编辑
      const saveEdit = () => {
        const newWord = textarea.value.trim();
        if (!newWord) {
          alert('单词不能为空');
          textarea.focus();
          return;
        }
        
        const words = currentMode.words;
        const index = words.indexOf(originalWord);
        if (index !== -1) {
          // 检查新单词是否已存在（除了当前单词）
          if (newWord !== originalWord && words.includes(newWord)) {
            alert('该单词已存在');
            textarea.focus();
            return;
          }
          words[index] = newWord;
          
          // 更新模式数据
          const modeIndex = modes.findIndex(mode => mode.id === currentMode.id);
          if (modeIndex !== -1) {
            modes[modeIndex] = currentMode;
          }
          
          saveModes();
          showWordList();
          showStatus('已更新：' + newWord);
        }
      };
      
      // 取消编辑
      const cancelEdit = () => {
        e.target.style.display = '';
        deleteBtn.style.display = '';
        textarea.remove();
      };
      
      // 失去焦点时保存
      textarea.addEventListener('blur', saveEdit);
      
      // Ctrl+Enter保存，ESC取消
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault();
          saveEdit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelEdit();
        }
      });
    });
  });
  
  // 绑定删除事件
  Array.from(document.getElementsByClassName('delete-btn')).forEach(btn => {
    btn.addEventListener('click', (e) => {
      const w = e.target.getAttribute('data-word');
      if (confirm(`确定要删除单词"${w}"吗？`)) {
        currentMode.words = currentMode.words.filter(x => x !== w);
        
        // 更新模式数据
        const modeIndex = modes.findIndex(mode => mode.id === currentMode.id);
        if (modeIndex !== -1) {
          modes[modeIndex] = currentMode;
        }
        
        saveModes();
        showWordList();
        showStatus('已删除：' + w);
      }
    });
  });
}

// 导出TXT（多模式版本）
function exportTXT() {
  const words = currentMode.words;
  if (words.length === 0) {
    alert(`当前模式"${currentMode.name}"下暂无单词可导出`);
    return;
  }
  
  const txt = words.join("\n");
  const blob = new Blob([txt], {type: 'text/plain'});
  const url = URL.createObjectURL(blob);
  const filename = `${currentMode.name}_words.txt`;
  
  chrome.downloads.download({
    url,
    filename: filename
  });
  
  showStatus(`已导出模式"${currentMode.name}"的单词到 ${filename}`);
}

// 导入TXT功能（多模式版本）
const importArea = document.getElementById('import-area');
const importText = document.getElementById('import-text');

function toggleImportArea() {
  if (importArea.style.display === 'none') {
    importArea.style.display = '';
    importText.focus();
  } else {
    importArea.style.display = 'none';
  }
}

function cancelImport() {
  importArea.style.display = 'none';
  importText.value = '';
}

// 粘贴并导入
function pasteAndImport() {
  try {
    // 自动获取剪贴板内容
    navigator.clipboard.readText().then(clipboardText => {
      if (clipboardText) {
        importText.value = clipboardText;
      }
      
      const text = importText.value.trim();
      if (!text) {
        alert('请先粘贴或输入单词列表');
        return;
      }
      
      importWords(text);
    });
  } catch (e) {
    // 如果无法自动读取剪贴板，使用文本框内容
    const text = importText.value.trim();
    if (!text) {
      alert('请在文本框中粘贴单词列表');
      return;
    }
    importWords(text);
  }
}

// 文件导入
function handleFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    importWords(text);
  };
  reader.readAsText(file);
}

// 导入单词核心逻辑（多模式版本）
function importWords(text) {
  // 解析文本，每行一个单词
  const newWords = text.split('\n')
    .map(word => word.trim())
    .filter(word => word.length > 0);
  
  if (newWords.length === 0) {
    alert('没有找到有效的单词');
    return;
  }
  
  const existingWords = currentMode.words;
  const wordsToAdd = newWords.filter(word => !existingWords.includes(word));
  const duplicateCount = newWords.length - wordsToAdd.length;
  
  if (wordsToAdd.length === 0) {
    alert('所有单词都已存在于当前模式中');
    return;
  }
  
  // 添加到当前模式
  currentMode.words = [...existingWords, ...wordsToAdd];
  
  // 更新模式数据
  const modeIndex = modes.findIndex(mode => mode.id === currentMode.id);
  if (modeIndex !== -1) {
    modes[modeIndex] = currentMode;
  }
  
  saveModes();
  
  let message = `成功导入 ${wordsToAdd.length} 个新单词到模式"${currentMode.name}"`;
  if (duplicateCount > 0) {
    message += `，跳过 ${duplicateCount} 个重复单词`;
  }
  alert(message);
  
  // 清空文本框并隐藏导入区域
  importText.value = '';
  importArea.style.display = 'none';
  
  // 刷新单词列表显示
  showWordList();
  
  // 更新状态提示
  showStatus(message);
}