// content.js - 在所有页面监听 Cmd/Ctrl + U 并通知后台保存

(function () {
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);

  function isSaveHotkey(e) {
    const key = (e.key || '').toLowerCase();
    if (isMac) {
      return e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey && key === 'u';
    }
    return e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && key === 'u';
  }

  async function onKeydown(e) {
    if (!isSaveHotkey(e)) return;

    // 仅由当前获得焦点的 frame 发送，避免 all_frames 多次触发
    if (!document.hasFocus()) return;

    try {
      // 尝试阻止默认行为（浏览器保留快捷键可能无法阻止）
      if (e.cancelable) {
        e.preventDefault();
        e.stopPropagation();
      }
    } catch {}

    // 尝试直接在页面上下文读取剪贴板（有用户激活，成功率高）
    let text = '';
    try {
      if (navigator.clipboard?.readText) {
        text = await navigator.clipboard.readText();
      }
    } catch {}

    try {
      chrome.runtime?.sendMessage?.({ type: 'save-word-hotkey', text });
    } catch {}
  }

  // 在捕获阶段监听，尽可能早地拦截
  window.addEventListener('keydown', onKeydown, { capture: true, passive: false });
})();
