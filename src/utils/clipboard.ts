import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";

// 剪贴板工具，模拟 navigator.clipboard
export const clipboard = {
  readText: async (): Promise<string> => {
    try {
      const text = await readText();
      return text || "";
    } catch (e) {
      console.error("Failed to read clipboard:", e);
      return "";
    }
  },
  
  writeText: async (text: string): Promise<void> => {
    try {
      await writeText(text);
    } catch (e) {
      console.error("Failed to write clipboard:", e);
      throw e;
    }
  },
};


