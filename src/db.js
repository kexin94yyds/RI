// RI Database Manager with IndexedDB
// 参考 insidebar-ai 的成熟实现

const DB_NAME = 'RIDB';
const DB_VERSION = 3; // v3: add 'settings' store for config
const MODES_STORE = 'modes';
const NOTES_STORE = 'notes';
const WORDS_STORE = 'words';
const SETTINGS_STORE = 'settings';

// 验证常量
const MAX_NAME_LENGTH = 100;
const MAX_NOTES_LENGTH = 15000000;  // 提升上限以容纳高清 dataURL
const MAX_WORD_LENGTH = 10000;

let db = null;

const MAX_IDB_ATTEMPTS = 3;
const RETRY_DELAY_BASE_MS = 100;

function isQuotaExceeded(error) {
  if (!error) return false;
  return error.name === 'QuotaExceededError' || error.code === 22;
}

function buildQuotaError() {
  return new Error('存储配额已满。请删除一些旧数据以释放空间。');
}

async function ensureDb() {
  if (db) {
    try {
      db.objectStoreNames;
      return;
    } catch (_) {
      db = null;
    }
  }
  db = await initDB();
}

// 输入清理
function sanitizeString(str, maxLength) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength);
}

// ==================== 初始化数据库 ====================

export async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      db.onclose = () => {
        db = null;
      };
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 创建 modes 表
      if (!db.objectStoreNames.contains(MODES_STORE)) {
        const modesStore = db.createObjectStore(MODES_STORE, {
          keyPath: 'id',
          autoIncrement: true
        });
        modesStore.createIndex('name', 'name', { unique: false });
        modesStore.createIndex('createdAt', 'createdAt', { unique: false });
        // v2: 排序索引
        try { modesStore.createIndex('order', 'order', { unique: false }); } catch (_) {}
      } else if (event.oldVersion < 2) {
        // v2 升级：为已存在的 store 添加索引
        try {
          const tx = event.currentTarget.transaction; // versionchange 事务
          const store = tx.objectStore(MODES_STORE);
          if (!store.indexNames || !store.indexNames.contains('order')) {
            store.createIndex('order', 'order', { unique: false });
          }
        } catch (_) { /* 忽略 */ }
      }

      // 创建 notes 表（存储富文本笔记）
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        const notesStore = db.createObjectStore(NOTES_STORE, {
          keyPath: 'id',
          autoIncrement: true
        });
        notesStore.createIndex('modeId', 'modeId', { unique: false });
        notesStore.createIndex('createdAt', 'createdAt', { unique: false });
        notesStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // 创建 words 表（存储单词/条目）
      if (!db.objectStoreNames.contains(WORDS_STORE)) {
        const wordsStore = db.createObjectStore(WORDS_STORE, {
          keyPath: 'id',
          autoIncrement: true
        });
        wordsStore.createIndex('modeId', 'modeId', { unique: false });
        wordsStore.createIndex('type', 'type', { unique: false });
        wordsStore.createIndex('createdAt', 'createdAt', { unique: false });
        wordsStore.createIndex('[modeId+createdAt]', ['modeId', 'createdAt'], { unique: false });
      }

      // v3: 创建 settings 表（存储配置）
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };
  });
}

// ==================== Modes 管理 ====================

export async function getAllModes() {
  await ensureDb();

  return runWithRetry(() => {
    const transaction = db.transaction([MODES_STORE], 'readonly');
    const store = transaction.objectStore(MODES_STORE);
    const request = store.getAll();
    return wrapRequest(request, value => {
      const arr = value || [];
      // 统一排序：按 order 升序，其次 createdAt 升序
      arr.sort((a, b) => {
        const ao = (typeof a.order === 'number') ? a.order : Number.MAX_SAFE_INTEGER;
        const bo = (typeof b.order === 'number') ? b.order : Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        const ac = a.createdAt || 0; const bc = b.createdAt || 0;
        if (ac !== bc) return ac - bc;
        return (a.id || 0) - (b.id || 0);
      });
      return arr;
    });
  });
}

export async function getMode(id) {
  await ensureDb();

  return runWithRetry(() => {
    const transaction = db.transaction([MODES_STORE], 'readonly');
    const store = transaction.objectStore(MODES_STORE);
    const request = store.get(id);
    return wrapRequest(request, value => value);
  });
}

export async function saveMode(modeData) {
  await ensureDb();

  const mode = {
    // v2: 支持传入 order 用于固定显示顺序
    order: (modeData && typeof modeData.order === 'number') ? modeData.order : undefined,
    name: sanitizeString(modeData.name || '新模式', MAX_NAME_LENGTH),
    notes: sanitizeString(modeData.notes || '', MAX_NOTES_LENGTH),
    createdAt: modeData.createdAt || Date.now(),
    updatedAt: Date.now()
  };

  return runWithRetry(() => {
    const transaction = db.transaction([MODES_STORE], 'readwrite');
    const store = transaction.objectStore(MODES_STORE);
    const request = store.add(mode);
    return wrapRequest(request, resolveValue => ({ ...mode, id: resolveValue }));
  });
}

// v2: 批量更新模式的顺序
export async function updateModesOrder(orderList) {
  await ensureDb();
  if (!Array.isArray(orderList) || orderList.length === 0) return [];
  return runWithRetry(() => new Promise((resolve, reject) => {
    const tx = db.transaction([MODES_STORE], 'readwrite');
    const store = tx.objectStore(MODES_STORE);
    let done = 0, total = orderList.length;
    const results = [];
    orderList.forEach(({ id, order }) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const rec = getReq.result;
        if (!rec) { done++; if (done === total) resolve(results); return; }
        rec.order = order;
        rec.updatedAt = Date.now();
        const putReq = store.put(rec);
        putReq.onsuccess = () => { results.push(rec); done++; if (done === total) resolve(results); };
        putReq.onerror = () => { done++; if (done === total) resolve(results); };
      };
      getReq.onerror = () => { done++; if (done === total) resolve(results); };
    });
  }));
}

export async function updateMode(id, updates) {
  await ensureDb();

  return runWithRetry(() => new Promise((resolve, reject) => {
    const transaction = db.transaction([MODES_STORE], 'readwrite');
    const store = transaction.objectStore(MODES_STORE);

    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const mode = getRequest.result;
      if (!mode) {
        reject(new Error(`模式 ${id} 不存在`));
        return;
      }

      const updatedMode = { ...mode, ...updates, id, updatedAt: Date.now() };
      const putRequest = store.put(updatedMode);
      wrapRequest(putRequest, () => updatedMode).then(resolve).catch(reject);
    };

    getRequest.onerror = () => reject(getRequest.error);
  }));
}

export async function deleteMode(id) {
  await ensureDb();

  return runWithRetry(async () => {
    // 先删除该模式下的所有笔记和单词
    await deleteNotesByMode(id);
    await deleteWordsByMode(id);

    // 再删除模式本身
    const transaction = db.transaction([MODES_STORE], 'readwrite');
    const store = transaction.objectStore(MODES_STORE);
    const request = store.delete(id);
    return wrapRequest(request, () => true);
  });
}

// ==================== Notes 管理 ====================

export async function getNotesByMode(modeId) {
  await ensureDb();

  return runWithRetry(() => {
    const transaction = db.transaction([NOTES_STORE], 'readonly');
    const store = transaction.objectStore(NOTES_STORE);
    const index = store.index('modeId');
    const request = index.getAll(modeId);
    return wrapRequest(request, value => value || []);
  });
}

export async function saveNote(modeId, content) {
  await ensureDb();

  const note = {
    modeId,
    content: sanitizeString(content, MAX_NOTES_LENGTH),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  return runWithRetry(() => {
    const transaction = db.transaction([NOTES_STORE], 'readwrite');
    const store = transaction.objectStore(NOTES_STORE);
    const request = store.add(note);
    return wrapRequest(request, resolveValue => ({ ...note, id: resolveValue }));
  });
}

export async function updateNote(id, content) {
  await ensureDb();

  return runWithRetry(() => new Promise((resolve, reject) => {
    const transaction = db.transaction([NOTES_STORE], 'readwrite');
    const store = transaction.objectStore(NOTES_STORE);

    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const note = getRequest.result;
      if (!note) {
        reject(new Error(`笔记 ${id} 不存在`));
        return;
      }

      const updatedNote = { 
        ...note, 
        content: sanitizeString(content, MAX_NOTES_LENGTH),
        updatedAt: Date.now() 
      };
      const putRequest = store.put(updatedNote);
      wrapRequest(putRequest, () => updatedNote).then(resolve).catch(reject);
    };

    getRequest.onerror = () => reject(getRequest.error);
  }));
}

export async function deleteNote(id) {
  await ensureDb();

  return runWithRetry(() => {
    const transaction = db.transaction([NOTES_STORE], 'readwrite');
    const store = transaction.objectStore(NOTES_STORE);
    const request = store.delete(id);
    return wrapRequest(request, () => true);
  });
}

export async function deleteNotesByMode(modeId) {
  await ensureDb();

  const notes = await getNotesByMode(modeId);
  for (const note of notes) {
    await deleteNote(note.id);
  }
}

// ==================== Words 管理 ====================

export async function getWordsByMode(modeId) {
  await ensureDb();

  return runWithRetry(() => {
    const transaction = db.transaction([WORDS_STORE], 'readonly');
    const store = transaction.objectStore(WORDS_STORE);
    const index = store.index('modeId');
    const request = index.getAll(modeId);
    return wrapRequest(request, value => value || []);
  });
}

export async function saveWord(modeId, wordData) {
  await ensureDb();

  const word = {
    modeId,
    content: typeof wordData === 'string' 
      ? sanitizeString(wordData, MAX_WORD_LENGTH)
      : sanitizeString(wordData.content || wordData.html || '', MAX_WORD_LENGTH),
    type: wordData.type || 'text',
    html: wordData.html || null,
    createdAt: wordData.createdAt || Date.now()
  };

  // 如果是图片，保存额外的图片字段
  if (wordData.type === 'image') {
    word.fileName = wordData.fileName;
    word.thumbFileName = wordData.thumbFileName;
    word.width = wordData.width;
    word.height = wordData.height;
    word.size = wordData.size;
    word.path = wordData.path;
  }

  return runWithRetry(() => {
    const transaction = db.transaction([WORDS_STORE], 'readwrite');
    const store = transaction.objectStore(WORDS_STORE);
    const request = store.add(word);
    return wrapRequest(request, resolveValue => ({ ...word, id: resolveValue }));
  });
}

export async function updateWord(id, wordData) {
  await ensureDb();

  return runWithRetry(() => new Promise((resolve, reject) => {
    const transaction = db.transaction([WORDS_STORE], 'readwrite');
    const store = transaction.objectStore(WORDS_STORE);

    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const existingWord = getRequest.result;
      if (!existingWord) {
        reject(new Error(`单词 ${id} 不存在`));
        return;
      }

      // 合并更新，保持原有的 id, modeId, createdAt
      const updatedWord = {
        ...existingWord,
        ...wordData,
        id,  // 保持原有 ID
        modeId: existingWord.modeId,  // 保持原有 modeId
        createdAt: existingWord.createdAt  // 保持原有创建时间
      };

      // 如果是文本类型，清理内容
      if (updatedWord.content && typeof updatedWord.content === 'string') {
        updatedWord.content = sanitizeString(updatedWord.content, MAX_WORD_LENGTH);
      }

      // 使用 put 更新（保持原 ID）
      const putRequest = store.put(updatedWord);
      wrapRequest(putRequest, () => updatedWord).then(resolve).catch(reject);
    };

    getRequest.onerror = () => reject(getRequest.error);
  }));
}

export async function deleteWord(id) {
  await ensureDb();

  return runWithRetry(() => {
    const transaction = db.transaction([WORDS_STORE], 'readwrite');
    const store = transaction.objectStore(WORDS_STORE);
    const request = store.delete(id);
    return wrapRequest(request, () => true);
  });
}

export async function deleteWordsByMode(modeId) {
  await ensureDb();

  const words = await getWordsByMode(modeId);
  for (const word of words) {
    await deleteWord(word.id);
  }
}

export async function clearAllWords(modeId) {
  return await deleteWordsByMode(modeId);
}

// ==================== 导入导出 ====================

export async function exportAllData() {
  const modes = await getAllModes();
  const allWords = [];
  
  for (const mode of modes) {
    const words = await getWordsByMode(mode.id);
    allWords.push({ modeId: mode.id, words });
  }

  return {
    version: '1.0',
    exportDate: new Date().toISOString(),
    modes,
    words: allWords
  };
}

export async function importData(data) {
  if (!data || !data.modes) {
    throw new Error('无效的导入数据格式');
  }

  const results = {
    imported: 0,
    errors: []
  };

  // 导入模式
  for (const modeData of data.modes) {
    try {
      const { id, ...modeWithoutId } = modeData;
      const newMode = await saveMode(modeWithoutId);
      
      // 导入该模式的单词
      if (data.words) {
        const modeWords = data.words.find(w => w.modeId === id);
        if (modeWords && modeWords.words) {
          for (const word of modeWords.words) {
            await saveWord(newMode.id, word);
          }
        }
      }
      
      results.imported++;
    } catch (error) {
      results.errors.push({ mode: modeData.name, error: error.message });
    }
  }

  return results;
}

// ==================== 辅助函数 ====================

function runWithRetry(operation, attempt = 1) {
  return new Promise((resolve, reject) => {
    try {
      const result = operation();
      Promise.resolve(result).then(resolve).catch((error) => {
        handleIdbError(error, operation, attempt, resolve, reject);
      });
    } catch (error) {
      handleIdbError(error, operation, attempt, resolve, reject);
    }
  });
}

function handleIdbError(error, operation, attempt, resolve, reject) {
  if (isQuotaExceeded(error)) {
    reject(buildQuotaError());
    return;
  }

  if (attempt < MAX_IDB_ATTEMPTS) {
    const delay = RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1);
    setTimeout(() => {
      runWithRetry(operation, attempt + 1).then(resolve).catch(reject);
    }, delay);
  } else {
    reject(error);
  }
}

function wrapRequest(request, mapper) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const value = typeof mapper === 'function' ? mapper(request.result) : request.result;
      resolve(value);
    };
    request.onerror = () => {
      if (isQuotaExceeded(request.error)) {
        reject(buildQuotaError());
      } else {
        reject(request.error);
      }
    };
  });
}

// ==================== Settings 管理 ====================

export async function getSetting(key, defaultValue = null) {
  await ensureDb();

  return runWithRetry(() => {
    const transaction = db.transaction([SETTINGS_STORE], 'readonly');
    const store = transaction.objectStore(SETTINGS_STORE);
    const request = store.get(key);
    return wrapRequest(request, value => value ? value.value : defaultValue);
  });
}

export async function setSetting(key, value) {
  await ensureDb();

  return runWithRetry(() => {
    const transaction = db.transaction([SETTINGS_STORE], 'readwrite');
    const store = transaction.objectStore(SETTINGS_STORE);
    const request = store.put({ key, value });
    return wrapRequest(request);
  });
}

// 初始化数据库
initDB().catch(console.error);
