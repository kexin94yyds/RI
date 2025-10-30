const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, screen } = require('electron');
const Store = require('electron-store');
const path = require('path');

// 初始化存储
const store = new Store();

let mainWindow = null;
let lastShowAt = 0; // 记录最近一次显示时间，用于忽略刚显示时的 blur

// 在当前活动 Space/全屏上显示，并跟随鼠标所在显示器
async function showOnActiveSpace() {
  if (!mainWindow) return;
  
  // 获取鼠标当前位置和所在显示器
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const workArea = display.workArea; // { x, y, width, height }
  
  // 获取窗口尺寸
  const { width: winW, height: winH } = mainWindow.getBounds();
  
  // 计算窗口位置（在当前显示器中心偏上）
  const targetX = Math.round(workArea.x + (workArea.width - winW) / 2);
  const targetY = Math.round(workArea.y + (workArea.height - winH) / 3);
  mainWindow.setPosition(targetX, targetY);
  
  // 🔑 关键：临时在所有工作区可见（含全屏），避免跳回旧 Space
  try { 
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); 
  } catch (_) {}
  
  // 层级拉高到 screen-saver，确保覆盖全屏应用
  try { 
    mainWindow.setAlwaysOnTop(true, 'screen-saver'); 
  } catch (_) {}
  
  mainWindow.show();
  mainWindow.focus();
  lastShowAt = Date.now(); // 记录显示时间
  
  // 200ms后还原，仅在当前 Space 可见
  setTimeout(() => {
    try { 
      mainWindow.setVisibleOnAllWorkspaces(false); 
    } catch (_) {}
  }, 200);
}

// 创建主窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 680,
    show: false,
    frame: false, // 无边框
    resizable: true,
    transparent: true, // 启用透明
    alwaysOnTop: true,
    skipTaskbar: false,
    hasShadow: true, // 窗口阴影
    roundedCorners: true, // 圆角
    vibrancy: 'hud', // macOS 毛玻璃效果
    visualEffectState: 'active',
    backgroundColor: '#00000000', // 完全透明背景
    icon: path.join(__dirname, '单词.png'), // 应用图标
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      backgroundThrottling: false
    }
  });

  // 不额外设置层级，让窗口保持默认行为（显示时再动态调整）
  
  // 加载主界面
  mainWindow.loadFile('index.html');

  // 窗口关闭时隐藏
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // 失去焦点时隐藏窗口
  mainWindow.on('blur', () => {
    // 刚显示后的短暂失焦（切 Space/全屏/层级切换）容易导致瞬间隐藏，需忽略
    const elapsed = Date.now() - lastShowAt;
    if (elapsed < 800) return; // 显示后 800ms 内忽略 blur 事件
    
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFocused()) {
        mainWindow.hide();
      }
    }, 200);
  });

  // 开发模式打开开发者工具
  if (process.argv.includes('--enable-logging')) {
    mainWindow.webContents.openDevTools();
  }
}

// 快速保存（不显示窗口，只显示通知）
async function quickSave() {
  try {
    // 读取剪贴板内容
    const word = clipboard.readText();
    
    if (!word || word.trim() === '') {
      showNotification('保存失败', '剪贴板为空');
      return;
    }

    // 获取当前模式和单词列表
    const wordModes = store.get('wordModes') || [{ id: 'default', name: '默认', words: [] }];
    const currentWordMode = store.get('currentWordMode') || wordModes[0];
    
    // 查找当前模式的索引
    const modeIndex = wordModes.findIndex(m => m.id === currentWordMode.id);
    if (modeIndex === -1) {
      showNotification('保存失败', '未找到当前模式');
      return;
    }

    const mode = wordModes[modeIndex];
    
    // 检查是否已存在
    if (!mode.words.includes(word.trim())) {
      mode.words.push(word.trim());
      // 更新数组中的模式对象
      wordModes[modeIndex] = mode;
      // 保存到存储（同时更新当前模式，避免渲染进程读到旧的 currentWordMode）
      store.set('wordModes', wordModes);
      store.set('currentWordMode', mode);
      showNotification('已保存', `"${word.trim()}" 已保存到 ${mode.name}`);
    } else {
      showNotification('提示', `"${word.trim()}" 已存在`);
    }
  } catch (error) {
    console.error('快速保存失败:', error);
    showNotification('保存失败', '发生错误');
  }
}

// 显示系统通知
function showNotification(title, body) {
  const { Notification } = require('electron');
  
  if (Notification.isSupported()) {
    new Notification({
      title: title,
      body: body,
      silent: false
    }).show();
  }
}

// 应用准备就绪
app.whenReady().then(() => {
  // 设置 Dock 图标（macOS）
  if (process.platform === 'darwin') {
    const { nativeImage } = require('electron');
    const appIcon = nativeImage.createFromPath(path.join(__dirname, '单词.png'));
    app.dock.setIcon(appIcon);
  }
  
  createWindow();

  // 注册快捷键：Shift+Command+U - 呼出窗口
  const toggleShortcut = process.platform === 'darwin' ? 'Shift+Command+U' : 'Shift+Ctrl+U';
  const ret1 = globalShortcut.register(toggleShortcut, () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        showOnActiveSpace();
      }
    }
  });

  // 注册快捷键：Command+U - 快速保存（不显示窗口）
  const saveShortcut = process.platform === 'darwin' ? 'Command+U' : 'Ctrl+U';
  const ret2 = globalShortcut.register(saveShortcut, () => {
    quickSave();
  });

  if (!ret1 || !ret2) {
    console.error('快捷键注册失败');
  }

  console.log(`✓ 已注册快捷键:`);
  console.log(`  - ${toggleShortcut}: 呼出/隐藏窗口`);
  console.log(`  - ${saveShortcut}: 快速保存（不显示窗口）`);
});

// 所有窗口关闭时退出（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// macOS 重新激活时创建窗口
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 应用退出时注销快捷键
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// 退出应用前标记
app.on('before-quit', () => {
  app.isQuitting = true;
});

// IPC 处理：存储相关
ipcMain.handle('store-get', async (event, key) => {
  return store.get(key);
});

ipcMain.handle('store-set', async (event, key, value) => {
  store.set(key, value);
});

ipcMain.handle('store-delete', async (event, key) => {
  store.delete(key);
});

ipcMain.handle('store-clear', async () => {
  store.clear();
});

// IPC 处理：剪贴板相关
ipcMain.handle('clipboard-read', async () => {
  return clipboard.readText();
});

ipcMain.handle('clipboard-write', async (event, text) => {
  clipboard.writeText(text);
});

// IPC 处理：窗口控制
ipcMain.handle('window-show', async () => {
  if (mainWindow) {
    await showOnActiveSpace();
  }
});

ipcMain.handle('window-hide', async () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

ipcMain.handle('window-toggle', async () => {
  if (mainWindow) {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      await showOnActiveSpace();
    }
  }
});
