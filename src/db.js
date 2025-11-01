// RI Database Manager with IndexedDB
// 参考 insidebar-ai 的成熟实现

const DB_NAME = 'RIDB';
const DB_VERSION = 1;
const MODES_STORE = 'modes';
const NOTES_STORE = 'notes';
const WORDS_STORE = 'words';

// 验证常量
const MAX_NAME_LENGTH = 100;
const MAX_NOTES_LENGTH = 500000;  // 笔记内容可以很长
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
    return wrapRequest(request, value => value || []);
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

  return runWithRetry(() => {
    const transaction = db.transaction([WORDS_STORE], 'readwrite');
    const store = transaction.objectStore(WORDS_STORE);
    const request = store.add(word);
    return wrapRequest(request, resolveValue => ({ ...word, id: resolveValue }));
  });
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

// 初始化数据库
initDB().catch(console.error);

