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
    writeText: (text) => ipcRenderer.invoke('clipboard-write', text),
    readImage: () => ipcRenderer.invoke('clipboard-read-image'),
    readFilePaths: () => ipcRenderer.invoke('clipboard-read-file-paths'),
    availableFormats: () => ipcRenderer.invoke('clipboard-available-formats'),
    writeImage: (imagePath) => ipcRenderer.invoke('clipboard-write-image', imagePath),
    saveDataURL: (dataUrl) => ipcRenderer.invoke('clipboard-save-dataurl', dataUrl)
  },
  
  // 文件系统 API
  fs: {
    openPath: (path) => ipcRenderer.invoke('open-path', path)
  },
  
  // 窗口控制 API
  window: {
    show: () => ipcRenderer.invoke('window-show'),
    hide: () => ipcRenderer.invoke('window-hide'),
    toggle: () => ipcRenderer.invoke('window-toggle')
  },
  
  // Shell API - 打开外部链接
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell-open-external', url)
  },
  
  // 系统信息
  platform: process.platform
});

// 暴露额外的 electron API 用于 IPC 通信
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel, data) => {
      // 白名单允许的频道
      const validChannels = ['toggle-note-pin'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    on: (channel, func) => {
      const validChannels = ['note-pin-changed'];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    }
  }
});

