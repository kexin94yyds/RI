// background.js - 后台脚本，处理快捷键事件

// 监听快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'save-word') {
    try {
      // 获取当前活动标签页
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      
      if (!tab) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon48.png',
          title: '单词记录器',
          message: '无法获取当前标签页'
        });
        return;
      }
      
      // 向当前活动标签页注入脚本来读取剪贴板
      const results = await chrome.scripting.executeScript({
        target: {tabId: tab.id},
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
      
      const clipboardText = results[0]?.result;
      
      if (!clipboardText || !clipboardText.trim()) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon48.png',
          title: '单词记录器',
          message: '剪贴板为空或无法读取'
        });
        return;
      }

      // 获取模式和单词数据
      const result = await chrome.storage.local.get(['wordModes', 'currentWordMode']);
      const modes = result.wordModes || [{ id: 'default', name: '默认', words: [] }];
      const currentMode = result.currentWordMode || modes[0];
      const word = clipboardText.trim();
      
      // 检查单词是否已存在
      if (!currentMode.words.includes(word)) {
        currentMode.words.push(word);
        
        // 更新模式数据
        const modeIndex = modes.findIndex(mode => mode.id === currentMode.id);
        if (modeIndex !== -1) {
          modes[modeIndex] = currentMode;
        }
        
        await chrome.storage.local.set({
          wordModes: modes,
          currentWordMode: currentMode
        });
        console.log('已保存单词:', word, '到模式:', currentMode.name);
        
        // 在页面上显示"已保存"提示
        chrome.scripting.executeScript({
          target: {tabId: tab.id},
          func: (savedWord) => {
            // 创建提示元素
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
            
            // 3秒后自动消失
            setTimeout(() => {
              notification.style.opacity = '0';
              setTimeout(() => {
                if (notification.parentNode) {
                  notification.parentNode.removeChild(notification);
                }
              }, 300);
            }, 3000);
          },
          args: [word]
        });
        
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon48.png',
          title: '单词记录器',
          message: `已保存到模式"${currentMode.name}"：${word}`
        });
      } else {
        console.log('单词已存在:', word);
        
        // 在页面上显示"单词已存在"提示
        chrome.scripting.executeScript({
          target: {tabId: tab.id},
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
              setTimeout(() => {
                if (notification.parentNode) {
                  notification.parentNode.removeChild(notification);
                }
              }, 300);
            }, 3000);
          },
          args: [word]
        });
        
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
});