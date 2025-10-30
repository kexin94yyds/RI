import { isRegistered, register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { invoke } from "@tauri-apps/api/core";

// 快捷键工具
export const shortcut = {
  // 注册全局快捷键显示/隐藏窗口
  registerToggleShortcut: async (): Promise<void> => {
    const shortcut = navigator.platform.toUpperCase().indexOf("MAC") >= 0 ? "Shift+Command+U" : "Shift+Ctrl+U";
    
    try {
      // 检查是否已注册
      const registered = await isRegistered(shortcut);
      if (registered) {
        await unregister(shortcut);
      }
      
      // 注册快捷键
      await register(shortcut, async () => {
        await invoke("toggle_window");
      });
    } catch (e) {
      console.error("Failed to register shortcut:", e);
    }
  },
};

