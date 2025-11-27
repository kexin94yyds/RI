const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, screen, nativeImage, shell, dialog } = require('electron');
const Store = require('electron-store');
const path = require('path');
const fs = require('fs');

// 使用默认数据目录，确保开发版本也能访问原有数据
// 数据存储在: ~/Library/Application Support/replace-information
// 如果需要使用独立开发数据目录，可以设置环境变量: USE_DEV_DATA_DIR=1
try {
  if (app && typeof app.isPackaged === 'boolean' && !app.isPackaged && process.env.USE_DEV_DATA_DIR === '1') {
    const devUserData = path.join(__dirname, '.dev-user-data');
    if (!fs.existsSync(devUserData)) {
      fs.mkdirSync(devUserData, { recursive: true });
    }
    app.setPath('userData', devUserData);
    console.log('使用开发数据目录:', devUserData);
  } else {
    console.log('使用默认数据目录:', app.getPath('userData'));
  }
} catch (error) {
  console.warn('数据目录设置失败:', error);
}

// 初始化存储
const store = new Store();

let mainWindow = null;
let noteWindow = null; // 笔记窗口
let lastShowAt = 0; // 记录最近一次显示时间，用于忽略刚显示时的 blur
let lastNoteShowAt = 0; // 笔记窗口显示时间
let autoUpdater = null;
let autoUpdaterInitialized = false;

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
  
  // 🔑 关键修复：不再还原工作区可见性
  // 之前 200ms 后调用 setVisibleOnAllWorkspaces(false) 会导致窗口在全屏应用前面来回跳动
  // 因为这会让窗口回到原来的 Space，而不是停留在当前全屏应用的 Space
  // 保持 setVisibleOnAllWorkspaces(true) 可以让窗口始终覆盖在当前 Space（包括全屏应用）
  
  // 200ms后恢复用户置顶偏好，并适度恢复工作区可见性
  setTimeout(() => {
    try {
      const pinned = !!store.get('mainPinned');
      mainWindow.setAlwaysOnTop(pinned, pinned ? 'floating' : undefined);
      // 适度恢复工作区可见性，避免后续桌面切换时被系统强制带回旧 Space
      mainWindow.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true });
    } catch (_) {}
  }, 200);
}

// 创建主窗口
function createWindow() {
  const pinnedPref = store.get('mainPinned');
  const initialPinned = typeof pinnedPref === 'boolean' ? pinnedPref : true;
  mainWindow = new BrowserWindow({
    width: 600,
    height: 600,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false, // 无边框
    resizable: true,
    transparent: true, // 启用透明
    alwaysOnTop: initialPinned,
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
    // 若用户已置顶主窗口，则不自动隐藏
    try {
      const pinned = !!store.get('mainPinned');
      if (pinned) return;
    } catch (_) {}
    
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFocused()) {
        mainWindow.hide();
      }
    }, 200);
  });

  // 开发模式打开开发者工具
  // 临时启用以调试图片功能
  mainWindow.webContents.openDevTools();
}

// 创建笔记窗口
function createNoteWindow() {
  if (noteWindow) {
    return; // 已存在，不重复创建
  }

  noteWindow = new BrowserWindow({
    width: 700,
    height: 600,
    minWidth: 500,
    minHeight: 400,
    show: false,
    frame: false,
    resizable: true,
    transparent: false,
    alwaysOnTop: true, // 始终置顶
    skipTaskbar: false,
    hasShadow: true,
    roundedCorners: true,
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, '单词.png'),
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      backgroundThrottling: false
    }
  });

  // 加载笔记窗口页面
  noteWindow.loadFile('note-window.html');

  // 窗口关闭时隐藏并保存位置
  noteWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      
      // 通知渲染进程窗口即将隐藏，让它保存内容
      if (noteWindow && !noteWindow.isDestroyed()) {
        noteWindow.webContents.send('window-hiding');
      }
      
      // 稍微延迟一下再隐藏，确保保存完成
      setTimeout(() => {
        if (noteWindow && !noteWindow.isDestroyed()) {
          // 保存窗口位置
          const bounds = noteWindow.getBounds();
          store.set('noteWindowPosition', { x: bounds.x, y: bounds.y });
          noteWindow.hide();
        }
      }, 100);
    }
  });

  // 窗口始终置顶，不需要失焦自动隐藏
  // 用户可以通过 Cmd+M 或关闭按钮来隐藏窗口
  
  // 监听窗口移动，保存新位置
  noteWindow.on('moved', () => {
    if (noteWindow && !noteWindow.isDestroyed()) {
      const bounds = noteWindow.getBounds();
      store.set('noteWindowPosition', { x: bounds.x, y: bounds.y });
    }
  });

  // 调试工具
  // noteWindow.webContents.openDevTools();
}

// 显示笔记窗口
async function showNoteWindow() {
  // 如果窗口不存在或已销毁，重新创建
  if (!noteWindow || noteWindow.isDestroyed()) {
    console.log('笔记窗口不存在或已销毁，重新创建');
    noteWindow = null;
    createNoteWindow();
    // 等待窗口创建完成
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // 尝试读取保存的窗口位置
  const savedPosition = store.get('noteWindowPosition');
  
  if (savedPosition && typeof savedPosition.x === 'number' && typeof savedPosition.y === 'number') {
    // 使用保存的位置
    noteWindow.setPosition(savedPosition.x, savedPosition.y);
    console.log(`使用保存的笔记窗口位置: (${savedPosition.x}, ${savedPosition.y})`);
  } else {
    // 首次打开，计算默认位置（右侧偏上）
    const cursorPoint = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPoint);
    const workArea = display.workArea;

    // 获取窗口尺寸
    const { width: winW, height: winH } = noteWindow.getBounds();

    // 右侧偏上位置
    const targetX = Math.round(workArea.x + workArea.width - winW - 50);
    const targetY = Math.round(workArea.y + 50);
    noteWindow.setPosition(targetX, targetY);
    console.log(`使用默认笔记窗口位置: (${targetX}, ${targetY})`);
  }

  // 临时在所有工作区可见
  try {
    noteWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch (_) {}

  // 窗口始终置顶，不需要额外设置
  noteWindow.show();
  noteWindow.focus();
  lastNoteShowAt = Date.now();

  // 🔑 关键修复：不再还原工作区可见性
  // 之前 200ms 后调用 setVisibleOnAllWorkspaces(false) 会导致窗口在全屏应用前面来回跳动
  // 保持 setVisibleOnAllWorkspaces(true) 可以让窗口始终覆盖在当前 Space（包括全屏应用）

  // 在短暂延时后恢复工作区可见性设置，避免后续桌面切换时被系统强制带回旧 Space
  setTimeout(() => {
    try {
      if (noteWindow && !noteWindow.isDestroyed()) {
        noteWindow.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true });
      }
    } catch (_) {}
  }, 300);
}

// 快速保存（不显示窗口，只显示通知）
// 通过 IPC 委托给渲染进程处理（使用 IndexedDB）
async function quickSave() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) {
      showNotification('保存失败', '主窗口未初始化');
      return;
    }

    // 检查剪贴板中是否有图片
    const image = clipboard.readImage();
    const hasValidImage = !image.isEmpty();
    
    // 检查是否是图片文件路径
    const text = clipboard.readText();
    let hasImageFile = false;
    if (text && (text.startsWith('/') || text.startsWith('file://'))) {
      const filePath = text.replace('file://', '');
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath).toLowerCase();
        hasImageFile = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp'].includes(ext);
      }
    }
    
    let itemToSave;
    let displayText;
    
    // 优先处理图片
    if (hasValidImage || hasImageFile) {
      let imageData = null;
      
      if (hasValidImage) {
        // 直接读取图片数据
        try {
          const size = image.getSize();
          const timestamp = Date.now();
          const fileName = `image_${timestamp}.png`;
          const thumbFileName = `image_thumb_${timestamp}.png`;
          const imagesDir = getImagesDir();
          const imagePath = path.join(imagesDir, fileName);
          const thumbPath = path.join(imagesDir, thumbFileName);
          const pngBuffer = image.toPNG();
          fs.writeFileSync(imagePath, pngBuffer);
          const thumbnail = image.resize({ width: 48, height: 48 });
          const thumbBuffer = thumbnail.toPNG();
          fs.writeFileSync(thumbPath, thumbBuffer);
          
          imageData = {
            type: 'image',
            fileName: fileName,
            thumbFileName: thumbFileName,
            width: size.width,
            height: size.height,
            size: pngBuffer.length,
            path: imagePath
          };
        } catch (error) {
          console.error('读取图片失败:', error);
        }
      } else if (hasImageFile) {
        // 从文件路径读取图片
        try {
          const filePath = text.replace('file://', '');
          const imageBuffer = fs.readFileSync(filePath);
          const fileImage = nativeImage.createFromBuffer(imageBuffer);
          if (!fileImage.isEmpty()) {
            const size = fileImage.getSize();
            const timestamp = Date.now();
            const fileName = `image_${timestamp}.png`;
            const thumbFileName = `image_thumb_${timestamp}.png`;
            const imagesDir = getImagesDir();
            const imagePath = path.join(imagesDir, fileName);
            const thumbPath = path.join(imagesDir, thumbFileName);
            const pngBuffer = fileImage.toPNG();
            fs.writeFileSync(imagePath, pngBuffer);
            const thumbnail = fileImage.resize({ width: 48, height: 48 });
            const thumbBuffer = thumbnail.toPNG();
            fs.writeFileSync(thumbPath, thumbBuffer);
            
            imageData = {
              type: 'image',
              fileName: fileName,
              thumbFileName: thumbFileName,
              width: size.width,
              height: size.height,
              size: pngBuffer.length,
              path: imagePath
            };
          }
        } catch (error) {
          console.error('读取图片文件失败:', error);
        }
      }
      
      if (imageData) {
        itemToSave = imageData;
        displayText = `图片 (${imageData.width}x${imageData.height})`;
      }
    }
    
    // 如果没有图片，处理文本
    if (!itemToSave) {
      const trimmedText = text ? text.trim() : '';
      if (!trimmedText) {
        showNotification('保存失败', '剪贴板为空');
        return;
      }
      
      itemToSave = {
        type: 'text',
        content: trimmedText
      };
      displayText = trimmedText.length > 20 ? trimmedText.substring(0, 20) + '...' : trimmedText;
    }

    // 发送给渲染进程处理（使用 IndexedDB 保存）
    mainWindow.webContents.send('quick-save-item', {
      item: itemToSave,
      displayText: displayText
    });
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
      silent: false,
      icon: path.join(__dirname, 'RI.png')
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
    if (mainWindow && !mainWindow.isDestroyed()) {
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

  // 注册快捷键：Command+M - 呼出笔记窗口
  const noteShortcut = process.platform === 'darwin' ? 'Command+M' : 'Ctrl+M';
  const ret3 = globalShortcut.register(noteShortcut, () => {
    try {
      if (noteWindow && !noteWindow.isDestroyed() && noteWindow.isVisible()) {
        console.log('隐藏笔记窗口');
        // 通知渲染进程保存
        noteWindow.webContents.send('window-hiding');
        // 延迟隐藏，确保保存完成
        setTimeout(() => {
          if (noteWindow && !noteWindow.isDestroyed()) {
            noteWindow.hide();
          }
        }, 100);
      } else {
        console.log('显示笔记窗口');
        showNoteWindow();
      }
    } catch (error) {
      console.error('笔记窗口切换失败:', error);
      // 如果出错，重新创建窗口
      noteWindow = null;
      showNoteWindow();
    }
  });

  if (!ret1 || !ret2 || !ret3) {
    console.error('快捷键注册失败');
  }

  console.log(`✓ 已注册快捷键:`);
  console.log(`  - ${toggleShortcut}: 呼出/隐藏主窗口`);
  console.log(`  - ${saveShortcut}: 快速保存（不显示窗口）`);
  console.log(`  - ${noteShortcut}: 呼出/隐藏笔记窗口`);
  
  // 检查更新（延迟5秒，避免影响启动速度）
  setTimeout(() => {
    checkForUpdates();
  }, 5000);
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

// IPC 处理：显示通知
ipcMain.on('show-notification', (event, { title, body }) => {
  showNotification(title, body);
});

// 开始以 Markdown 文件形式拖拽
ipcMain.on('start-markdown-drag', (event, payload) => {
  try {
    if (!payload || typeof payload.content !== 'string') return;
    const rawName = (payload.fileName && String(payload.fileName)) || `export_${Date.now()}.md`;
    const safeName = rawName
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_');
    const userDataPath = app.getPath('userData');
    const exportDir = path.join(userDataPath, 'drag-exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    const filePath = path.join(exportDir, safeName.endsWith('.md') ? safeName : `${safeName}.md`);
    fs.writeFileSync(filePath, payload.content, 'utf8');

    // 选择一个小图标做为拖拽图标
    const iconCandidates = [
      path.join(__dirname, 'icon16.png'),
      path.join(__dirname, 'RI.png')
    ];
    let icon = null;
    for (const p of iconCandidates) {
      try {
        if (fs.existsSync(p)) { icon = nativeImage.createFromPath(p); break; }
      } catch (_) {}
    }

    event.sender.startDrag({
      file: filePath,
      icon: icon || nativeImage.createEmpty()
    });
    console.log('开始文件拖拽:', filePath);
  } catch (e) {
    console.error('start-markdown-drag 失败:', e);
  }
});

// 获取图片存储目录
function getImagesDir() {
  const userDataPath = app.getPath('userData');
  const imagesDir = path.join(userDataPath, 'clipboard-images');
  
  // 确保目录存在
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
  
  return imagesDir;
}

// IPC 处理：剪贴板相关
ipcMain.handle('clipboard-read', async () => {
  return clipboard.readText();
});

ipcMain.handle('clipboard-write', async (event, text) => {
  clipboard.writeText(text);
});

ipcMain.handle('clipboard-read-image', async () => {
  const image = clipboard.readImage();
  
  if (image.isEmpty()) {
    return null;
  }
  
  try {
    // 获取图片尺寸
    const size = image.getSize();
    
    // 生成唯一的文件名（基于时间戳）
    const timestamp = Date.now();
    const fileName = `image_${timestamp}.png`;
    const thumbFileName = `image_thumb_${timestamp}.png`;
    
    // 获取图片存储目录
    const imagesDir = getImagesDir();
    const imagePath = path.join(imagesDir, fileName);
    const thumbPath = path.join(imagesDir, thumbFileName);
    
    // 保存原图
    const pngBuffer = image.toPNG();
    fs.writeFileSync(imagePath, pngBuffer);
    
    // 创建并保存缩略图（48x48）
    const thumbnail = image.resize({ width: 48, height: 48 });
    const thumbBuffer = thumbnail.toPNG();
    fs.writeFileSync(thumbPath, thumbBuffer);
    
    // 返回图片信息
    return {
      type: 'image',
      fileName: fileName,
      thumbFileName: thumbFileName,
      width: size.width,
      height: size.height,
      size: pngBuffer.length,
      path: imagePath,
      dataURL: `data:image/png;base64,${pngBuffer.toString('base64')}`
    };
  } catch (error) {
    console.error('读取图片失败:', error);
    return null;
  }
});

ipcMain.handle('clipboard-read-file-paths', async () => {
  try {
    // 在 Electron 中，文件路径可能在 text 中
    const text = clipboard.readText();
    
    // 检查是否是文件路径
    if (text && (text.startsWith('/') || text.startsWith('file://'))) {
      let filePath = text.replace('file://', '');
      
      // 检查文件是否存在且是图片
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath).toLowerCase();
        const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp'];
        
        if (imageExts.includes(ext)) {
          console.log('检测到图片文件:', filePath);
          
          // 读取图片文件
          const imageBuffer = fs.readFileSync(filePath);
          const image = nativeImage.createFromBuffer(imageBuffer);
          
          if (!image.isEmpty()) {
            const size = image.getSize();
            const timestamp = Date.now();
            const fileName = `image_${timestamp}.png`;
            const thumbFileName = `image_thumb_${timestamp}.png`;
            
            const imagesDir = getImagesDir();
            const imagePath = path.join(imagesDir, fileName);
            const thumbPath = path.join(imagesDir, thumbFileName);
            
            // 保存原图
            const pngBuffer = image.toPNG();
            fs.writeFileSync(imagePath, pngBuffer);
            
            // 保存缩略图
            const thumbnail = image.resize({ width: 48, height: 48 });
            const thumbBuffer = thumbnail.toPNG();
            fs.writeFileSync(thumbPath, thumbBuffer);
            
            return {
              type: 'image',
              fileName: fileName,
              thumbFileName: thumbFileName,
              width: size.width,
              height: size.height,
              size: pngBuffer.length,
              path: imagePath,
              dataURL: `data:image/png;base64,${pngBuffer.toString('base64')}`
            };
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('读取文件路径失败:', error);
    return null;
  }
});

ipcMain.handle('clipboard-available-formats', async () => {
  const formats = clipboard.availableFormats();
  
  // 检查 clipboard.readImage() 是否有图片
  const image = clipboard.readImage();
  const hasValidImage = !image.isEmpty();
  
  // 检查是否是图片文件路径
  const text = clipboard.readText();
  let hasImageFile = false;
  if (text && (text.startsWith('/') || text.startsWith('file://'))) {
    const filePath = text.replace('file://', '');
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      hasImageFile = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp'].includes(ext);
    }
  }
  
  console.log('Clipboard formats:', formats);
  console.log('Has valid image:', hasValidImage);
  console.log('Has image file:', hasImageFile);
  console.log('Text content:', text ? text.substring(0, 100) : 'none');
  
  return {
    formats: formats,
    hasText: formats.some(f => f.includes('text') || f === 'public.utf8-plain-text'),
    hasHTML: formats.some(f => f.includes('html')),
    hasImage: hasValidImage || hasImageFile,
    hasRTF: formats.some(f => f.includes('rtf'))
  };
});

// 复制图片到剪贴板
ipcMain.handle('clipboard-write-image', async (event, imagePath) => {
  try {
    if (fs.existsSync(imagePath)) {
      const image = nativeImage.createFromPath(imagePath);
      clipboard.writeImage(image);
      console.log('图片已复制到剪贴板:', imagePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('复制图片失败:', error);
    return false;
  }
});

// 将 dataURL 转存为图片文件并写入剪贴板
ipcMain.handle('clipboard-save-dataurl', async (event, dataUrl) => {
  try {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/i);
    if (!match) return null;
    const base64 = match[2];
    const buffer = Buffer.from(base64, 'base64');

    // 统一转为 PNG 保存
    const img = nativeImage.createFromBuffer(buffer);
    if (img.isEmpty()) return null;
    const size = img.getSize();
    const timestamp = Date.now();
    const fileName = `image_${timestamp}.png`;
    const thumbFileName = `image_thumb_${timestamp}.png`;
    const imagesDir = getImagesDir();
    const imagePath = path.join(imagesDir, fileName);
    const thumbPath = path.join(imagesDir, thumbFileName);

    const pngBuffer = img.toPNG();
    fs.writeFileSync(imagePath, pngBuffer);
    const thumbnail = img.resize({ width: 48, height: 48 });
    const thumbBuffer = thumbnail.toPNG();
    fs.writeFileSync(thumbPath, thumbBuffer);

    // 写入系统剪贴板为图片
    clipboard.writeImage(img);

    return {
      type: 'image',
      fileName,
      thumbFileName,
      width: size.width,
      height: size.height,
      size: pngBuffer.length,
      path: imagePath,
      dataURL: `data:image/png;base64,${pngBuffer.toString('base64')}`
    };
  } catch (error) {
    console.error('保存 dataURL 图片失败:', error);
    return null;
  }
});

// 打开文件或路径
ipcMain.handle('open-path', async (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      await shell.openPath(filePath);
      console.log('已打开文件:', filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('打开文件失败:', error);
    return false;
  }
});

// 打开外部链接（URL）
ipcMain.handle('shell-open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    console.log('已打开链接:', url);
    return true;
  } catch (error) {
    console.error('打开链接失败:', error);
    return false;
  }
});

// IPC 处理：窗口控制
ipcMain.handle('window-show', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    await showOnActiveSpace();
  }
});

ipcMain.handle('window-hide', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
});

ipcMain.handle('window-toggle', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      await showOnActiveSpace();
    }
  }
});

// IPC：主窗口置顶状态查询
ipcMain.handle('main-get-always-on-top', async () => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      return mainWindow.isAlwaysOnTop();
    }
  } catch (_) {}
  return false;
});

// IPC：主窗口置顶状态设置并持久化
ipcMain.handle('main-set-always-on-top', async (event, on) => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const pinned = !!on;
      mainWindow.setAlwaysOnTop(pinned, pinned ? 'floating' : undefined);
      store.set('mainPinned', pinned);
      return mainWindow.isAlwaysOnTop();
    }
  } catch (e) {
    console.error('设置主窗口置顶失败:', e);
  }
  return false;
});

// IPC 处理：笔记窗口置顶控制
ipcMain.on('toggle-note-pin', (event, isPinned) => {
  if (noteWindow && !noteWindow.isDestroyed()) {
    noteWindow.setAlwaysOnTop(isPinned, 'floating');
    console.log(`笔记窗口置顶状态: ${isPinned ? '已置顶' : '已取消置顶'}`);
  }
});

// IPC 处理：模式更新同步
ipcMain.on('modes-updated', (event, data) => {
  // 主窗口通知模式列表已更新，转发给笔记窗口
  if (noteWindow && !noteWindow.isDestroyed()) {
    noteWindow.webContents.send('modes-sync', data);
    // 开发环境日志过多会拖慢渲染，这里降噪
    if (process.env.RI_DEBUG === '1') console.log('模式列表已同步到笔记窗口');
  }
});

// IPC 处理：当前模式切换同步
ipcMain.on('mode-switched', (event, data) => {
  // 主窗口通知当前模式已切换，转发给笔记窗口
  if (noteWindow && !noteWindow.isDestroyed()) {
    noteWindow.webContents.send('mode-changed', data);
    if (process.env.RI_DEBUG === '1') console.log(`当前模式已切换到: ${data.mode?.name || '未知'}`);
  }
});

// IPC 处理：笔记保存通知
ipcMain.on('note-saved', (event, data) => {
  // 笔记窗口通知有新内容保存，转发给主窗口刷新
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('note-saved', data);
    console.log(`笔记已保存，通知主窗口刷新 (模式ID: ${data.modeId})`);
  }
});

// ==================== 自动更新功能 ====================

function ensureAutoUpdater() {
  if (autoUpdaterInitialized && autoUpdater) {
    return autoUpdater;
  }
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    configureAutoUpdater(autoUpdater);
    autoUpdaterInitialized = true;
    return autoUpdater;
  } catch (error) {
    console.error('自动更新初始化失败:', error);
    autoUpdater = null;
    autoUpdaterInitialized = false;
    return null;
  }
}

function configureAutoUpdater(updater) {
  updater.autoDownload = false; // 不自动下载，询问用户
  updater.autoInstallOnAppQuit = true; // 退出时自动安装

  updater.on('update-available', (info) => {
    console.log('发现新版本:', info.version);
    
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '发现新版本',
      message: `发现新版本 ${info.version}，是否立即下载？`,
      detail: '下载完成后会提示您安装',
      buttons: ['立即下载', '稍后提醒'],
      defaultId: 0,
      cancelId: 1
    }).then(result => {
      if (result.response === 0) {
        updater.downloadUpdate();
        showNotification('开始下载', '正在下载新版本...');
      }
    });
  });

  updater.on('update-not-available', () => {
    console.log('当前已是最新版本');
  });

  updater.on('download-progress', (progressObj) => {
    let log = `下载进度: ${Math.round(progressObj.percent)}%`;
    console.log(log);
  });

  updater.on('update-downloaded', (info) => {
    console.log('更新下载完成:', info.version);
    
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '更新已就绪',
      message: `新版本 ${info.version} 已下载完成`,
      detail: '点击"立即重启"以安装更新',
      buttons: ['立即重启', '稍后安装'],
      defaultId: 0,
      cancelId: 1
    }).then(result => {
      if (result.response === 0) {
        updater.quitAndInstall(false, true);
      }
    });
  });

  updater.on('error', (err) => {
    console.error('自动更新错误:', err);
  });
}

// 检查更新
function checkForUpdates() {
  const updater = ensureAutoUpdater();
  if (!updater) {
    console.log('自动更新不可用，跳过检查');
    return;
  }

  // 只在打包后的应用中检查更新
  if (!app.isPackaged) {
    console.log('开发模式，跳过更新检查');
    return;
  }
  
  console.log('正在检查更新...');
  updater.checkForUpdates().catch(err => {
    console.error('检查更新失败:', err);
  });
}
