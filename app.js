// app.js - 多模式内容记录器（Electron版本 - 三栏布局）

// 全局变量
let modes = [];
let currentMode = null;
let isAddingMode = false;
let editingModeId = null;
let searchQuery = "";
let filteredWords = [];
let selectedItemIndex = -1;
let isAllHistoryMode = false; // 是否在全局历史记录模式
let editingItemIndex = -1; // 正在编辑的列表项索引
let originalItemText = ""; // 列表项编辑前的原始文本

// 初始化
document.addEventListener("DOMContentLoaded", async () => {
  await loadModes();
  await showClipboard();
  setupEventListeners();
  updateHistoryList();
  
  // 默认焦点在搜索框
  setTimeout(() => {
    document.getElementById("search-input")?.focus();
  }, 100);
  
  // 当窗口重新获得焦点时，刷新数据
  window.addEventListener("focus", async () => {
    await loadModes();
    await showClipboard();
    updateHistoryList();
    // 焦点回到搜索框
    setTimeout(() => {
      document.getElementById("search-input")?.focus();
    }, 50);
  });

  // 测试钩子
  try {
    if (location.hash === '#test-save') {
      await window.electronAPI.clipboard.writeText('测试保存-自动生成');
      console.log('[TEST] 写入剪贴板: 测试保存-自动生成');
      await saveWord();
    }
  } catch (err) {
    console.error('[TEST] 自动保存失败:', err);
  }
});

// ==================== 剪贴板相关 ====================

let currentClipboardData = null; // 存储当前剪贴板数据（文本或图片）

async function showClipboard() {
  const clipboardWordEl = document.getElementById("clipboard-word");
  if (!clipboardWordEl) return;
  
  try {
    // 检查剪贴板格式
    const formats = await window.electronAPI.clipboard.availableFormats();
    console.log('剪贴板格式:', formats);
    
    // 优先处理图片
    if (formats.hasImage) {
      console.log('检测到图片');
      
      // 先尝试直接读取图片
      let imageData = await window.electronAPI.clipboard.readImage();
      console.log('直接读取图片数据:', imageData);
      
      // 如果直接读取失败，尝试从文件路径读取
      if (!imageData || !imageData.dataURL) {
        console.log('尝试从文件路径读取图片...');
        imageData = await window.electronAPI.clipboard.readFilePaths();
        console.log('从文件路径读取的数据:', imageData);
      }
      
      if (imageData && imageData.dataURL) {
        currentClipboardData = imageData;
        // 显示图片缩略图
        clipboardWordEl.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${imageData.dataURL}" style="max-width: 40px; max-height: 40px; border-radius: 4px;" />
            <span>图片 (${imageData.width}x${imageData.height})</span>
          </div>
        `;
        console.log('成功显示图片缩略图');
        return;
      } else {
        console.log('图片数据为空或无效');
      }
    }
    
    // 处理文本
    const text = await window.electronAPI.clipboard.readText();
    currentClipboardData = { type: 'text', content: text || "" };
    
    const maxLength = 120;
    let displayText = text || "剪贴板为空";
    if (displayText.length > maxLength) {
      displayText = displayText.substring(0, maxLength) + "...";
    }
    clipboardWordEl.innerText = displayText;
    clipboardWordEl.title = text || "";
  } catch (e) {
    console.error('读取剪贴板失败:', e);
    currentClipboardData = { type: 'text', content: "无法读取剪贴板" };
    clipboardWordEl.innerText = "无法读取剪贴板";
  }
}

// ==================== 事件监听器设置 ====================

function setupEventListeners() {
  // 全局历史记录按钮
  document.getElementById("all-history-btn")?.addEventListener("click", showAllHistory);

  // 添加模式按钮
  document.getElementById("add-mode-btn")?.addEventListener("click", showAddModeDialog);

  // 保存按钮
  document.getElementById("save-btn")?.addEventListener("click", saveWord);

  // 编辑相关按钮（已移除，改为直接编辑模式）

  // 搜索功能
  const searchInput = document.getElementById("search-input");
  searchInput?.addEventListener("input", handleSearch);
  searchInput?.addEventListener("keydown", handleSearchKeyDown);

  // 清除搜索按钮
  document.getElementById("clear-search-btn")?.addEventListener("click", clearSearch);

  // 导出导入按钮
  document.getElementById("export-btn")?.addEventListener("click", exportTXT);
  document.getElementById("import-btn")?.addEventListener("click", showImportDialog);

  // 底部按钮
  document.getElementById("review-btn")?.addEventListener("click", startReview);
  document.getElementById("clear-all-btn")?.addEventListener("click", clearAllWords);

  // 模式对话框
  document.getElementById("close-mode-dialog")?.addEventListener("click", closeModeDialog);
  document.getElementById("cancel-mode-btn")?.addEventListener("click", closeModeDialog);
  document.getElementById("save-mode-btn")?.addEventListener("click", saveMode);

  // 复习对话框
  document.getElementById("close-review-dialog")?.addEventListener("click", closeReviewDialog);
  document.getElementById("next-btn")?.addEventListener("click", showRandomReviewWord);
  document.getElementById("remember-btn")?.addEventListener("click", markAsRemembered);

  // 导入对话框
  document.getElementById("close-import-dialog")?.addEventListener("click", closeImportDialog);
  document.getElementById("cancel-import-btn")?.addEventListener("click", closeImportDialog);
  document.getElementById("paste-import-btn")?.addEventListener("click", pasteAndImport);
  document.getElementById("file-import-btn")?.addEventListener("click", () => {
    document.getElementById("file-input")?.click();
  });
  document.getElementById("file-input")?.addEventListener("change", handleFileImport);

  // 键盘导航
  document.addEventListener("keydown", handleKeyboardNavigation);
}

// ==================== 模式管理 ====================

async function loadModes() {
  const wordModes = await window.electronAPI.store.get("wordModes");
  const currentWordMode = await window.electronAPI.store.get("currentWordMode");
  
  modes = wordModes || [{ id: "default", name: "默认", words: [] }];
  currentMode = currentWordMode || modes[0];
  updateModeSidebar();
}

async function saveModes() {
  await window.electronAPI.store.set("wordModes", modes);
  await window.electronAPI.store.set("currentWordMode", currentMode);
}

function updateModeSidebar() {
  const sidebar = document.getElementById("modes-sidebar");
  const allHistoryBtn = document.getElementById("all-history-btn");
  if (!sidebar) return;

  sidebar.innerHTML = "";
  
  // 更新全局历史按钮状态
  if (allHistoryBtn) {
    if (isAllHistoryMode) {
      allHistoryBtn.classList.add("active");
    } else {
      allHistoryBtn.classList.remove("active");
    }
  }

  modes.forEach((mode) => {
    const modeItem = document.createElement("button");
    modeItem.className = `sidebar-item ${!isAllHistoryMode && mode.id === currentMode?.id ? "active" : ""}`;
    modeItem.textContent = mode.name;
    
    // 添加操作按钮
    if (modes.length > 1) {
      const actions = document.createElement("div");
      actions.className = "mode-actions";
      actions.innerHTML = `
        <button class="mode-action-btn" data-action="edit">编辑</button>
        <button class="mode-action-btn delete" data-action="delete">删除</button>
      `;
      modeItem.appendChild(actions);
    }

    // 切换模式
    modeItem.addEventListener("click", (e) => {
      if (!e.target.classList.contains("mode-action-btn")) {
        switchToMode(mode);
      }
    });

    // 编辑和删除按钮
    const actionButtons = modeItem.querySelectorAll(".mode-action-btn");
    actionButtons.forEach(btn => {
      btn.addEventListener("click", (e) => {
      e.stopPropagation();
        const action = btn.getAttribute("data-action");
        if (action === "edit") {
      editMode(mode);
        } else if (action === "delete") {
      deleteMode(mode);
        }
      });
    });

    sidebar.appendChild(modeItem);
  });
}

async function switchToMode(mode) {
  isAllHistoryMode = false;
  currentMode = mode;
  await saveModes();
  updateModeSidebar();
  clearSearch();
  selectedItemIndex = -1;
  updateHistoryList();
  updatePreview();
  showStatus(`已切换到模式：${mode.name}`);
  // 焦点回到搜索框
  setTimeout(() => {
    document.getElementById("search-input")?.focus();
  }, 50);
}

// 显示全局历史记录
function showAllHistory() {
  isAllHistoryMode = true;
  currentMode = null;
  updateModeSidebar();
  clearSearch();
  selectedItemIndex = -1;
  updateHistoryList();
  updatePreview();
  showStatus("已切换到全局历史记录");
  // 焦点回到搜索框
  setTimeout(() => {
    document.getElementById("search-input")?.focus();
  }, 50);
}

function showAddModeDialog() {
  isAddingMode = true;
  editingModeId = null;
  const titleEl = document.getElementById("mode-dialog-title");
  const inputEl = document.getElementById("mode-name-input");
  const dialogEl = document.getElementById("mode-dialog");
  if (titleEl) titleEl.textContent = "添加模式";
  if (inputEl) inputEl.value = "";
  if (dialogEl) dialogEl.style.display = "flex";
  if (inputEl) {
    inputEl.focus();
    inputEl.onkeydown = (e) => {
      if (e.key === "Enter") {
        saveMode();
      } else if (e.key === "Escape") {
        closeModeDialog();
      }
    };
  }
}

function editMode(mode) {
  isAddingMode = false;
  editingModeId = mode.id;
  const titleEl = document.getElementById("mode-dialog-title");
  const inputEl = document.getElementById("mode-name-input");
  const dialogEl = document.getElementById("mode-dialog");
  if (titleEl) titleEl.textContent = "编辑模式";
  if (inputEl) inputEl.value = mode.name;
  if (dialogEl) dialogEl.style.display = "flex";
  if (inputEl) {
    inputEl.focus();
    inputEl.select();
  }
}

function closeModeDialog() {
  const dialogEl = document.getElementById("mode-dialog");
  const inputEl = document.getElementById("mode-name-input");
  if (dialogEl) dialogEl.style.display = "none";
  if (inputEl) inputEl.value = "";
  isAddingMode = false;
  editingModeId = null;
}

async function saveMode() {
  const inputEl = document.getElementById("mode-name-input");
  if (!inputEl) return;

  const name = inputEl.value.trim();

  if (!name) {
    alert("请输入模式名称");
    return;
  }

  if (isAddingMode) {
    if (modes.some((mode) => mode.name === name)) {
      alert("模式名称已存在");
      return;
    }

    const newMode = {
      id: Date.now().toString(),
      name: name,
      words: [],
    };

    modes.push(newMode);
    currentMode = newMode;
    showStatus(`已添加模式：${name}`);
  } else {
    const modeIndex = modes.findIndex((mode) => mode.id === editingModeId);
    if (modeIndex !== -1) {
      if (modes.some((mode, index) => mode.name === name && index !== modeIndex)) {
        alert("模式名称已存在");
        return;
      }

      modes[modeIndex].name = name;
      if (currentMode && currentMode.id === editingModeId) {
        currentMode.name = name;
      }
      showStatus(`已更新模式：${name}`);
    }
  }

  await saveModes();
  updateModeSidebar();
  updateHistoryList();
  closeModeDialog();
}

async function deleteMode(mode) {
  if (modes.length <= 1) {
    alert("至少需要保留一个模式");
    return;
  }

  if (!confirm(`确定要删除模式"${mode.name}"吗？`)) {
    return;
  }

  modes = modes.filter((m) => m.id !== mode.id);

  if (currentMode && currentMode.id === mode.id) {
    isAllHistoryMode = false;
    currentMode = modes[0];
  }

  await saveModes();
  updateModeSidebar();
  selectedItemIndex = -1;
  updateHistoryList();
  updatePreview();
}

// ==================== 搜索功能 ====================

function handleSearch(e) {
  searchQuery = e.target.value.trim();
  updateSearchUI();
  updateHistoryList();
  
  // 如果有搜索结果，自动选中第一项
  if (filteredWords.length > 0 && searchQuery) {
    selectedItemIndex = 0;
  } else {
    selectedItemIndex = -1;
  }
  
  updatePreview();
}

function handleSearchKeyDown(e) {
  if (e.key === "Escape") {
    clearSearch();
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    if (filteredWords.length > 0) {
      if (selectedItemIndex === -1) {
        selectedItemIndex = 0;
      } else if (selectedItemIndex < filteredWords.length - 1) {
        selectedItemIndex++;
      }
      updateHistoryList();
      updatePreview();
      scrollToSelectedItem();
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (filteredWords.length > 0) {
      if (selectedItemIndex === -1) {
        selectedItemIndex = filteredWords.length - 1;
      } else if (selectedItemIndex > 0) {
        selectedItemIndex--;
      }
      updateHistoryList();
      updatePreview();
      scrollToSelectedItem();
    }
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (selectedItemIndex >= 0 && selectedItemIndex < filteredWords.length) {
      // Cmd+Enter 打开链接
      if (e.metaKey || e.ctrlKey) {
        const word = filteredWords[selectedItemIndex];
        const normalized = (typeof word === 'string') ? { type: 'text', content: word } : word;
        
        if (normalized.type === 'text' && isURL(normalized.content)) {
          openURL(normalized.content);
        } else {
          showStatus('当前选中的内容不是链接');
        }
      } else {
        // 普通回车复制到剪贴板
        copyToClipboardFromPreview();
      }
    }
  }
}

// 滚动到选中的项目
function scrollToSelectedItem() {
  if (selectedItemIndex === -1) return;
  
  const selectedItem = document.querySelector(`.history-item[data-index="${selectedItemIndex}"]`);
  if (selectedItem) {
    selectedItem.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'nearest',
      inline: 'nearest'
    });
  }
}

function clearSearch() {
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.value = "";
    searchQuery = "";
    updateSearchUI();
    updateHistoryList();
    searchInput.focus();
  }
}

function updateSearchUI() {
  const clearBtn = document.getElementById("clear-search-btn");
  if (clearBtn) {
    clearBtn.style.display = searchQuery ? "flex" : "none";
  }
}

// ==================== 历史记录列表管理 ====================

function updateHistoryList() {
  let words = [];
  
  if (isAllHistoryMode) {
    // 全局历史记录：合并所有模式的单词
    const allWords = [];
    modes.forEach(mode => {
      if (mode.words && mode.words.length > 0) {
        mode.words.forEach(word => {
          if (!allWords.includes(word)) {
            allWords.push(word);
          }
        });
      }
    });
    words = allWords;
  } else {
  if (!currentMode) return;
    words = currentMode.words || [];
  }
  
  // 过滤搜索结果
  filteredWords = searchQuery 
    ? words.filter(word => {
        // 支持字符串和对象两种格式
        if (typeof word === 'string') {
          return word.toLowerCase().includes(searchQuery.toLowerCase());
        }
        if (typeof word === 'object' && word.type === 'text') {
          return word.content.toLowerCase().includes(searchQuery.toLowerCase());
        }
        if (typeof word === 'object' && word.type === 'image') {
          // 图片可以通过尺寸搜索
          const dimensionText = `${word.width}x${word.height}`;
          return dimensionText.includes(searchQuery) || '图片'.includes(searchQuery);
        }
        return false;
      })
    : [...words];

  const historyList = document.getElementById("history-list");
  const emptyState = document.getElementById("empty-state");

  if (filteredWords.length === 0) {
    historyList.innerHTML = "";
    if (emptyState) {
      emptyState.style.display = "flex";
      if (searchQuery) {
        emptyState.innerHTML = `
          <div class="empty-icon">🔍</div>
          <div class="empty-text">未找到匹配内容</div>
          <div class="empty-hint">尝试使用其他关键词搜索</div>
        `;
      } else {
        emptyState.innerHTML = `
          <div class="empty-icon">📝</div>
          <div class="empty-text">暂无内容</div>
          <div class="empty-hint">保存剪贴板内容开始记录</div>
        `;
      }
    }
    return;
  }

  if (emptyState) {
    emptyState.style.display = "none";
  }

  historyList.innerHTML = "";
  filteredWords.forEach((word, index) => {
    const item = createHistoryItem(word, index);
    historyList.appendChild(item);
  });
}

function createHistoryItem(word, index) {
  const item = document.createElement("div");
  item.className = `history-item ${index === selectedItemIndex ? "active" : ""}`;
  item.setAttribute("data-index", index);
  item.setAttribute("tabindex", "0");
  
  const normalized = (typeof word === 'string') ? { type: 'text', content: word } : word;

  const contentDiv = document.createElement("div");
  contentDiv.className = "history-item-content";
  
  if (normalized.type === 'image') {
    // 显示图片缩略图和文件名
    const fileName = normalized.fileName || '未知文件名';
    contentDiv.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <img src="file://${normalized.path}" 
             style="width: 32px; height: 32px; object-fit: cover; border-radius: 4px; flex-shrink: 0;" 
             onerror="this.style.display='none'"/>
        <span class="history-item-text" style="font-size: 12px;">${escapeHtml(fileName)}</span>
      </div>
    `;
    item.setAttribute("data-word", JSON.stringify(normalized));
  } else {
    // 显示文本
    const textDiv = document.createElement("div");
    textDiv.className = "history-item-text";
    textDiv.textContent = normalized.content;
    contentDiv.appendChild(textDiv);
    item.setAttribute("data-word", normalized.content);
  }

  item.appendChild(contentDiv);

  // 点击选中
  item.addEventListener("click", () => {
    selectedItemIndex = index;
    updateHistoryList();
    updatePreview();
  });

  // 双击进入编辑模式（仅文本）
  item.addEventListener("dblclick", (e) => {
    if (normalized.type === 'image') {
      // 图片不支持编辑
      return;
    }
    if (isAllHistoryMode) {
      alert("在全局历史记录模式下无法编辑，请切换到具体模式");
      return;
    }
    e.stopPropagation();
    startEditingListItem(item, normalized.content, index);
  });

  // 键盘导航
  item.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Cmd+Enter 打开链接
      if (e.metaKey || e.ctrlKey) {
        if (normalized.type === 'text' && isURL(normalized.content)) {
          openURL(normalized.content);
        } else {
          showStatus('当前选中的内容不是链接');
        }
      } else {
        // 普通回车复制到剪贴板
        copyToClipboardFromPreview();
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (index < filteredWords.length - 1) {
        selectedItemIndex = index + 1;
        updateHistoryList();
        updatePreview();
        scrollToSelectedItem();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (index > 0) {
        selectedItemIndex = index - 1;
        updateHistoryList();
        updatePreview();
        scrollToSelectedItem();
      } else {
        // 回到搜索框
        document.getElementById("search-input")?.focus();
        selectedItemIndex = -1;
        updateHistoryList();
        updatePreview();
      }
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteContentItem(word);
    } else if (e.key.length === 1 || e.key === "Backspace") {
      // 输入字符时回到搜索框
      const searchInput = document.getElementById("search-input");
      if (searchInput) {
        searchInput.focus();
        if (e.key.length === 1) {
          searchInput.value += e.key;
          handleSearch({ target: searchInput });
        }
      }
    }
  });

  return item;
}

// ==================== 预览面板管理 ====================

function updatePreview() {
  const previewContent = document.getElementById("preview-content");
  
  if (!previewContent) return;

  if (selectedItemIndex === -1 || selectedItemIndex >= filteredWords.length) {
    previewContent.innerHTML = `
      <div class="preview-empty">
        选择一个项目查看详情
      </div>
    `;
    return;
  }

  const word = filteredWords[selectedItemIndex];
  const normalized = (typeof word === 'string') ? { type: 'text', content: word } : word;
  
  if (normalized.type === 'image') {
    // 显示图片预览 - 纯净模式，无按钮
    previewContent.innerHTML = `
      <div class="preview-image-container">
        <img src="file://${normalized.path}" 
             class="preview-image" 
             alt="图片预览"
             style="cursor: default;"
             onerror="this.alt='图片加载失败'"/>
      </div>
    `;
  } else {
    // 直接显示可编辑的 textarea - 纯净模式，无按钮
    previewContent.innerHTML = `
      <textarea 
        id="preview-textarea" 
        class="preview-textarea"
        placeholder="点击开始编辑..."
      >${escapeHtml(normalized.content)}</textarea>
    `;
    
    // 设置 textarea 事件监听
    const textarea = document.getElementById("preview-textarea");
    if (textarea) {
      // 存储原始内容用于比较
      textarea.setAttribute('data-original', normalized.content);
      
      // 失去焦点时自动保存
      textarea.addEventListener('blur', handlePreviewTextBlur);
      
      // 键盘事件
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          textarea.blur(); // 失去焦点会触发保存
        }
        // Cmd+Enter 打开链接
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          const content = textarea.value.trim();
          if (isURL(content)) {
            openURL(content);
          } else {
            showStatus('当前内容不是链接');
          }
          return;
        }
        // 阻止事件冒泡，避免触发其他快捷键
        e.stopPropagation();
      });
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 处理预览文本失去焦点（自动保存）
async function handlePreviewTextBlur() {
  if (isAllHistoryMode) {
    showStatus("全局历史记录模式下无法编辑");
    updatePreview();
    return;
  }
  
  const textarea = document.getElementById("preview-textarea");
  if (!textarea || !currentMode) return;
  
  const newWord = textarea.value.trim();
  const originalWord = textarea.getAttribute('data-original');
  
  // 如果内容没有变化，不保存
  if (newWord === originalWord) {
    return;
  }
  
  if (!newWord) {
    showStatus("内容不能为空");
    updatePreview(); // 恢复原内容
    return;
  }

  const words = currentMode.words;
  const originalIndex = words.findIndex(w => {
    const normalized = (typeof w === 'string') ? { type: 'text', content: w } : w;
    return normalized.content === originalWord;
  });
  
  if (originalIndex !== -1) {
    // 检查新内容是否已存在（排除当前项）
    const isDuplicate = words.some((w, index) => {
      if (index === originalIndex) return false;
      const normalized = (typeof w === 'string') ? { type: 'text', content: w } : w;
      return normalized.content === newWord;
    });
    
    if (isDuplicate) {
      showStatus("该内容已存在");
      updatePreview(); // 恢复原内容
      return;
    }
    
    // 更新内容
    if (typeof words[originalIndex] === 'string') {
      words[originalIndex] = newWord;
    } else {
      words[originalIndex].content = newWord;
    }

    const modeIndex = modes.findIndex((mode) => mode.id === currentMode?.id);
    if (modeIndex !== -1 && currentMode) {
      modes[modeIndex] = currentMode;
    }

    await saveModes();
    
    // 更新 filteredWords
    if (typeof filteredWords[selectedItemIndex] === 'string') {
      filteredWords[selectedItemIndex] = newWord;
    } else {
      filteredWords[selectedItemIndex].content = newWord;
    }
    
    updateHistoryList();
    showStatus("已自动保存");
  }
}

window.copyToClipboardFromPreview = async function() {
  if (selectedItemIndex === -1 || selectedItemIndex >= filteredWords.length) return;
  
  const word = filteredWords[selectedItemIndex];
  const normalized = (typeof word === 'string') ? { type: 'text', content: word } : word;
  
  try {
    if (normalized.type === 'text') {
      await window.electronAPI.clipboard.writeText(normalized.content);
      showStatus("已复制到剪贴板");
    } else if (normalized.type === 'image') {
      await copyImageToClipboard();
    }
  } catch (e) {
    showStatus("复制失败");
  }
};

window.copyImageToClipboard = async function() {
  if (selectedItemIndex === -1 || selectedItemIndex >= filteredWords.length) return;
  
  const word = filteredWords[selectedItemIndex];
  const normalized = (typeof word === 'string') ? { type: 'text', content: word } : word;
  
  if (normalized.type !== 'image') return;
  
  try {
    const success = await window.electronAPI.clipboard.writeImage(normalized.path);
    if (success) {
      showStatus("图片已复制到剪贴板");
    } else {
      showStatus("复制图片失败");
    }
  } catch (e) {
    console.error('复制图片失败:', e);
    showStatus("复制图片失败");
  }
};

window.openImageFile = async function() {
  if (selectedItemIndex === -1 || selectedItemIndex >= filteredWords.length) return;
  
  const word = filteredWords[selectedItemIndex];
  const normalized = (typeof word === 'string') ? { type: 'text', content: word } : word;
  
  if (normalized.type !== 'image') return;
  
  try {
    const success = await window.electronAPI.fs.openPath(normalized.path);
    if (success) {
      showStatus("已打开图片");
    } else {
      showStatus("打开图片失败，文件可能不存在");
    }
  } catch (e) {
    console.error('打开图片失败:', e);
    showStatus("打开图片失败");
  }
};

window.deleteCurrentItem = async function() {
  if (selectedItemIndex === -1 || selectedItemIndex >= filteredWords.length) return;
  
  if (isAllHistoryMode) {
    alert("在全局历史记录模式下无法删除，请切换到具体模式");
    return;
  }
  
  const word = filteredWords[selectedItemIndex];
  if (confirm(`确定要删除这个内容吗？`)) {
    await deleteContentItem(word);
  }
};

async function deleteContentItem(word) {
  if (!currentMode) return;

  currentMode.words = currentMode.words.filter((w) => w !== word);

    const modeIndex = modes.findIndex((mode) => mode.id === currentMode?.id);
  if (modeIndex !== -1 && currentMode) {
      modes[modeIndex] = currentMode;
    }

    await saveModes();
  
  // 调整选中索引
  if (selectedItemIndex >= filteredWords.length - 1) {
    selectedItemIndex = Math.max(0, filteredWords.length - 2);
  }
  
  updateHistoryList();
  updatePreview();
}

// ==================== 保存单词功能 ====================

async function saveWord() {
  if (!currentMode) return;
  if (!currentClipboardData) {
    showStatus("剪贴板为空");
    return;
  }

  let itemToSave;
  let displayText;
  
  if (currentClipboardData.type === 'image') {
    // 保存图片数据
    itemToSave = {
      type: 'image',
      fileName: currentClipboardData.fileName,
      thumbFileName: currentClipboardData.thumbFileName,
      width: currentClipboardData.width,
      height: currentClipboardData.height,
      size: currentClipboardData.size,
      path: currentClipboardData.path
    };
    displayText = `图片 (${itemToSave.width}x${itemToSave.height})`;
  } else {
    // 保存文本数据
    const text = currentClipboardData.content.trim();
    if (!text) {
      showStatus("剪贴板为空");
      return;
    }
    itemToSave = {
      type: 'text',
      content: text
    };
    displayText = text.length > 20 ? text.substring(0, 20) + "..." : text;
  }

  // 检查是否已存在（简单的对比）
  const isDuplicate = currentMode.words.some(word => {
    if (typeof word === 'string') {
      return word === itemToSave.content;
    }
    if (typeof word === 'object') {
      if (word.type === 'image' && itemToSave.type === 'image') {
        return word.fileName === itemToSave.fileName;
      }
      if (word.type === 'text' && itemToSave.type === 'text') {
        return word.content === itemToSave.content;
      }
    }
    return false;
  });

  if (!isDuplicate) {
    currentMode.words.unshift(itemToSave); // 添加到开头

    const modeIndex = modes.findIndex((mode) => mode.id === currentMode?.id);
    if (modeIndex !== -1) {
      modes[modeIndex] = currentMode;
    }

    await saveModes();
    showStatus("已保存：" + displayText);
    selectedItemIndex = 0;
    updateHistoryList();
    updatePreview();
  } else {
    showStatus("内容已存在");
  }
}

function showStatus(message) {
  const statusEl = document.getElementById("save-status");
  if (statusEl) {
    statusEl.innerText = message;
    setTimeout(() => {
      statusEl.innerText = "";
    }, 3000);
  }
  try { console.log('[STATUS]', message); } catch (_) {}
}

// ==================== 复习功能 ====================

let reviewWords = [];
let currentReview = "";

function startReview() {
  if (!currentMode) return;

  reviewWords = [...currentMode.words];
  if (reviewWords.length === 0) {
    alert("当前模式下暂无内容可复习");
          return;
        }

  const dialogEl = document.getElementById("review-dialog");
  if (dialogEl) dialogEl.style.display = "flex";
  showRandomReviewWord();
}

function showRandomReviewWord() {
  const reviewWordEl = document.getElementById("review-word");
  if (reviewWords.length === 0) {
    closeReviewDialog();
    alert("复习完成！");
            return;
          }
  const idx = Math.floor(Math.random() * reviewWords.length);
  currentReview = reviewWords[idx];
  if (reviewWordEl) reviewWordEl.innerText = currentReview;
  reviewWords.splice(idx, 1);
}

async function markAsRemembered() {
  if (!currentReview || !currentMode) return;

  currentMode.words = currentMode.words.filter((w) => w !== currentReview);

          const modeIndex = modes.findIndex((mode) => mode.id === currentMode?.id);
  if (modeIndex !== -1) {
            modes[modeIndex] = currentMode;
          }

          await saveModes();
  const reviewWordEl = document.getElementById("review-word");
  if (reviewWordEl) reviewWordEl.innerText = "已移除：" + currentReview;
  setTimeout(() => {
    showRandomReviewWord();
    updateHistoryList();
    updatePreview();
  }, 800);
}

function closeReviewDialog() {
  const dialogEl = document.getElementById("review-dialog");
  if (dialogEl) dialogEl.style.display = "none";
}

// ==================== 清空功能 ====================

async function clearAllWords() {
  if (isAllHistoryMode) {
    alert("在全局历史记录模式下无法清空，请切换到具体模式");
    return;
  }
  
  if (!currentMode) return;

  if (confirm(`确定要清空当前模式"${currentMode.name}"下的所有内容吗？`)) {
    currentMode.words = [];

      const modeIndex = modes.findIndex((mode) => mode.id === currentMode?.id);
    if (modeIndex !== -1) {
        modes[modeIndex] = currentMode;
      }

      await saveModes();
    selectedItemIndex = -1;
    updateHistoryList();
    updatePreview();
    showStatus("已清空当前模式的所有内容");
  }
}

// ==================== 导出功能 ====================

async function exportTXT() {
  if (!currentMode) return;

  const words = currentMode.words;
  if (words.length === 0) {
    alert(`当前模式"${currentMode.name}"下暂无内容可导出`);
    return;
  }

  const txt = words.join("\n");
  const filename = `${currentMode.name}_记录.txt`;

  const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showStatus(`已导出到 ${filename}`);
}

// ==================== 导入功能 ====================

function showImportDialog() {
  const dialogEl = document.getElementById("import-dialog");
  const textEl = document.getElementById("import-text");
  if (dialogEl) dialogEl.style.display = "flex";
  if (textEl) {
    textEl.value = "";
    textEl.focus();
  }
}

function closeImportDialog() {
  const dialogEl = document.getElementById("import-dialog");
  const textEl = document.getElementById("import-text");
  if (dialogEl) dialogEl.style.display = "none";
  if (textEl) textEl.value = "";
}

async function pasteAndImport() {
  const textEl = document.getElementById("import-text");
  
  try {
    const clipboardText = await window.electronAPI.clipboard.readText();
    if (clipboardText && textEl) {
      textEl.value = clipboardText;
    }

    const text = textEl?.value.trim() || "";
    if (!text) {
      alert("请先粘贴或输入内容列表");
      return;
    }

    await importWords(text);
  } catch (e) {
    const text = textEl?.value.trim() || "";
    if (!text) {
      alert("请在文本框中粘贴内容列表");
      return;
    }
    await importWords(text);
  }
}

function handleFileImport(e) {
  const target = e.target;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const text = e.target?.result || "";
    await importWords(text);
  };
  reader.readAsText(file);
}

async function importWords(text) {
  if (!currentMode) return;

  const newWords = text
    .split("\n")
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

  if (newWords.length === 0) {
    alert("没有找到有效的内容");
    return;
  }

  const existingWords = currentMode.words;
  const wordsToAdd = newWords.filter((word) => !existingWords.includes(word));
  const duplicateCount = newWords.length - wordsToAdd.length;

  if (wordsToAdd.length === 0) {
    alert("所有内容都已存在于当前模式中");
    return;
  }

  currentMode.words = [...wordsToAdd, ...existingWords];

  const modeIndex = modes.findIndex((mode) => mode.id === currentMode?.id);
  if (modeIndex !== -1 && currentMode) {
    modes[modeIndex] = currentMode;
  }

  await saveModes();

  let message = `成功导入 ${wordsToAdd.length} 条新内容到模式"${currentMode.name}"`;
  if (duplicateCount > 0) {
    message += `，跳过 ${duplicateCount} 条重复内容`;
  }
  alert(message);

  closeImportDialog();
  selectedItemIndex = 0;
  updateHistoryList();
  updatePreview();
  showStatus(message);
}

// ==================== URL 检测与打开 ====================

// 检测字符串是否为 URL
function isURL(str) {
  if (!str || typeof str !== 'string') return false;
  
  // URL 正则表达式
  const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
  const simpleUrlPattern = /^(https?:\/\/|www\.)/i;
  
  return urlPattern.test(str) || simpleUrlPattern.test(str);
}

// 标准化 URL（确保有协议）
function normalizeURL(url) {
  if (!url) return url;
  
  // 如果已经有协议，直接返回
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  
  // 如果以 www. 开头，添加 https://
  if (/^www\./i.test(url)) {
    return 'https://' + url;
  }
  
  // 其他情况也添加 https://
  return 'https://' + url;
}

// 打开链接
async function openURL(url) {
  if (!url) return;
  
  try {
    const normalizedURL = normalizeURL(url);
    const success = await window.electronAPI.shell.openExternal(normalizedURL);
    if (success) {
      showStatus(`已打开链接: ${normalizedURL}`);
    } else {
      showStatus('打开链接失败');
    }
  } catch (error) {
    console.error('打开链接失败:', error);
    showStatus('打开链接失败');
  }
}

// ==================== 键盘导航 ====================

function handleKeyboardNavigation(e) {
  // 如果在输入框中，不处理
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
    return;
  }

  // 全局快捷键
  if (e.key === "Escape") {
    closeModeDialog();
    closeReviewDialog();
    closeImportDialog();
  }
  
  // Cmd+Enter (Mac) 或 Ctrl+Enter (Windows/Linux) 打开链接
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    if (selectedItemIndex !== -1 && selectedItemIndex < filteredWords.length) {
      const word = filteredWords[selectedItemIndex];
      const normalized = (typeof word === 'string') ? { type: 'text', content: word } : word;
      
      if (normalized.type === 'text' && isURL(normalized.content)) {
        openURL(normalized.content);
      } else {
        showStatus('当前选中的内容不是链接');
      }
    }
  }
  
  // Cmd+Delete (Mac) 或 Ctrl+Delete (Windows/Linux) 删除选中项
  if ((e.metaKey || e.ctrlKey) && (e.key === "Backspace" || e.key === "Delete")) {
    e.preventDefault();
    if (selectedItemIndex !== -1 && selectedItemIndex < filteredWords.length) {
      window.deleteCurrentItem();
    }
  }
}

// ==================== 列表项内编辑 ====================

function startEditingListItem(item, word, index) {
  if (editingItemIndex !== -1) {
    // 如果已经有正在编辑的项，先保存
    finishEditingListItem(true);
  }

  editingItemIndex = index;
  originalItemText = word;

  // 替换文本为输入框
  const textDiv = item.querySelector('.history-item-text');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'history-item-edit-input';
  input.value = word;
  
  // 清空并添加输入框
  textDiv.innerHTML = '';
  textDiv.appendChild(input);
  
  // 聚焦并选中文本
  input.focus();
  input.select();
  
  // 监听键盘事件
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      saveListItemEdit(input.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelListItemEdit();
    }
  });
  
  // 失去焦点时保存
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (editingItemIndex === index) {
        saveListItemEdit(input.value);
      }
    }, 100);
  });
}

async function saveListItemEdit(newText) {
  if (editingItemIndex === -1) return;
  if (!currentMode) return;
  
  newText = newText.trim();
  
  if (newText === '') {
    alert('内容不能为空');
    cancelListItemEdit();
    return;
  }
  
  const oldText = originalItemText;
  
  // 在当前模式中查找并替换
  const wordIndex = currentMode.words.indexOf(oldText);
  if (wordIndex !== -1) {
    currentMode.words[wordIndex] = newText;
    
    // 更新 modes 数组
    const modeIndex = modes.findIndex((mode) => mode.id === currentMode?.id);
    if (modeIndex !== -1) {
      modes[modeIndex] = currentMode;
    }
    
    await saveModes();
    
    // 重置编辑状态
    editingItemIndex = -1;
    originalItemText = '';
    
    // 刷新显示
    updateHistoryList();
    updatePreview();
    showStatus('内容已更新');
  } else {
    cancelListItemEdit();
  }
}

function cancelListItemEdit() {
  editingItemIndex = -1;
  originalItemText = '';
  updateHistoryList();
}

function finishEditingListItem(save) {
  if (editingItemIndex === -1) return;
  
  const item = document.querySelector(`[data-index="${editingItemIndex}"]`);
  if (!item) return;
  
  const input = item.querySelector('.history-item-edit-input');
  if (!input) return;
  
  if (save) {
    saveListItemEdit(input.value);
  } else {
    cancelListItemEdit();
  }
}
