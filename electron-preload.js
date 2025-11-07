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
    toggle: () => ipcRenderer.invoke('window-toggle'),
    // 置顶状态控制
    isAlwaysOnTop: () => ipcRenderer.invoke('main-get-always-on-top'),
    setAlwaysOnTop: (on) => ipcRenderer.invoke('main-set-always-on-top', on)
  },
  
  // Shell API - 打开外部链接
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell-open-external', url)
  },

  // 拖拽导出 API
  drag: {
    // 以 Markdown 文件形式开始拖拽
    startMarkdownDrag: (content, fileName) => ipcRenderer.send('start-markdown-drag', { content, fileName })
  },
  
  // 通知 API
  sendNotification: (title, body) => {
    ipcRenderer.send('show-notification', { title, body });
  },
  
  // IPC 通信 - 用于快速保存和笔记保存通知
  ipcRenderer: {
    on: (channel, func) => {
      const validChannels = ['quick-save-item', 'note-saved'];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    }
  },
  
  // 系统信息
  platform: process.platform
});

// 暴露额外的 electron API 用于 IPC 通信
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel, data) => {
      // 白名单允许的频道
      const validChannels = ['toggle-note-pin', 'modes-updated', 'mode-switched', 'note-saved', 'start-markdown-drag'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    on: (channel, func) => {
      const validChannels = ['note-pin-changed', 'modes-sync', 'mode-changed', 'quick-save-item', 'window-hiding'];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    removeListener: (channel, func) => {
      const validChannels = ['note-pin-changed', 'modes-sync', 'mode-changed', 'quick-save-item', 'window-hiding'];
      if (validChannels.includes(channel)) {
        ipcRenderer.removeListener(channel, func);
      }
    }
  }
});
