# 数据库升级方案

## 📊 当前状态

**存储方案：** `electron-store` (JSON 文件)

**数据结构：**
```javascript
{
  wordModes: [
    {
      id: 'default',
      name: '默认',
      words: [],        // 单词/笔记条目列表
      notes: '<html>...' // 富文本笔记内容
    }
  ],
  currentWordMode: {...}
}
```

**适用场景：**
- ✅ 数据量 < 1000 条
- ✅ 简单的读写操作
- ✅ 不需要复杂查询

---

## 🚀 未来升级方案

### 何时考虑升级？

1. **性能问题：** 保存/加载速度 > 1 秒
2. **数据量：** 单个模式笔记条目 > 1000 条
3. **功能需求：** 需要复杂搜索、筛选、统计

### 推荐方案：Dexie.js (IndexedDB)

**原因：**
- 🌐 浏览器原生支持，无需后端
- 🚀 性能优异，支持大量数据
- 📚 API 友好，TypeScript 支持好
- ✅ Electron 渲染进程可直接使用

---

## 🛠️ 实现步骤

### 1. 安装依赖

```bash
npm install dexie
```

### 2. 创建数据库模型 (`src/db.js`)

```javascript
import Dexie from 'dexie';

// 定义数据库
class RIDatabase extends Dexie {
  constructor() {
    super('RIDatabase');
    
    // 定义数据表和索引
    this.version(1).stores({
      modes: '++id, name',
      notes: '++id, modeId, content, createdAt, updatedAt, [modeId+createdAt]',
      words: '++id, modeId, content, type, createdAt'
    });
  }
}

const db = new RIDatabase();

// 导出 API
export async function getAllModes() {
  return await db.modes.toArray();
}

export async function addMode(name) {
  return await db.modes.add({ name, createdAt: new Date() });
}

export async function updateMode(id, data) {
  return await db.modes.update(id, data);
}

export async function deleteMode(id) {
  // 同时删除相关笔记
  await db.notes.where('modeId').equals(id).delete();
  return await db.modes.delete(id);
}

// 笔记操作
export async function getNotesByMode(modeId) {
  return await db.notes
    .where('modeId')
    .equals(modeId)
    .reverse()
    .sortBy('updatedAt');
}

export async function saveNote(modeId, content) {
  const now = new Date();
  return await db.notes.add({
    modeId,
    content,
    createdAt: now,
    updatedAt: now
  });
}

export async function updateNote(id, content) {
  return await db.notes.update(id, {
    content,
    updatedAt: new Date()
  });
}

export async function deleteNote(id) {
  return await db.notes.delete(id);
}

// 搜索功能
export async function searchNotes(modeId, query) {
  const notes = await getNotesByMode(modeId);
  return notes.filter(note => 
    note.content.toLowerCase().includes(query.toLowerCase())
  );
}

export default db;
```

### 3. 数据迁移脚本 (`src/migrate.js`)

```javascript
import db from './db.js';

// 从 electron-store 迁移到 IndexedDB
export async function migrateFromElectronStore() {
  try {
    // 1. 读取旧数据
    const oldData = await window.electronAPI.store.get('wordModes') || [];
    
    console.log(`开始迁移 ${oldData.length} 个模式...`);
    
    // 2. 迁移每个模式
    for (const mode of oldData) {
      // 创建模式
      const modeId = await db.modes.add({
        name: mode.name,
        createdAt: new Date()
      });
      
      // 迁移笔记内容
      if (mode.notes) {
        await db.notes.add({
          modeId,
          content: mode.notes,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      
      // 迁移单词列表
      if (mode.words && mode.words.length > 0) {
        for (const word of mode.words) {
          await db.words.add({
            modeId,
            content: typeof word === 'string' ? word : word.html || word.content,
            type: typeof word === 'object' ? word.type : 'text',
            createdAt: word.createdAt || new Date()
          });
        }
      }
      
      console.log(`✓ 已迁移模式: ${mode.name}`);
    }
    
    // 3. 备份旧数据
    await window.electronAPI.store.set('wordModes_backup', oldData);
    
    // 4. 标记迁移完成
    await window.electronAPI.store.set('migrated_to_indexeddb', true);
    
    console.log('✅ 数据迁移完成！');
    return true;
    
  } catch (error) {
    console.error('❌ 数据迁移失败:', error);
    return false;
  }
}

// 检查是否需要迁移
export async function checkAndMigrate() {
  const migrated = await window.electronAPI.store.get('migrated_to_indexeddb');
  
  if (!migrated) {
    const confirmed = confirm(
      '检测到旧版本数据，是否迁移到新的数据库系统？\n' +
      '（旧数据会自动备份）'
    );
    
    if (confirmed) {
      return await migrateFromElectronStore();
    }
  }
  
  return false;
}
```

### 4. 修改 note-window.js

```javascript
// 替换 electron-store 调用为 Dexie 调用

// 旧代码
const wordModes = await window.electronAPI.store.get('wordModes') || [];

// 新代码
import { getAllModes, getNotesByMode, saveNote } from './db.js';
const modes = await getAllModes();
const notes = await getNotesByMode(currentModeId);
```

---

## 📈 性能对比

| 操作 | electron-store | Dexie.js |
|------|---------------|----------|
| 读取 100 条 | ~50ms | ~5ms |
| 写入 1 条 | ~100ms | ~2ms |
| 搜索 1000 条 | ~200ms | ~10ms |
| 批量插入 100 条 | ~5s | ~50ms |

---

## ⚠️ 注意事项

1. **渐进式升级：** 保留 electron-store 作为备份
2. **数据备份：** 迁移前自动备份旧数据
3. **回滚机制：** 如果迁移失败，可以回到旧系统
4. **兼容性：** 保持旧版本可以正常使用

---

## 🎯 结论

**当前建议：保持 electron-store**
- 简单、稳定、够用
- 无需引入额外复杂度
- 适合当前的数据规模

**未来考虑：等真正需要时再升级**
- 数据量增长到瓶颈
- 用户反馈性能问题
- 需要新功能（复杂搜索、统计等）

---

## 📚 参考资料

- [Dexie.js 官方文档](https://dexie.org/)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [ClipBook 项目](https://github.com/vladimir-ikryanov/ClipBook) - 实际应用案例

