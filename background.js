// background.js - 后台脚本，处理快捷键与消息

// 简单的防抖，避免重复触发（命令 + 内容脚本同时触发）
let lastHotkeySaveAt = 0;
function shouldThrottleSave() {
  const now = Date.now();
  if (now - lastHotkeySaveAt < 700) return true;
  lastHotkeySaveAt = now;
  return false;
}

// 统一的保存处理逻辑
async function saveWordForTab(tabId, preReadText) {
  try {
    if (!tabId) {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = active?.id;
    }

    if (!tabId) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: '单词记录器',
        message: '无法获取当前标签页'
      });
      return;
    }

    // 尝试使用已读取的文本，否则在页面内读取，失败时走 offscreen 兜底
    let clipboardText = preReadText;
    if (!clipboardText) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            return new Promise((resolve) => {
              if (!navigator.clipboard || !navigator.clipboard.readText) {
                resolve(null);
                return;
              }
              navigator.clipboard.readText()
                .then(text => resolve(text))
                .catch(() => resolve(null));
            });
          }
        });
        clipboardText = results?.[0]?.result;
      } catch (e) {
        // 页面不可注入（例如 chrome:// 或 Web Store），尝试 offscreen 读取
        clipboardText = await readClipboardViaOffscreen();
      }
    }
    if (!clipboardText || !clipboardText.trim()) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: '单词记录器',
        message: '剪贴板为空或无法读取'
      });
      return;
    }

    // 读取与更新存储
    const result = await chrome.storage.local.get(['wordModes', 'currentWordMode']);
    const modes = result.wordModes || [{ id: 'default', name: '默认', words: [] }];
    const currentMode = result.currentWordMode || modes[0];
    const word = clipboardText.trim();

    if (!currentMode.words.includes(word)) {
      currentMode.words.push(word);
      const modeIndex = modes.findIndex(mode => mode.id === currentMode.id);
      if (modeIndex !== -1) modes[modeIndex] = currentMode;

      await chrome.storage.local.set({ wordModes: modes, currentWordMode: currentMode });
      console.log('已保存单词:', word, '到模式:', currentMode.name);

      // 页面内 toast 提示（若页面不可注入则忽略）
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (savedWord) => {
            const notification = document.createElement('div');
            notification.textContent = '已保存';
            notification.style.cssText = `
              position: fixed;
              top: 20px;
              right: 20px;
              background: #4CAF50;
              color: white;
              padding: 10px 20px;
              border-radius: 5px;
              font-size: 16px;
              font-weight: bold;
              z-index: 10000;
              box-shadow: 0 2px 10px rgba(0,0,0,0.3);
              transition: opacity 0.3s ease;
            `;
            document.body.appendChild(notification);
            setTimeout(() => {
              notification.style.opacity = '0';
              setTimeout(() => notification.remove(), 300);
            }, 3000);
          },
          args: [word]
        });
      } catch {}

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: '单词记录器',
        message: `已保存到模式"${currentMode.name}"：${word}`
      });
    } else {
      console.log('单词已存在:', word);

      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (existingWord) => {
            const notification = document.createElement('div');
            notification.textContent = '单词已存在';
            notification.style.cssText = `
              position: fixed;
              top: 20px;
              right: 20px;
              background: #FF9800;
              color: white;
              padding: 10px 20px;
              border-radius: 5px;
              font-size: 16px;
              font-weight: bold;
              z-index: 10000;
              box-shadow: 0 2px 10px rgba(0,0,0,0.3);
              transition: opacity 0.3s ease;
            `;
            document.body.appendChild(notification);
            setTimeout(() => {
              notification.style.opacity = '0';
              setTimeout(() => notification.remove(), 300);
            }, 3000);
          },
          args: [word]
        });
      } catch {}

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: '单词记录器',
        message: `单词已存在于模式"${currentMode.name}"：${word}`
      });
    }
  } catch (error) {
    console.error('保存单词失败:', error);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon48.png',
      title: '单词记录器',
      message: '保存失败：' + error.message
    });
  }
}

// 监听快捷键命令（chrome.commands）
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'save-word') {
    if (shouldThrottleSave()) return;
    await saveWordForTab();
  }
});

// 监听来自内容脚本的消息（按键捕获兜底）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'save-word-hotkey') {
    if (shouldThrottleSave()) return;
    const tabId = sender?.tab?.id;
    const text = typeof message.text === 'string' ? message.text : undefined;
    saveWordForTab(tabId, text);
  }
});

// ---------- Offscreen 读取剪贴板（用于受限页面） ----------
async function ensureOffscreen() {
  if (chrome.offscreen && chrome.offscreen.hasDocument) {
    const has = await chrome.offscreen.hasDocument();
    if (!has) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['CLIPBOARD'],
        justification: 'Read clipboard when page scripting is not allowed'
      });
    }
  }
}

async function readClipboardViaOffscreen() {
  try {
    await ensureOffscreen();
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'read-clipboard' }, (resp) => {
        resolve(resp?.text || '');
      });
    });
  } catch (e) {
    return '';
  }
}
