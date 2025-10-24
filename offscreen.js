// offscreen.js - 专用于读剪贴板的隐藏页面

async function readClipboardText() {
  // 优先使用现代 API
  if (navigator.clipboard?.readText) {
    try {
      const t = await navigator.clipboard.readText();
      return t || '';
    } catch (e) {
      // 继续尝试备用方案
    }
  }
  // 备用：尝试 execCommand('paste')，需要 clipboardRead 权限
  try {
    const ta = document.createElement('textarea');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    const ok = document.execCommand('paste');
    const v = ok ? ta.value : '';
    ta.remove();
    return v || '';
  } catch (e) {
    return '';
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'read-clipboard') {
    readClipboardText().then(text => {
      sendResponse({ text });
    });
    // 异步响应
    return true;
  }
});

