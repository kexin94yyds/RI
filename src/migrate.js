// 数据迁移：从 electron-store 迁移到 IndexedDB
// 参考 insidebar-ai 的迁移模式

import { 
  saveMode, 
  saveWord, 
  updateMode,
  getAllModes,
  getSetting,
  setSetting
} from './db.js';

// 检查是否已迁移
export async function checkMigrationStatus() {
  const migrated = await window.electronAPI.store.get('migrated_to_indexeddb');
  return Boolean(migrated);
}

// 从 electron-store 迁移数据到 IndexedDB
export async function migrateFromElectronStore() {
  try {
    console.log('🔄 开始数据迁移...');
    
    // 1. 读取旧数据
    const oldData = await window.electronAPI.store.get('wordModes') || [];
    
    if (oldData.length === 0) {
      console.log('📝 没有数据需要迁移');
      // 创建默认模式
      await createDefaultMode();
      await markMigrationComplete();
      return { success: true, imported: 0, message: '已创建默认模式' };
    }
    
    console.log(`📊 发现 ${oldData.length} 个模式需要迁移`);
    
    const results = {
      imported: 0,
      errors: []
    };
    
    // 2. 迁移每个模式
    for (const oldMode of oldData) {
      try {
        console.log(`🔧 迁移模式: ${oldMode.name}`);
        
        // 创建新模式（不包含 words，因为要单独存储）
        const newMode = await saveMode({
          name: oldMode.name || '未命名模式',
          notes: oldMode.notes || '',
          createdAt: Date.now()
        });
        
        console.log(`✅ 模式已创建，ID: ${newMode.id}`);
        
        // 迁移该模式下的单词/条目
        if (oldMode.words && Array.isArray(oldMode.words)) {
          console.log(`  📥 迁移 ${oldMode.words.length} 个条目...`);
          
          for (const word of oldMode.words) {
            try {
              await saveWord(newMode.id, word);
            } catch (error) {
              console.error(`  ❌ 条目迁移失败:`, error);
            }
          }
        }
        
        results.imported++;
        console.log(`✓ ${oldMode.name} 迁移完成`);
        
      } catch (error) {
        console.error(`❌ 模式迁移失败: ${oldMode.name}`, error);
        results.errors.push({ 
          mode: oldMode.name, 
          error: error.message 
        });
      }
    }
    
    // 3. 备份旧数据
    console.log('💾 备份旧数据...');
    await window.electronAPI.store.set('wordModes_backup', oldData);
    await window.electronAPI.store.set('wordModes_backup_date', new Date().toISOString());
    
    // 4. 标记迁移完成
    await markMigrationComplete();
    
    // 5. 设置默认当前模式
    const allModes = await getAllModes();
    if (allModes.length > 0) {
      await setSetting('currentModeId', allModes[0].id);
    }
    
    console.log('✅ 数据迁移完成！');
    console.log(`📊 成功: ${results.imported}, 失败: ${results.errors.length}`);
    
    return {
      success: true,
      ...results
    };
    
  } catch (error) {
    console.error('❌ 数据迁移失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 创建默认模式
async function createDefaultMode() {
  const defaultMode = await saveMode({
    name: '默认',
    notes: '',
    createdAt: Date.now()
  });
  
  await setSetting('currentModeId', defaultMode.id);
  console.log('✅ 已创建默认模式');
  return defaultMode;
}

// 标记迁移完成
async function markMigrationComplete() {
  await window.electronAPI.store.set('migrated_to_indexeddb', true);
  await window.electronAPI.store.set('migration_date', new Date().toISOString());
}

// 回滚到旧数据（如果迁移失败）
export async function rollbackMigration() {
  try {
    const backup = await window.electronAPI.store.get('wordModes_backup');
    if (!backup) {
      throw new Error('没有找到备份数据');
    }
    
    await window.electronAPI.store.set('wordModes', backup);
    await window.electronAPI.store.set('migrated_to_indexeddb', false);
    
    console.log('✅ 已回滚到旧数据');
    return { success: true };
  } catch (error) {
    console.error('❌ 回滚失败:', error);
    return { success: false, error: error.message };
  }
}

// 显示迁移进度UI
export function showMigrationUI() {
  const existingUI = document.getElementById('migration-ui');
  if (existingUI) {
    existingUI.remove();
  }
  
  const modal = document.createElement('div');
  modal.id = 'migration-ui';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    z-index: 99999;
    display: flex;
    justify-content: center;
    align-items: center;
  `;
  
  const panel = document.createElement('div');
  panel.style.cssText = `
    background: white;
    padding: 30px;
    border-radius: 12px;
    max-width: 500px;
    width: 90%;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  `;
  
  panel.innerHTML = `
    <h2 style="margin-top: 0; color: #2c3e50; font-size: 24px;">🔄 数据升级</h2>
    <p style="color: #7f8c8d; font-size: 16px; margin: 20px 0;">
      检测到旧版本数据，需要升级到新的数据库系统。
    </p>
    <p style="color: #95a5a6; font-size: 14px; margin: 20px 0;">
      ✅ 旧数据会自动备份<br>
      ✅ 升级过程通常只需几秒钟<br>
      ✅ 如有问题可以回滚
    </p>
    <div id="migration-progress" style="display: none; margin: 20px 0;">
      <div style="background: #ecf0f1; height: 8px; border-radius: 4px; overflow: hidden;">
        <div id="progress-bar" style="background: #3498db; height: 100%; width: 0%; transition: width 0.3s;"></div>
      </div>
      <p id="progress-text" style="color: #7f8c8d; font-size: 14px; margin-top: 10px;">准备中...</p>
    </div>
    <div id="migration-buttons">
      <button id="start-migration-btn" style="
        background: #3498db;
        color: white;
        border: none;
        padding: 12px 30px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 16px;
        margin: 10px 5px;
      ">开始升级</button>
      <button id="cancel-migration-btn" style="
        background: #95a5a6;
        color: white;
        border: none;
        padding: 12px 30px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 16px;
        margin: 10px 5px;
      ">稍后再说</button>
    </div>
  `;
  
  modal.appendChild(panel);
  document.body.appendChild(modal);
  
  // 开始迁移
  document.getElementById('start-migration-btn').onclick = async () => {
    document.getElementById('migration-buttons').style.display = 'none';
    document.getElementById('migration-progress').style.display = 'block';
    
    try {
      updateProgress(30, '正在读取旧数据...');
      
      const result = await migrateFromElectronStore();
      
      if (result.success) {
        updateProgress(100, '✅ 升级完成！');
        
        setTimeout(() => {
          modal.remove();
          // 刷新页面以加载新数据
          window.location.reload();
        }, 1500);
      } else {
        updateProgress(0, `❌ 升级失败: ${result.error}`);
        setTimeout(() => {
          document.getElementById('migration-buttons').style.display = 'block';
          document.getElementById('migration-progress').style.display = 'none';
        }, 3000);
      }
    } catch (error) {
      updateProgress(0, `❌ 升级失败: ${error.message}`);
      setTimeout(() => {
        document.getElementById('migration-buttons').style.display = 'block';
        document.getElementById('migration-progress').style.display = 'none';
      }, 3000);
    }
  };
  
  // 取消
  document.getElementById('cancel-migration-btn').onclick = () => {
    modal.remove();
  };
  
  function updateProgress(percent, text) {
    const bar = document.getElementById('progress-bar');
    const textEl = document.getElementById('progress-text');
    if (bar) bar.style.width = percent + '%';
    if (textEl) textEl.textContent = text;
  }
}

// 自动检查并显示迁移UI
export async function autoCheckAndMigrate() {
  const migrated = await checkMigrationStatus();
  
  if (!migrated) {
    // 等待DOM加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        showMigrationUI();
      });
    } else {
      showMigrationUI();
    }
    return true;
  }
  
  return false;
}

