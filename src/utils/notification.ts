import { sendNotification } from "@tauri-apps/plugin-notification";

// 通知工具，模拟 chrome.notifications
export const notification = {
  create: async (options: {
    title?: string;
    message: string;
    iconUrl?: string;
  }): Promise<void> => {
    try {
      await sendNotification({
        title: options.title || "单词记录器",
        body: options.message,
      });
    } catch (e) {
      console.error("Failed to send notification:", e);
    }
  },
};


