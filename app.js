// app.js - 多模式单词记录器（Electron版本）

// 全局变量
let modes = [];
let currentMode = null;
let isAddingMode = false;
let editingModeId = null;

// 初始化
document.addEventListener("DOMContentLoaded", async () => {
  await loadModes();
  await showClipboard();
  setupEventListeners();
  // 当窗口重新获得焦点（例如通过快捷键显示窗口）时，刷新存储数据与显示
  window.addEventListener("focus", async () => {
    await loadModes();
    showWordList();
    await showClipboard();
  });
});

// 显示剪贴板内容
async function showClipboard() {
  let word = "";
  try {
    word = await window.electronAPI.clipboard.readText();
  } catch (e) {
    word = "无法读取剪贴板";
  }
  const clipboardWordEl = document.getElementById("clipboard-word");
  if (clipboardWordEl) {
    // 限制显示长度，避免占用太多空间
    const maxLength = 50;
    let displayText = word || "剪贴板为空";
    if (displayText.length > maxLength) {
      displayText = displayText.substring(0, maxLength) + "...";
    }
    clipboardWordEl.innerText = displayText;
    clipboardWordEl.title = word; // 完整内容显示在 tooltip 中
  }
}

// 设置事件监听器
function setupEventListeners() {
  // 模式切换器
  document.getElementById("mode-switcher")?.addEventListener("click", toggleModeDropdown);

  // 添加模式
  document.getElementById("add-mode-item")?.addEventListener("click", showAddModeDialog);

  // 模式对话框
  document.getElementById("close-mode-dialog")?.addEventListener("click", closeModeDialog);
  document.getElementById("cancel-mode-btn")?.addEventListener("click", closeModeDialog);
  document.getElementById("save-mode-btn")?.addEventListener("click", saveMode);

  // 保存单词按钮
  document.getElementById("save-btn")?.addEventListener("click", saveWord);

  // 其他现有功能
  setupExistingEventListeners();
}

// 设置现有功能的事件监听器
function setupExistingEventListeners() {
  // 复习功能
  document.getElementById("review-btn")?.addEventListener("click", startReview);
  document.getElementById("next-btn")?.addEventListener("click", showRandomReviewWord);
  document.getElementById("remember-btn")?.addEventListener("click", markAsRemembered);

  // 单词列表管理
  document.getElementById("show-list-btn")?.addEventListener("click", toggleWordList);
  document.getElementById("clear-all-btn")?.addEventListener("click", clearAllWords);
  document.getElementById("export-btn")?.addEventListener("click", exportTXT);
  document.getElementById("import-btn")?.addEventListener("click", toggleImportArea);

  // 导入功能
  document.getElementById("paste-import-btn")?.addEventListener("click", pasteAndImport);
  document.getElementById("file-import-btn")?.addEventListener("click", () => {
    document.getElementById("file-input")?.click();
  });
  document.getElementById("file-input")?.addEventListener("change", handleFileImport);
  document.getElementById("cancel-import-btn")?.addEventListener("click", cancelImport);
}

// 模式管理功能
async function loadModes() {
  const wordModes = await window.electronAPI.store.get("wordModes");
  const currentWordMode = await window.electronAPI.store.get("currentWordMode");
  
  modes = wordModes || [{ id: "default", name: "默认", words: [] }];
  currentMode = currentWordMode || modes[0];
  updateModeUI();
}

async function saveModes() {
  await window.electronAPI.store.set("wordModes", modes);
  await window.electronAPI.store.set("currentWordMode", currentMode);
}

function updateModeUI() {
  const currentModeNameEl = document.getElementById("current-mode-name");
  if (currentModeNameEl && currentMode) {
    currentModeNameEl.textContent = currentMode.name;
  }
  updateModeDropdown();
}

function updateModeDropdown() {
  const modesList = document.getElementById("modes-list");
  if (!modesList || !currentMode) return;

  modesList.innerHTML = "";

  modes.forEach((mode) => {
    const modeItem = document.createElement("div");
    modeItem.className = `mode-item ${mode.id === currentMode?.id ? "active" : ""}`;
    modeItem.innerHTML = `
      <span class="mode-name">${mode.name}</span>
      <div class="mode-actions">
        <button class="mode-action-btn edit" data-mode-id="${mode.id}">编辑</button>
        <button class="mode-action-btn delete" data-mode-id="${mode.id}">删除</button>
      </div>
    `;

    // 切换模式
    modeItem.addEventListener("click", (e) => {
      if (!e.target.classList.contains("mode-action-btn")) {
        switchToMode(mode);
      }
    });

    // 编辑模式
    const editBtn = modeItem.querySelector(".edit");
    editBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      editMode(mode);
    });

    // 删除模式
    const deleteBtn = modeItem.querySelector(".delete");
    deleteBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteMode(mode);
    });

    modesList.appendChild(modeItem);
  });
}

function toggleModeDropdown() {
  const dropdown = document.getElementById("mode-dropdown-menu");
  const switcher = document.getElementById("mode-switcher");

  if (dropdown && switcher) {
    if (dropdown.style.display === "none" || dropdown.style.display === "") {
      dropdown.style.display = "block";
      switcher.classList.add("active");
    } else {
      dropdown.style.display = "none";
      switcher.classList.remove("active");
    }
  }
}

async function switchToMode(mode) {
  currentMode = mode;
  await saveModes();
  updateModeUI();
  showWordList();
  const dropdown = document.getElementById("mode-dropdown-menu");
  const switcher = document.getElementById("mode-switcher");
  if (dropdown) dropdown.style.display = "none";
  if (switcher) switcher.classList.remove("active");
  showStatus(`已切换到模式：${mode.name}`);
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
  if (inputEl) inputEl.focus();
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
    // 检查名称是否已存在
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
    // 编辑现有模式
    const modeIndex = modes.findIndex((mode) => mode.id === editingModeId);
    if (modeIndex !== -1) {
      // 检查名称是否与其他模式重复
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
  updateModeUI();
  closeModeDialog();
}

async function deleteMode(mode) {
  if (modes.length <= 1) {
    alert("至少需要保留一个模式");
    return;
  }

  // 直接删除，不需要确认
  modes = modes.filter((m) => m.id !== mode.id);

  if (currentMode && currentMode.id === mode.id) {
    currentMode = modes[0];
  }

  await saveModes();
  updateModeUI();
  showWordList();
  // 不显示删除状态提示
}

// 保存单词功能
async function saveWord() {
  let word = "";
  try {
    word = await window.electronAPI.clipboard.readText();
  } catch (e) {
    showStatus("无法读取剪贴板");
    return;
  }

  if (!word.trim()) {
    showStatus("剪贴板为空");
    return;
  }

  word = word.trim();

  if (!currentMode) return;

  if (!currentMode.words.includes(word)) {
    currentMode.words.push(word);

    // 更新模式数据
    const modeIndex = modes.findIndex((mode) => mode.id === currentMode?.id);
    if (modeIndex !== -1) {
      modes[modeIndex] = currentMode;
    }

    await saveModes();
    showStatus("已保存：" + word);
    showWordList();
  } else {
    showStatus("单词已存在");
  }
}

function showStatus(message) {
  const statusEl = document.getElementById("save-status");
  if (statusEl) {
    statusEl.innerText = message;
  }
}

// 复习功能
let reviewWords = [];
let currentReview = "";

function startReview() {
  if (!currentMode) return;

  reviewWords = [...currentMode.words];
  const reviewAreaEl = document.getElementById("review-area");
  if (reviewWords.length === 0) {
    if (reviewAreaEl) reviewAreaEl.style.display = "none";
    alert("当前模式下暂无单词可复习");
    return;
  }
  if (reviewAreaEl) reviewAreaEl.style.display = "";
  showRandomReviewWord();
}

function showRandomReviewWord() {
  const reviewAreaEl = document.getElementById("review-area");
  const reviewWordEl = document.getElementById("review-word");
  if (reviewWords.length === 0) {
    if (reviewAreaEl) reviewAreaEl.style.display = "none";
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

  // 从当前模式的单词列表中移除
  currentMode.words = currentMode.words.filter((w) => w !== currentReview);

  // 更新模式数据
  const modeIndex = modes.findIndex((mode) => mode.id === currentMode?.id);
  if (modeIndex !== -1) {
    modes[modeIndex] = currentMode;
  }

  await saveModes();
  const reviewWordEl = document.getElementById("review-word");
  if (reviewWordEl) reviewWordEl.innerText = "已移除：" + currentReview;
  setTimeout(() => {
    showRandomReviewWord();
    showWordList();
  }, 800);
}

// 单词列表管理
const wordListDiv = document.getElementById("word-list");

function toggleWordList() {
  if (!wordListDiv) return;

  if (wordListDiv.style.display === "none") {
    showWordList();
    wordListDiv.style.display = "";
  } else {
    wordListDiv.style.display = "none";
  }
}

async function clearAllWords() {
  if (!currentMode) return;

  if (confirm(`确定要清空当前模式"${currentMode.name}"下的所有单词吗？`)) {
    currentMode.words = [];

    // 更新模式数据
    const modeIndex = modes.findIndex((mode) => mode.id === currentMode?.id);
    if (modeIndex !== -1) {
      modes[modeIndex] = currentMode;
    }

    await saveModes();
    showWordList();
    showStatus("已清空当前模式的所有单词");
  }
}

function showWordList() {
  if (!wordListDiv || !currentMode) return;

  const words = currentMode.words;
  if (words.length === 0) {
    wordListDiv.innerHTML = `<div style="color:#888;">当前模式"${currentMode.name}"下暂无单词</div>`;
    return;
  }

  wordListDiv.innerHTML = "";
  words.forEach((word) => {
    const item = document.createElement("div");
    item.className = "word-item";
    item.innerHTML = `
      <span class="word-text" data-word="${word}">${word}</span>
      <button class="delete-btn" data-word="${word}">删除</button>
    `;
    wordListDiv.appendChild(item);
  });

  // 绑定单词文本点击编辑事件
  Array.from(document.getElementsByClassName("word-text")).forEach((wordSpan) => {
    wordSpan.addEventListener("click", (e) => {
      const target = e.target;
      const originalWord = target.getAttribute("data-word");
      const currentText = target.textContent || "";
      const wordItem = target.closest(".word-item");
      const deleteBtn = wordItem?.querySelector(".delete-btn");

      if (!originalWord || !wordItem || !deleteBtn) return;

      // 创建多行文本框替换文本
      const textarea = document.createElement("textarea");
      textarea.value = currentText;
      textarea.className = "edit-textarea-inline";

      // 自动调整高度以适应内容
      textarea.style.height = "auto";
      textarea.style.minHeight = "20px";

      // 隐藏原文本和删除按钮
      target.style.display = "none";
      deleteBtn.style.display = "none";

      // 插入文本框
      wordItem.insertBefore(textarea, target);
      textarea.focus();
      textarea.select();

      // 自动调整高度函数
      const adjustHeight = () => {
        textarea.style.height = "auto";
        textarea.style.height = textarea.scrollHeight + "px";
      };

      // 初始调整高度
      setTimeout(adjustHeight, 0);

      // 输入时自动调整高度
      textarea.addEventListener("input", adjustHeight);

      // 保存编辑
      const saveEdit = async () => {
        const newWord = textarea.value.trim();
        if (!newWord) {
          alert("单词不能为空");
          textarea.focus();
          return;
        }

        if (!currentMode) return;

        const words = currentMode.words;
        const index = words.indexOf(originalWord);
        if (index !== -1) {
          // 检查新单词是否已存在（除了当前单词）
          if (newWord !== originalWord && words.includes(newWord)) {
            alert("该单词已存在");
            textarea.focus();
            return;
          }
          words[index] = newWord;

          // 更新模式数据
          const modeIndex = modes.findIndex((mode) => mode.id === currentMode?.id);
          if (modeIndex !== -1 && currentMode) {
            modes[modeIndex] = currentMode;
          }

          await saveModes();
          showWordList();
          showStatus("已更新：" + newWord);
        }
      };

      // 取消编辑
      const cancelEdit = () => {
        target.style.display = "";
        deleteBtn.style.display = "";
        textarea.remove();
      };

      // 失去焦点时保存
      textarea.addEventListener("blur", saveEdit);

      // Ctrl+Enter保存，ESC取消
      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.ctrlKey) {
          e.preventDefault();
          saveEdit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelEdit();
        }
      });
    });
  });

  // 绑定删除事件
  Array.from(document.getElementsByClassName("delete-btn")).forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const target = e.target;
      const w = target.getAttribute("data-word");
      if (!w || !currentMode) return;

      // 直接删除，不需要确认
      currentMode.words = currentMode.words.filter((x) => x !== w);

      // 更新模式数据
      const modeIndex = modes.findIndex((mode) => mode.id === currentMode?.id);
      if (modeIndex !== -1 && currentMode) {
        modes[modeIndex] = currentMode;
      }

      await saveModes();
      showWordList();
      // 不显示删除状态提示
    });
  });
}

// 导出TXT（使用原生 Blob 下载方式）
async function exportTXT() {
  if (!currentMode) return;

  const words = currentMode.words;
  if (words.length === 0) {
    alert(`当前模式"${currentMode.name}"下暂无单词可导出`);
    return;
  }

  const txt = words.join("\n");
  const filename = `${currentMode.name}_words.txt`;

  // 创建 Blob 并下载
  const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showStatus(`已导出模式"${currentMode.name}"的单词到 ${filename}`);
}

// 导入TXT功能
const importArea = document.getElementById("import-area");
const importText = document.getElementById("import-text");

function toggleImportArea() {
  if (!importArea) return;

  if (importArea.style.display === "none") {
    importArea.style.display = "";
    if (importText) importText.focus();
  } else {
    importArea.style.display = "none";
  }
}

function cancelImport() {
  if (importArea) importArea.style.display = "none";
  if (importText) importText.value = "";
}

// 粘贴并导入
async function pasteAndImport() {
  try {
    // 自动获取剪贴板内容
    const clipboardText = await window.electronAPI.clipboard.readText();
    if (clipboardText && importText) {
      importText.value = clipboardText;
    }

    const text = importText?.value.trim() || "";
    if (!text) {
      alert("请先粘贴或输入单词列表");
      return;
    }

    await importWords(text);
  } catch (e) {
    // 如果无法自动读取剪贴板，使用文本框内容
    const text = importText?.value.trim() || "";
    if (!text) {
      alert("请在文本框中粘贴单词列表");
      return;
    }
    await importWords(text);
  }
}

// 文件导入
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

// 导入单词核心逻辑
async function importWords(text) {
  if (!currentMode) return;

  // 解析文本，每行一个单词
  const newWords = text
    .split("\n")
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

  if (newWords.length === 0) {
    alert("没有找到有效的单词");
    return;
  }

  const existingWords = currentMode.words;
  const wordsToAdd = newWords.filter((word) => !existingWords.includes(word));
  const duplicateCount = newWords.length - wordsToAdd.length;

  if (wordsToAdd.length === 0) {
    alert("所有单词都已存在于当前模式中");
    return;
  }

  // 添加到当前模式
  currentMode.words = [...existingWords, ...wordsToAdd];

  // 更新模式数据
  const modeIndex = modes.findIndex((mode) => mode.id === currentMode?.id);
  if (modeIndex !== -1 && currentMode) {
    modes[modeIndex] = currentMode;
  }

  await saveModes();

  let message = `成功导入 ${wordsToAdd.length} 个新单词到模式"${currentMode.name}"`;
  if (duplicateCount > 0) {
    message += `，跳过 ${duplicateCount} 个重复单词`;
  }
  alert(message);

  // 清空文本框并隐藏导入区域
  if (importText) importText.value = "";
  if (importArea) importArea.style.display = "none";

  // 刷新单词列表显示
  showWordList();

  // 更新状态提示
  showStatus(message);
}
