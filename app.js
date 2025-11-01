// app.js - 多模式内容记录器（Electron版本 - 三栏布局，使用 IndexedDB）

import { 
  getAllModes, 
  getMode, 
  saveMode as saveM, 
  updateMode, 
  deleteMode as deleteModeFromDB,
  getWordsByMode, 
  saveWord as saveW, 
  deleteWord, 
  clearAllWords as clearWords 
} from './src/db.js';
import { autoCheckAndMigrate } from './src/migrate.js';

// 全局变量
let modes = [];
let currentMode = null;
let currentModeId = null;
let isAddingMode = false;
let editingModeId = null;
let searchQuery = "";
let filteredWords = [];
let selectedItemIndex = -1;
let isAllHistoryMode = false; // 是否在全局历史记录模式
let editingItemIndex = -1; // 正在编辑的列表项索引
let originalItemText = ""; // 列表项编辑前的原始文本
let __dragActive = false; // 当前是否处于拖拽中（调试用）

// HTML -> 纯文本（用于搜索、标题、复制）
function htmlToPlain(html) {
  if (!html) return "";
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').trim();
}

// 初始化
document.addEventListener("DOMContentLoaded", async () => {
  // 检查并自动迁移数据
  const needsMigration = await autoCheckAndMigrate();
  if (needsMigration) {
    console.log('等待数据迁移完成...');
    return; // 迁移完成后会自动刷新页面
  }
  
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
    if (typeof dndLog === 'function') {
      try { dndLog('[window] focus', { dragActive: __dragActive, activeEl: document.activeElement && document.activeElement.tagName }); } catch (_) {}
    }
    await loadModes();
    await showClipboard();
    updateHistoryList();
    // 焦点回到搜索框
    setTimeout(() => {
      document.getElementById("search-input")?.focus();
    }, 50);
  });
  window.addEventListener('blur', () => {
    if (typeof dndLog === 'function') {
      try { dndLog('[window] blur', { dragActive: __dragActive }); } catch (_) {}
    }
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
    // 处理文本（可能是 Markdown 内嵌图片或 dataURL 图片）
    const text = await window.electronAPI.clipboard.readText();
    // Markdown: ![alt](data:image/...;base64,....)
    let dataUrl = null;
    const mdMatch = text && text.match(/!\[[^\]]*\]\((data:image\/(?:png|jpe?g|gif|webp);base64,[^)]+)\)/i);
    if (mdMatch && mdMatch[1]) {
      dataUrl = mdMatch[1];
    }
    // 纯 dataURL 文本
    if (!dataUrl && text && /^data:image\/(png|jpeg|jpg|gif|webp);base64,.+/i.test(text)) {
      dataUrl = text;
    }
    // 如果检测到图片 dataURL，转存并作为图片处理
    if (dataUrl) {
      const imageData = await window.electronAPI.clipboard.saveDataURL(dataUrl);
      if (imageData && imageData.dataURL) {
        currentClipboardData = imageData;
        clipboardWordEl.innerHTML = `
          <div style=\"display: flex; align-items: center; gap: 8px;\">
            <img src=\"${imageData.dataURL}\" style=\"max-width: 40px; max-height: 40px; border-radius: 4px;\" />
            <span>图片 (${imageData.width}x${imageData.height})</span>
          </div>
        `;
        console.log('已将 dataURL 转为图片并展示');
        return;
      }
    }

    // 纯文本处理
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
  try {
    // 从 IndexedDB 加载所有模式
    modes = await getAllModes();
    
    if (modes.length === 0) {
      console.warn('没有找到模式');
      return;
    }
    
    // 获取当前模式 ID
    currentModeId = await window.electronAPI.store.get('currentModeId');
    
    if (!currentModeId || !modes.find(m => m.id === currentModeId)) {
      // 如果没有或无效，使用第一个模式
      currentModeId = modes[0].id;
      await window.electronAPI.store.set('currentModeId', currentModeId);
    }
    
    // 加载当前模式（包含单词列表）
    currentMode = await getMode(currentModeId);
    if (currentMode) {
      // 加载该模式的单词列表
      currentMode.words = await getWordsByMode(currentModeId);
    }
    
    updateModeSidebar();
  } catch (error) {
    console.error('加载模式失败:', error);
  }
}

async function saveModes() {
  // IndexedDB 会自动保存，这里主要是通知其他窗口
  if (currentMode && currentModeId) {
    await window.electronAPI.store.set('currentModeId', currentModeId);
  }
  
  // 通知笔记窗口模式已更新
  if (window.electron && window.electron.ipcRenderer) {
    window.electron.ipcRenderer.send('modes-updated', {
      modes: modes,
      currentMode: currentMode
    });
  }
}

function updateModeSidebar() {
  const sidebar = document.getElementById("modes-sidebar");
  const allHistoryBtn = document.getElementById("all-history-btn");
  if (!sidebar) return;

  sidebar.innerHTML = "";
  if (DEBUG_DND) {
    const cs = getComputedStyle(sidebar);
    dndLog('sidebar ready', { 
      overflowY: cs.overflowY, 
      position: cs.position, 
      zIndex: cs.zIndex 
    });
  }
  
  // 更新全局历史按钮状态
  if (allHistoryBtn) {
    if (isAllHistoryMode) {
      allHistoryBtn.classList.add("active");
    } else {
      allHistoryBtn.classList.remove("active");
    }
  }

  modes.forEach((mode, index) => {
    const modeItem = document.createElement("button");
    modeItem.className = `sidebar-item ${!isAllHistoryMode && mode.id === currentMode?.id ? "active" : ""}`;
    modeItem.textContent = mode.name;
    modeItem.setAttribute("data-mode-id", mode.id);
    modeItem.setAttribute("data-mode-index", index);
    
    // 不使用原生 DnD
    // modeItem.setAttribute("draggable", "true");
    if (DEBUG_DND) dndLog('attach item', { id: mode.id, name: mode.name, draggable: false });
    
    // 左键点击切换模式（拖拽完成后的 click 将被抑制）
    modeItem.addEventListener("click", (e) => {
      if (modeItem.querySelector('input')) return; // 编辑中不切换
      if (__mouseDrag && (__mouseDrag.active || __mouseDrag.justDropped)) {
        __mouseDrag.justDropped = false; // 吃掉拖拽后的 click
        e.preventDefault();
        e.stopPropagation();
        return;
      }
        switchToMode(mode);
    });

    // 右键点击显示菜单（仅当模式数量大于1时）
    if (modes.length > 1) {
      modeItem.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        showContextMenu(e, mode);
      });
    }

    // 自定义鼠标拖拽采用容器委托（避免个别按钮未绑定时只能拖当前选中项）

    sidebar.appendChild(modeItem);
  });
  if (DEBUG_DND) dndLog('sidebar items attached', { count: modes.length });
  bindSidebarMouseDnDDelegation();
}

// 拖拽相关变量
let __dragModeId = null; // 仅旧的 HTML5 DnD 逻辑使用（保留以防回退）
let __dragGhostEl = null; // 仅旧的 HTML5 DnD 逻辑使用
let HIDE_NATIVE_DRAG_IMAGE = true; // 运行时调试
let DEBUG_DND = true; // 运行时调试
let __mouseDrag = { active: false, modeId: null, ghostEl: null, startX: 0, startY: 0, offsetX: 0, offsetY: 0, _targetId: null, _before: false, justDropped: false };

function dndLog(...args) {
  if (DEBUG_DND) console.log('[DND]', ...args);
}

function handleDragStart(e) {
  // 如果正在编辑，禁止拖拽
  const button = e.currentTarget || e.target;
  if (button.querySelector('input')) {
    e.preventDefault();
    return;
  }
  
  __dragModeId = button.getAttribute("data-mode-id");
  button.classList.add('dragging');
  __dragActive = true;
  try {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', __dragModeId);
    // 在 macOS/Electron 环境下，系统 dragImage 可能显示在窗口后面。
    // 这里改为“隐藏”预览，完全不显示系统幽灵，避免视觉混淆。
    if (HIDE_NATIVE_DRAG_IMAGE) {
      const cv = document.createElement('canvas');
      cv.width = 1;
      cv.height = 1;
      cv.style.position = 'absolute';
      cv.style.top = '-10000px';
      cv.style.left = '-10000px';
      document.body.appendChild(cv);
      __dragGhostEl = cv;
      try { e.dataTransfer.setDragImage(cv, 0, 0); } catch (_) {}
    }
    const rect = button.getBoundingClientRect();
    dndLog('dragstart', {
      modeId: __dragModeId,
      hideNative: HIDE_NATIVE_DRAG_IMAGE,
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
    });
  } catch (_) {}
}

function handleDragEnd(e) {
  __dragModeId = null;
  const button = e.currentTarget || e.target;
  button.classList.remove('dragging');
  clearInsertClasses();
  __dragActive = false;
  dndLog('dragend', { modeId: __dragModeId });
  // 清理自定义 drag 预览
  if (__dragGhostEl && __dragGhostEl.parentNode) {
    __dragGhostEl.parentNode.removeChild(__dragGhostEl);
  }
  __dragGhostEl = null;
}

function handleDragOver(e) {
  const button = e.currentTarget || e.target;
  const modeId = button.getAttribute("data-mode-id");
  if (!__dragModeId || __dragModeId === modeId) return;
  
  e.preventDefault();
  const rect = button.getBoundingClientRect();
  const before = (e.clientY - rect.top) < rect.height / 2;
  
  button.classList.toggle('insert-before', before);
  button.classList.toggle('insert-after', !before);
  
  try { 
    e.dataTransfer.dropEffect = 'move'; 
  } catch (_) {}

  // 仅在状态变化时打印，避免刷屏
  if (button.__lastBefore !== before) {
    dndLog('dragover', { targetModeId: modeId, before, clientY: e.clientY, rectTop: rect.top, rectH: rect.height });
    button.__lastBefore = before;
  }
}

function handleDragLeave(e) {
  const button = e.currentTarget || e.target;
  button.classList.remove('insert-before', 'insert-after');
  if (button.__lastBefore !== undefined) {
    dndLog('dragleave', { targetModeId: button.getAttribute('data-mode-id') });
    delete button.__lastBefore;
  }
}

function handleDrop(e) {
  const button = e.currentTarget || e.target;
  const targetModeId = button.getAttribute("data-mode-id");
  if (!__dragModeId || __dragModeId === targetModeId) return;
  
  e.preventDefault();
  const rect = button.getBoundingClientRect();
  const before = (e.clientY - rect.top) < rect.height / 2;
  
  const fromIdx = modes.findIndex(m => m.id === __dragModeId);
  const toIdxBase = modes.findIndex(m => m.id === targetModeId);
  
  if (fromIdx === -1 || toIdxBase === -1) return;
  
  let insertIdx = before ? toIdxBase : toIdxBase + 1;
  // 调整因移除后的索引偏移
  if (fromIdx < insertIdx) insertIdx -= 1;
  
  dndLog('drop', { fromIdx, toIdxBase, insertIdx, before, dragModeId: __dragModeId, targetModeId });
  moveModeToIndex(__dragModeId, insertIdx);
  __dragModeId = null;
  clearInsertClasses();
  __dragActive = false;
  // 清理自定义 drag 预览
  if (__dragGhostEl && __dragGhostEl.parentNode) {
    __dragGhostEl.parentNode.removeChild(__dragGhostEl);
  }
  __dragGhostEl = null;
}

// ==================== 自定义鼠标拖拽（替代原生 HTML5 DnD） ====================
let __sidebarDnDBound = false;
function bindSidebarMouseDnDDelegation() {
  if (__sidebarDnDBound) return;
  const sb = document.getElementById('modes-sidebar');
  if (!sb) return;
  sb.addEventListener('mousedown', (ev) => {
    const btn = ev.target && ev.target.closest && ev.target.closest('#modes-sidebar .sidebar-item');
    if (!btn) return;
    const id = btn.getAttribute('data-mode-id');
    startModeMouseDrag(ev, btn, id);
  }, true); // 捕获，尽量早拦截
  __sidebarDnDBound = true;
}

function startModeMouseDrag(ev, button, modeId) {
  if (ev.button !== 0) return; // 仅左键
  if (button.querySelector('input')) return; // 编辑中禁止
  ev.preventDefault(); // 避免立即触发焦点/选中
  const rect0 = button.getBoundingClientRect();
  __mouseDrag = { active: false, modeId, ghostEl: null, startX: ev.clientX, startY: ev.clientY, offsetX: ev.clientX - rect0.left, offsetY: ev.clientY - rect0.top, _targetId: null, _before: false, justDropped: false };
  const moveThreshold = 3;

  const begin = (e) => {
    if (__mouseDrag.active) return;
    __mouseDrag.active = true;
    document.body.classList.add('no-select');
    const rect = button.getBoundingClientRect();
    const ghost = button.cloneNode(true);
    ghost.style.position = 'fixed';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    ghost.style.width = rect.width + 'px';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '10000';
    ghost.classList.add('dragging');
    document.body.appendChild(ghost);
    __mouseDrag.ghostEl = ghost;
    dndLog('mouseDrag begin', { modeId });
  };

  const onMove = (e) => {
    if (!__mouseDrag.active) {
      const dx = Math.abs(e.clientX - __mouseDrag.startX);
      const dy = Math.abs(e.clientY - __mouseDrag.startY);
      if (dx < moveThreshold && dy < moveThreshold) return;
      begin(e);
    }
    const g = __mouseDrag.ghostEl;
    if (g) {
      g.style.left = (e.clientX - __mouseDrag.offsetX) + 'px';
      g.style.top = (e.clientY - __mouseDrag.offsetY) + 'px';
    }
    const sb = document.getElementById('modes-sidebar');
    if (!sb) return;
    const sbRect = sb.getBoundingClientRect();
    const margin = 20, speed = 10;
    if (e.clientY < sbRect.top + margin) sb.scrollTop -= speed;
    else if (e.clientY > sbRect.bottom - margin) sb.scrollTop += speed;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    let targetBtn = el && el.closest && el.closest('#modes-sidebar .sidebar-item');
    clearInsertClasses();
    if (targetBtn) {
      const rect = targetBtn.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      targetBtn.classList.toggle('insert-before', before);
      targetBtn.classList.toggle('insert-after', !before);
      __mouseDrag._targetId = targetBtn.getAttribute('data-mode-id');
      __mouseDrag._before = before;
      dndLog('mouseDrag over', { target: __mouseDrag._targetId, before });
    } else {
      __mouseDrag._targetId = null;
    }
  };

  const cleanup = () => {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('mouseup', onUp, true);
    document.body.classList.remove('no-select');
    if (__mouseDrag.ghostEl && __mouseDrag.ghostEl.parentNode) {
      __mouseDrag.ghostEl.parentNode.removeChild(__mouseDrag.ghostEl);
    }
  };

  const onUp = (e) => {
    if (__mouseDrag.active) {
      e.preventDefault();
      e.stopPropagation();
    }
    const wasActive = __mouseDrag.active;
    const dragId = __mouseDrag.modeId;
    const targetId = __mouseDrag._targetId;
    const before = __mouseDrag._before;
    cleanup();
    clearInsertClasses();
    __mouseDrag.active = false;
    if (!wasActive) return; // 只是点击，不是拖拽
    __mouseDrag.justDropped = true; // 抑制紧随其后的 click
    if (!dragId || !targetId || dragId === targetId) return;
    const fromIdx = modes.findIndex(m => m.id === dragId);
    const toIdxBase = modes.findIndex(m => m.id === targetId);
    if (fromIdx === -1 || toIdxBase === -1) return;
    let insertIdx = before ? toIdxBase : toIdxBase + 1;
    if (fromIdx < insertIdx) insertIdx -= 1;
    dndLog('mouseDrag drop', { dragId, targetId, insertIdx, before });
    moveModeToIndex(dragId, insertIdx);
  };

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('mouseup', onUp, true);
}
// 全局/容器级调试日志：帮助定位 dragover 是否到达页面
if (typeof window !== 'undefined') {
  // 运行时调试开关
  window.__dndDebug = window.__dndDebug || {};
  window.__dndDebug.setHideNative = (v) => { HIDE_NATIVE_DRAG_IMAGE = !!v; console.log('[DND] set HIDE_NATIVE_DRAG_IMAGE =', HIDE_NATIVE_DRAG_IMAGE); };
  window.__dndDebug.enableLogs = (v) => { DEBUG_DND = !!v; console.log('[DND] set DEBUG_DND =', DEBUG_DND); };
  // 全局允许拖放（通过在 document 上 preventDefault）
  (function(){
    let enabled = false;
    const onDocDragOver = (e) => { e.preventDefault(); if (DEBUG_DND) dndLog('[doc] dragover(pd)', { x: e.clientX, y: e.clientY }); };
    const onDocDrop = (e) => { e.preventDefault(); if (DEBUG_DND) dndLog('[doc] drop(pd)', { x: e.clientX, y: e.clientY }); };
    window.__dndDebug.enableGlobalAllowDrop = (v) => {
      const want = !!v;
      if (want === enabled) { console.log('[DND] globalAllowDrop already', enabled); return; }
      enabled = want;
      if (enabled) {
        document.addEventListener('dragover', onDocDragOver);
        document.addEventListener('drop', onDocDrop);
        console.log('[DND] globalAllowDrop = true');
      } else {
        document.removeEventListener('dragover', onDocDragOver);
        document.removeEventListener('drop', onDocDrop);
        console.log('[DND] globalAllowDrop = false');
      }
    };
  })();

  // 文档级（捕获）
  document.addEventListener('dragstart', (e) => {
    if (DEBUG_DND) dndLog('[doc] dragstart', { tag: e.target && e.target.tagName, x: e.clientX, y: e.clientY });
  }, true);
  // 节流后的 drag 事件（源元素持续触发），帮助判断拖拽是否真的在进行
  let lastDragTs = 0;
  document.addEventListener('drag', (e) => {
    const now = Date.now();
    if (!DEBUG_DND) return;
    if (now - lastDragTs > 100) {
      dndLog('[doc] drag', { x: e.clientX, y: e.clientY, tag: e.target && e.target.tagName });
      lastDragTs = now;
    }
  }, true);
  document.addEventListener('dragover', (e) => {
    if (DEBUG_DND) dndLog('[doc] dragover', { tag: e.target && e.target.tagName, x: e.clientX, y: e.clientY, defaultPrevented: e.defaultPrevented });
  }, true);
  document.addEventListener('drop', (e) => {
    if (DEBUG_DND) dndLog('[doc] drop', { tag: e.target && e.target.tagName, x: e.clientX, y: e.clientY });
  }, true);
  document.addEventListener('dragend', (e) => {
    if (DEBUG_DND) dndLog('[doc] dragend', {});
  }, true);

  // 侧边栏容器级（捕获）
  const bindSidebarDnDLogs = () => {
    const sb = document.getElementById('modes-sidebar');
    if (!sb) return;
    sb.addEventListener('dragenter', (e) => {
      if (DEBUG_DND) dndLog('[sidebar] dragenter', { tag: e.target && e.target.tagName });
    }, true);
    sb.addEventListener('dragover', (e) => {
      if (DEBUG_DND) dndLog('[sidebar] dragover', { tag: e.target && e.target.tagName });
    }, true);
    sb.addEventListener('dragleave', (e) => {
      if (DEBUG_DND) dndLog('[sidebar] dragleave', { tag: e.target && e.target.tagName });
    }, true);
    sb.addEventListener('drop', (e) => {
      if (DEBUG_DND) dndLog('[sidebar] drop', { tag: e.target && e.target.tagName });
    }, true);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindSidebarDnDLogs);
  } else {
    bindSidebarDnDLogs();
  }

  // 全局抑制拖拽后的 click 冒泡一次，防止误切换
  document.addEventListener('click', (e) => {
    if (__mouseDrag && __mouseDrag.justDropped) {
      e.preventDefault();
      e.stopPropagation();
      __mouseDrag.justDropped = false;
      dndLog('suppress click after drop');
    }
  }, true);
}

// DnD 辅助函数
function clearInsertClasses() {
  const sidebar = document.getElementById("modes-sidebar");
  if (sidebar) {
    sidebar.querySelectorAll('button.insert-before, button.insert-after')
      .forEach((b) => { 
        b.classList.remove('insert-before', 'insert-after'); 
      });
  }
}

async function moveModeToIndex(modeId, targetIdx) {
  const currentOrder = modes.slice();
  const fromIdx = currentOrder.findIndex(m => m.id === modeId);
  
  if (fromIdx === -1) return;
  
  // 移除当前位置的模式
  const [movedMode] = currentOrder.splice(fromIdx, 1);
  
  // 插入到目标位置
  if (targetIdx < 0) targetIdx = 0;
  if (targetIdx > currentOrder.length) targetIdx = currentOrder.length;
  currentOrder.splice(targetIdx, 0, movedMode);
  
  // 更新全局 modes
  modes = currentOrder;
  
  // 保存并重新渲染
  await saveModes();
  updateModeSidebar();
  showStatus("模式顺序已更新");
}

// 右键菜单相关代码
let contextMenu = null;

function createContextMenu() {
  if (contextMenu) return contextMenu;
  
  contextMenu = document.createElement("div");
  contextMenu.className = "context-menu";
  contextMenu.innerHTML = `
    <div class="context-menu-item" data-action="edit">
      <span class="context-menu-icon">✏️</span>
      <span>编辑</span>
    </div>
    <div class="context-menu-item danger" data-action="delete">
      <span class="context-menu-icon">🗑️</span>
      <span>删除</span>
    </div>
  `;
  document.body.appendChild(contextMenu);
  
  // 点击菜单外部关闭
  document.addEventListener("click", () => {
    hideContextMenu();
  });
  
  return contextMenu;
}

function showContextMenu(e, mode) {
  const menu = createContextMenu();
  
  // 移除之前的事件监听器
  const items = menu.querySelectorAll(".context-menu-item");
  items.forEach(item => {
    const newItem = item.cloneNode(true);
    item.parentNode.replaceChild(newItem, item);
  });
  
  // 添加新的事件监听器
  menu.querySelectorAll(".context-menu-item").forEach(item => {
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      const action = item.getAttribute("data-action");
      
        if (action === "edit") {
      editMode(mode);
        } else if (action === "delete") {
      deleteMode(mode);
        }
      
      hideContextMenu();
      });
    });

  // 定位菜单
  menu.style.left = e.pageX + "px";
  menu.style.top = e.pageY + "px";
  menu.classList.add("show");
  
  // 确保菜单不会超出窗口
  setTimeout(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = (window.innerWidth - rect.width - 10) + "px";
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = (window.innerHeight - rect.height - 10) + "px";
    }
  }, 0);
}

function hideContextMenu() {
  if (contextMenu) {
    contextMenu.classList.remove("show");
  }
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
  
  // 通知笔记窗口切换模式
  if (window.electron && window.electron.ipcRenderer) {
    window.electron.ipcRenderer.send('mode-switched', {
      mode: currentMode
    });
  }
  
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
  // 直接在侧边栏项上进行内联编辑
  const modeItem = document.querySelector(`[data-mode-id="${mode.id}"]`);
  if (!modeItem) return;
  
  // 如果已经在编辑，不重复创建
  if (modeItem.querySelector('input')) return;
  
  const originalName = mode.name;
  
  // 创建输入框
  const input = document.createElement('input');
  input.type = 'text';
  input.value = mode.name;
  input.className = 'mode-edit-input';
  input.setAttribute('data-original-name', originalName);
  
  // 替换文本内容
  modeItem.textContent = '';
  modeItem.appendChild(input);
  
  // 聚焦并选中文本
  input.focus();
  input.select();
  
  // 保存函数
  const saveModeEdit = async () => {
    const newName = input.value.trim();
    
    // 如果名称没有改变，直接恢复
    if (newName === originalName) {
      modeItem.textContent = originalName;
      return;
    }
    
    // 检查是否为空
    if (!newName) {
      showStatus("模式名称不能为空");
      modeItem.textContent = originalName;
      return;
    }
    
    // 检查是否重名
    const isDuplicate = modes.some((m) => m.id !== mode.id && m.name === newName);
    if (isDuplicate) {
      showStatus("模式名称已存在");
      modeItem.textContent = originalName;
      return;
    }
    
    // 更新模式名称
    const modeIndex = modes.findIndex((m) => m.id === mode.id);
    if (modeIndex !== -1) {
      modes[modeIndex].name = newName;
      if (currentMode && currentMode.id === mode.id) {
        currentMode.name = newName;
      }
      await saveModes();
      updateModeSidebar();
      updateHistoryList();
      showStatus(`已更新模式名称：${newName}`);
    }
  };
  
  // 取消编辑函数
  const cancelModeEdit = () => {
    modeItem.textContent = originalName;
  };
  
  // 键盘事件
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      saveModeEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelModeEdit();
    }
  });
  
  // 失去焦点时保存
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (modeItem.querySelector('input')) {
        saveModeEdit();
      }
    }, 100);
  });
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
    showStatus("至少需要保留一个模式");
    return;
  }

  if (!confirm(`确定要删除模式"${mode.name}"吗？所有内容将被删除`)) {
    return;
  }

  // 从数据库删除模式
  await deleteModeFromDB(mode.id);
  
  // 更新本地数组
  modes = modes.filter((m) => m.id !== mode.id);

  // 如果删除的是当前模式，切换到第一个模式
  if (currentMode && currentMode.id === mode.id) {
    isAllHistoryMode = false;
    currentMode = modes[0];
    currentModeId = currentMode.id;
  }

  updateModeSidebar();
  selectedItemIndex = -1;
  updateHistoryList();
  updatePreview();
  showStatus(`已删除模式"${mode.name}"`);
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
  // 对于删除快捷键，阻止默认行为但让事件冒泡到全局监听器
  if ((e.metaKey || e.ctrlKey) && (e.key === "Backspace" || e.key === "Delete")) {
    e.preventDefault(); // 阻止删除搜索框文本
    // 不调用 stopPropagation()，让事件继续冒泡
    return;
  }
  
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
        if (typeof word === 'object' && word.type === 'rich') {
          return htmlToPlain(word.html).toLowerCase().includes(searchQuery.toLowerCase());
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
  } else if (normalized.type === 'rich') {
    const firstImg = /<img[^>]+src=["']([^"']+)["']/i.exec(normalized.html || '');
    const title = htmlToPlain(normalized.html).slice(0, 20) || '笔记';
    const thumb = firstImg ? `<img src="${firstImg[1]}" style=\"width: 32px; height: 32px; object-fit: cover; border-radius: 4px; flex-shrink: 0;\"/>` : '';
    contentDiv.innerHTML = `
      <div style=\"display: flex; align-items: center; gap: 8px;\">${thumb}
        <span class=\"history-item-text\" style=\"font-size: 12px;\">${escapeHtml(title)}</span>
      </div>
    `;
    item.setAttribute("data-word", '[rich]');
  } else {
    // 显示文本
    const isDataUrlImg = typeof normalized.content === 'string' && /^data:image\/(png|jpeg|jpg|gif|webp);base64,.+/i.test(normalized.content);
    if (isDataUrlImg) {
      contentDiv.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <img src="${normalized.content}" 
               style="width: 32px; height: 32px; object-fit: cover; border-radius: 4px; flex-shrink: 0;" />
          <span class="history-item-text" style="font-size: 12px; color: #666;">内嵌图片</span>
        </div>
      `;
    } else {
      const textDiv = document.createElement("div");
      textDiv.className = "history-item-text";
      textDiv.textContent = normalized.content;
      contentDiv.appendChild(textDiv);
    }
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
    if (normalized.type !== 'text') return; // 仅文本支持编辑
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
  } else if (normalized.type === 'rich') {
    // 显示富文本笔记（与笔记窗口一致）
    previewContent.innerHTML = `
      <div class="preview-rich-editor" 
           contenteditable="true" 
           style="padding: 20px; line-height: 1.6; min-height: 100%; outline: none; font-size: 14px; color: #333; overflow-y: auto;"
           data-placeholder="在此编辑笔记内容...">
        ${normalized.html || ''}
      </div>
    `;
    
    // 设置富文本编辑器事件监听
    const richEditor = document.querySelector('.preview-rich-editor');
    if (richEditor) {
      // 存储原始内容用于比较
      richEditor.setAttribute('data-original', normalized.html || '');
      
      // 处理占位符
      const updatePlaceholder = () => {
        if (!richEditor.textContent.trim()) {
          richEditor.setAttribute('data-placeholder', '在此编辑笔记内容...');
        } else {
          richEditor.removeAttribute('data-placeholder');
        }
      };
      
      // 输入事件 - 自动保存
      let saveTimeout = null;
      richEditor.addEventListener('input', () => {
        updatePlaceholder();
        
        // 防抖自动保存
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          handleRichEditorSave(richEditor);
        }, 1000);
      });
      
      // 焦点事件
      richEditor.addEventListener('focus', updatePlaceholder);
      richEditor.addEventListener('blur', () => {
        updatePlaceholder();
        handleRichEditorSave(richEditor);
      });
      
      // 键盘事件
      richEditor.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          richEditor.blur();
          return;
        }
        // Tab 键插入空格
        if (e.key === 'Tab') {
          e.preventDefault();
          document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
          return;
        }
        // 移除 stopPropagation，让全局监听器正确识别 contentEditable 状态
      });
      
      // 图片粘贴支持
      richEditor.addEventListener('paste', async (e) => {
        const items = e.clipboardData.items;
        
        // 检查是否有图片
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            e.preventDefault();
            const file = items[i].getAsFile();
            await handleRichEditorImagePaste(richEditor, file);
            return;
          }
        }
        
        // 处理富文本
        if (e.clipboardData.types.includes('text/html')) {
          e.preventDefault();
          const html = e.clipboardData.getData('text/html');
          document.execCommand('insertHTML', false, html);
        }
      });
      
      // 图片点击放大
      richEditor.addEventListener('click', (e) => {
        if (e.target.tagName === 'IMG') {
          showImageModal(e.target.src);
        }
      });
      
      // 初始化占位符状态
      updatePlaceholder();
    }
  } else {
    const isDataUrlImg = typeof normalized.content === 'string' && /^data:image\/(png|jpeg|jpg|gif|webp);base64,.+/i.test(normalized.content);
    if (isDataUrlImg) {
      // 显示 dataURL 图片
      previewContent.innerHTML = `
        <div class="preview-image-container">
          <img src="${normalized.content}" 
               class="preview-image" 
               alt="图片预览"
               style="cursor: default;"/>
        </div>
      `;
      return;
    }
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
          return;
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
        // 移除 stopPropagation，让全局监听器正确识别 TEXTAREA 状态
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

// 处理富文本编辑器保存
async function handleRichEditorSave(richEditor) {
  if (isAllHistoryMode) {
    showStatus("全局历史记录模式下无法编辑");
    updatePreview();
    return;
  }
  
  if (!richEditor || !currentMode) return;
  
  const newHtml = richEditor.innerHTML;
  const originalHtml = richEditor.getAttribute('data-original');
  
  // 如果内容没有变化，不保存
  if (newHtml === originalHtml) {
    return;
  }
  
  // 检查内容是否为空（只有空白）
  const plainText = htmlToPlain(newHtml);
  if (!plainText.trim()) {
    showStatus("内容不能为空");
    updatePreview(); // 恢复原内容
    return;
  }

  const words = currentMode.words;
  const originalIndex = words.findIndex(w => {
    const normalized = (typeof w === 'string') ? { type: 'text', content: w } : w;
    return normalized.type === 'rich' && normalized.html === originalHtml;
  });
  
  if (originalIndex !== -1) {
    // 更新内容
    if (typeof words[originalIndex] === 'object' && words[originalIndex].type === 'rich') {
      words[originalIndex].html = newHtml;
    }

    const modeIndex = modes.findIndex((mode) => mode.id === currentMode?.id);
    if (modeIndex !== -1 && currentMode) {
      modes[modeIndex] = currentMode;
    }

    await saveModes();
    
    // 更新 filteredWords
    if (typeof filteredWords[selectedItemIndex] === 'object' && 
        filteredWords[selectedItemIndex].type === 'rich') {
      filteredWords[selectedItemIndex].html = newHtml;
    }
    
    // 更新 data-original 属性
    richEditor.setAttribute('data-original', newHtml);
    
    updateHistoryList();
    showStatus("笔记已自动保存");
  }
}

// 处理富文本编辑器中的图片粘贴
async function handleRichEditorImagePaste(richEditor, file) {
  try {
    const dataUrl = await compressImageForRichEditor(file);
    
    // 在编辑器中插入图片
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.margin = '10px 0';
    img.style.borderRadius = '4px';
    img.style.cursor = 'pointer';
    
    // 插入到光标位置
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      
      const br1 = document.createElement('br');
      const br2 = document.createElement('br');
      
      range.insertNode(br2);
      range.insertNode(img);
      range.insertNode(br1);
      
      range.setStartAfter(br2);
      range.setEndAfter(br2);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      richEditor.appendChild(document.createElement('br'));
      richEditor.appendChild(img);
      richEditor.appendChild(document.createElement('br'));
    }
    
    // 触发自动保存
    richEditor.dispatchEvent(new Event('input'));
    
    showStatus('图片已插入');
  } catch (error) {
    console.error('处理图片失败:', error);
    showStatus('图片处理失败');
  }
}

// 压缩图片（用于富文本编辑器）
function compressImageForRichEditor(file, maxWidth = 800, maxHeight = 800, quality = 0.8) {
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

// 显示图片放大模态框
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

window.copyToClipboardFromPreview = async function() {
  if (selectedItemIndex === -1 || selectedItemIndex >= filteredWords.length) return;
  
  const word = filteredWords[selectedItemIndex];
  const normalized = (typeof word === 'string') ? { type: 'text', content: word } : word;
  
  try {
    if (normalized.type === 'text') {
      const isDataUrlImg = typeof normalized.content === 'string' && /^data:image\/(png|jpeg|jpg|gif|webp);base64,.+/i.test(normalized.content);
      if (isDataUrlImg) {
        const img = await window.electronAPI.clipboard.saveDataURL(normalized.content);
        showStatus(img ? "图片已复制到剪贴板" : "复制失败");
      } else {
        await window.electronAPI.clipboard.writeText(normalized.content);
        showStatus("已复制到剪贴板");
      }
    } else if (normalized.type === 'rich') {
      const plain = htmlToPlain(normalized.html);
      await window.electronAPI.clipboard.writeText(plain);
      showStatus("已复制笔记文本到剪贴板");
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
    showStatus("在全局历史记录模式下无法删除");
    return;
  }
  
  const word = filteredWords[selectedItemIndex];
    await deleteContentItem(word);
  showStatus("已删除");
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

  // 用空行分隔每个项目（与导入格式一致）
  const txt = words.map(word => {
    // 如果是对象格式（包含type和content），提取内容
    if (typeof word === 'object' && word.content) {
      return word.content;
    }
    return word;
  }).join("\n\n");  // 用空行分隔
  
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

  // 按空行分隔内容（连续的换行符）
  // 先统一换行符格式，然后按两个或更多换行符分隔
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const newWords = normalizedText
    .split(/\n\s*\n+/)  // 按空行（一个或多个连续换行）分隔
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
  // 检查是否在可编辑元素中
  const isInEditableElement = e.target.isContentEditable || 
                               e.target.tagName === "TEXTAREA" ||
                               (e.target.tagName === "INPUT" && e.target.id !== "search-input");
  
  // 在可编辑元素中，只处理 Escape 键
  if (isInEditableElement) {
    if (e.key === "Escape") {
      e.target.blur();
    }
    return;
  }
  
  // Tab键切换模式
  if (e.key === "Tab") {
    e.preventDefault();
    switchToNextMode(e.shiftKey);
    return;
  }
  
  // 对于搜索框，只处理删除快捷键（已在 handleSearchKeyDown 中处理）
  // 其他快捷键不处理，让搜索框正常工作
  if (e.target.id === "search-input") {
    // 删除快捷键会从搜索框冒泡上来
    if ((e.metaKey || e.ctrlKey) && (e.key === "Backspace" || e.key === "Delete")) {
      if (selectedItemIndex !== -1 && selectedItemIndex < filteredWords.length) {
        e.preventDefault();
        window.deleteCurrentItem();
      }
      return;
    }
    // 其他键不处理，让搜索功能正常工作
    return;
  }
  
  // Cmd+Delete (Mac) 或 Ctrl+Delete (Windows/Linux) 删除选中项
  if ((e.metaKey || e.ctrlKey) && (e.key === "Backspace" || e.key === "Delete")) {
    if (selectedItemIndex !== -1 && selectedItemIndex < filteredWords.length) {
      e.preventDefault();
      window.deleteCurrentItem();
    }
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
    if (selectedItemIndex !== -1 && selectedItemIndex < filteredWords.length) {
      e.preventDefault();
      const word = filteredWords[selectedItemIndex];
      const normalized = (typeof word === 'string') ? { type: 'text', content: word } : word;
      
      if (normalized.type === 'text' && isURL(normalized.content)) {
        openURL(normalized.content);
      } else {
        showStatus('当前选中的内容不是链接');
      }
    }
  }
}

// Tab键切换模式
async function switchToNextMode(reverse = false) {
  if (modes.length === 0) return;
  
  // 如果在全局历史记录模式，切换到第一个模式
  if (isAllHistoryMode) {
    await switchToMode(modes[0]);
    return;
  }
  
  // 找到当前模式的索引
  const currentIndex = modes.findIndex(m => m.id === currentMode?.id);
  if (currentIndex === -1) {
    await switchToMode(modes[0]);
    return;
  }
  
  // 计算下一个模式的索引
  let nextIndex;
  if (reverse) {
    // Shift+Tab 向上切换
    nextIndex = currentIndex - 1;
    if (nextIndex < 0) {
      nextIndex = modes.length - 1;
    }
  } else {
    // Tab 向下切换
    nextIndex = currentIndex + 1;
    if (nextIndex >= modes.length) {
      nextIndex = 0;
    }
  }
  
  await switchToMode(modes[nextIndex]);
  showStatus(`已切换到模式：${modes[nextIndex].name}`);
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
