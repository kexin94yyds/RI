// fileStorage.js - 本地文件系统存储管理
// 将笔记存储为 .md 文件，模式对应文件夹

const DEFAULT_NOTES_DIR = 'Documents/RI-Notes';
const CONFIG_FILE = '.ri-config.json';

let notesDir = null;
let isInitialized = false;

// 获取笔记目录路径
export async function getNotesDir() {
  if (notesDir) return notesDir;
  
  const homeDir = await window.electronAPI.fs.getHomeDir();
  notesDir = `${homeDir}/${DEFAULT_NOTES_DIR}`;
  return notesDir;
}

// 初始化存储目录
export async function initFileStorage() {
  if (isInitialized) return true;
  
  try {
    const dir = await getNotesDir();
    
    // 检查目录是否存在
    const exists = await window.electronAPI.fs.exists(dir);
    if (!exists) {
      // 创建笔记目录
      await window.electronAPI.fs.mkdir(dir);
      console.log('✓ 笔记目录已创建:', dir);
    }
    
    isInitialized = true;
    return true;
  } catch (error) {
    console.error('初始化文件存储失败:', error);
    return false;
  }
}

// 获取配置
export async function getConfig() {
  try {
    const dir = await getNotesDir();
    const configPath = `${dir}/${CONFIG_FILE}`;
    
    const exists = await window.electronAPI.fs.exists(configPath);
    if (!exists) {
      return { modes: [], settings: {} };
    }
    
    const content = await window.electronAPI.fs.readFile(configPath);
    return JSON.parse(content);
  } catch (error) {
    console.error('读取配置失败:', error);
    return { modes: [], settings: {} };
  }
}

// 保存配置
export async function saveConfig(config) {
  try {
    const dir = await getNotesDir();
    const configPath = `${dir}/${CONFIG_FILE}`;
    
    await window.electronAPI.fs.writeFile(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('保存配置失败:', error);
    return false;
  }
}

// 获取模式文件夹路径
export async function getModeDir(modeName) {
  const dir = await getNotesDir();
  // 清理模式名称，移除不安全字符
  const safeName = modeName.replace(/[\\/:*?"<>|]/g, '_');
  return `${dir}/${safeName}`;
}

// 创建模式文件夹
export async function createModeFolder(modeName) {
  try {
    const modeDir = await getModeDir(modeName);
    const exists = await window.electronAPI.fs.exists(modeDir);
    
    if (!exists) {
      await window.electronAPI.fs.mkdir(modeDir);
      console.log('✓ 模式文件夹已创建:', modeDir);
    }
    
    return modeDir;
  } catch (error) {
    console.error('创建模式文件夹失败:', error);
    throw error;
  }
}

// 获取所有模式（从文件夹）
export async function getAllModesFromFiles() {
  try {
    const dir = await getNotesDir();
    const items = await window.electronAPI.fs.readDir(dir);
    
    // 过滤出文件夹（排除配置文件和隐藏文件）
    const modes = items
      .filter(item => item.isDirectory && !item.name.startsWith('.'))
      .map(item => ({
        name: item.name,
        path: `${dir}/${item.name}`
      }));
    
    return modes;
  } catch (error) {
    console.error('获取模式列表失败:', error);
    return [];
  }
}

// 生成笔记文件名
function generateNoteFileName(title) {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const safeTitle = (title || 'Untitled')
    .replace(/[\\/:*?"<>|]/g, '_')
    .substring(0, 50);
  return `${date}-${safeTitle}.md`;
}

// 保存笔记到文件
export async function saveNoteToFile(modeName, content, existingFileName = null) {
  try {
    const modeDir = await getModeDir(modeName);
    
    // 确保模式文件夹存在
    await createModeFolder(modeName);
    
    // 从内容提取标题（第一行）
    const title = extractTitleFromContent(content);
    
    // 生成或使用现有文件名
    const fileName = existingFileName || generateNoteFileName(title);
    const filePath = `${modeDir}/${fileName}`;
    
    // 转换 HTML 到 Markdown（如果需要）
    const markdown = convertToMarkdown(content);
    
    await window.electronAPI.fs.writeFile(filePath, markdown);
    console.log('✓ 笔记已保存:', filePath);
    
    return { fileName, filePath };
  } catch (error) {
    console.error('保存笔记失败:', error);
    throw error;
  }
}

// 读取笔记文件
export async function readNoteFile(modeName, fileName) {
  try {
    const modeDir = await getModeDir(modeName);
    const filePath = `${modeDir}/${fileName}`;
    
    const content = await window.electronAPI.fs.readFile(filePath);
    return content;
  } catch (error) {
    console.error('读取笔记失败:', error);
    throw error;
  }
}

// 获取模式下的所有笔记
export async function getNotesByModeFromFiles(modeName) {
  try {
    const modeDir = await getModeDir(modeName);
    
    const exists = await window.electronAPI.fs.exists(modeDir);
    if (!exists) return [];
    
    const items = await window.electronAPI.fs.readDir(modeDir);
    
    // 过滤出 .md 文件
    const notes = items
      .filter(item => item.isFile && item.name.endsWith('.md'))
      .map(item => ({
        fileName: item.name,
        path: `${modeDir}/${item.name}`,
        // 从文件名提取日期和标题
        ...parseNoteFileName(item.name)
      }));
    
    // 按日期降序排序
    notes.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    
    return notes;
  } catch (error) {
    console.error('获取笔记列表失败:', error);
    return [];
  }
}

// 删除笔记文件
export async function deleteNoteFile(modeName, fileName) {
  try {
    const modeDir = await getModeDir(modeName);
    const filePath = `${modeDir}/${fileName}`;
    
    await window.electronAPI.fs.delete(filePath);
    console.log('✓ 笔记已删除:', filePath);
    return true;
  } catch (error) {
    console.error('删除笔记失败:', error);
    throw error;
  }
}

// 从文件名解析日期和标题
function parseNoteFileName(fileName) {
  // 格式: YYYY-MM-DD-标题.md
  const match = fileName.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/);
  if (match) {
    return {
      date: match[1],
      title: match[2]
    };
  }
  // 无日期格式
  return {
    date: null,
    title: fileName.replace('.md', '')
  };
}

// 从内容提取标题
function extractTitleFromContent(content) {
  if (!content) return 'Untitled';
  
  // 如果是 HTML，提取文本
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;
  const text = tempDiv.textContent || tempDiv.innerText || '';
  
  // 获取第一行
  const firstLine = text.split('\n')[0].trim();
  return firstLine || 'Untitled';
}

// 简单的 HTML 到 Markdown 转换
function convertToMarkdown(content) {
  if (!content) return '';
  
  // 如果已经是纯文本/Markdown，直接返回
  if (!content.includes('<')) return content;
  
  let markdown = content;
  
  // 标题转换
  markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n');
  markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n');
  markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n');
  markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n');
  markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n');
  markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n');
  
  // 粗体和斜体
  markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  
  // 链接
  markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  
  // 图片
  markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)');
  markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)');
  
  // 列表
  markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  markdown = markdown.replace(/<\/?[uo]l[^>]*>/gi, '\n');
  
  // 段落和换行
  markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
  markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
  markdown = markdown.replace(/<div[^>]*>(.*?)<\/div>/gi, '$1\n');
  
  // 移除剩余的 HTML 标签
  markdown = markdown.replace(/<[^>]+>/g, '');
  
  // 清理多余的空行
  markdown = markdown.replace(/\n{3,}/g, '\n\n');
  
  // 解码 HTML 实体
  markdown = markdown.replace(/&nbsp;/g, ' ');
  markdown = markdown.replace(/&lt;/g, '<');
  markdown = markdown.replace(/&gt;/g, '>');
  markdown = markdown.replace(/&amp;/g, '&');
  markdown = markdown.replace(/&quot;/g, '"');
  
  return markdown.trim();
}

// 获取上次导出时间
async function getLastExportTime() {
  const config = await getConfig();
  return config.lastExportTime || 0;
}

// 保存导出时间
async function saveLastExportTime(time) {
  const config = await getConfig();
  config.lastExportTime = time;
  await saveConfig(config);
}

// 增量导出：只导出新增/修改的笔记（内存优化版）
export async function exportAllDataToFiles(modes, getNotesByMode, forceAll = false) {
  try {
    await initFileStorage();
    
    const lastExportTime = forceAll ? 0 : await getLastExportTime();
    const currentTime = Date.now();
    let exportedCount = 0;
    let skippedCount = 0;
    
    // 用于去重的 Set（只存储文件名哈希，减少内存）
    const exportedFiles = new Set();
    
    for (const mode of modes) {
      // 创建模式文件夹
      await createModeFolder(mode.name);
      
      // 获取该模式的笔记
      const notes = await getNotesByMode(mode.id);
      
      // 分批处理，每批 50 条，避免内存爆炸
      const batchSize = 50;
      for (let i = 0; i < notes.length; i += batchSize) {
        const batch = notes.slice(i, i + batchSize);
        
        for (const note of batch) {
          if (note.content || note.html) {
            const content = note.html || note.content;
            const noteTime = note.createdAt || note.updatedAt || Date.now();
            
            // 增量导出：跳过上次导出之前的笔记
            if (!forceAll && noteTime < lastExportTime) {
              skippedCount++;
              continue;
            }
            
            const date = new Date(noteTime).toISOString().split('T')[0];
            const title = extractTitleFromContent(content);
            const fileName = `${date}-${title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 50)}.md`;
            
            // 去重：相同文件名只导出一次
            const fileKey = `${mode.name}/${fileName}`;
            if (exportedFiles.has(fileKey)) {
              skippedCount++;
              continue;
            }
            exportedFiles.add(fileKey);
            
            await saveNoteToFile(mode.name, content, fileName);
            exportedCount++;
          }
        }
        
        // 每批处理后释放内存
        if (typeof global !== 'undefined' && global.gc) {
          global.gc();
        }
      }
      
      // 处理完一个模式后，清空 notes 引用
      notes.length = 0;
    }
    
    // 保存本次导出时间
    await saveLastExportTime(currentTime);
    
    console.log(`✓ 导出完成，新增 ${exportedCount} 条，跳过 ${skippedCount} 条`);
    return exportedCount;
  } catch (error) {
    console.error('导出数据失败:', error);
    throw error;
  }
}
