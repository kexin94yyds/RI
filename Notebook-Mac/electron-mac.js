const { app, BrowserWindow, ipcMain, screen, shell, dialog } = require('electron');
const Store = require('electron-store');
const path = require('path');
const fs = require('fs');

const store = new Store();
let mainWindow = null;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: true,
    frame: true, // Mac 应用通常需要标准边框
    resizable: true,
    titleBarStyle: 'hiddenInset', // 漂亮的 Mac 标题栏样式
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
    }
  });

  // 加载笔记主界面
  mainWindow.loadFile('note-window.html');

  // 处理窗口关闭
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 处理 IPC 通讯（可以复用原有的 note-window.js 中的逻辑）
ipcMain.handle('get-store-value', (event, key) => store.get(key));
ipcMain.handle('set-store-value', (event, key, value) => store.set(key, value));
