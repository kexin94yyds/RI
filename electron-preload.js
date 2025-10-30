const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 存储 API
  store: {
    get: (key) => ipcRenderer.invoke('store-get', key),
    set: (key, value) => ipcRenderer.invoke('store-set', key, value),
    delete: (key) => ipcRenderer.invoke('store-delete', key),
    clear: () => ipcRenderer.invoke('store-clear')
  },
  
  // 剪贴板 API
  clipboard: {
    readText: () => ipcRenderer.invoke('clipboard-read'),
    writeText: (text) => ipcRenderer.invoke('clipboard-write', text)
  },
  
  // 窗口控制 API
  window: {
    show: () => ipcRenderer.invoke('window-show'),
    hide: () => ipcRenderer.invoke('window-hide'),
    toggle: () => ipcRenderer.invoke('window-toggle')
  },
  
  // 系统信息
  platform: process.platform
});

