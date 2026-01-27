// gitSync.js - Git 同步功能
// 将笔记目录自动同步到 GitHub

import { getNotesDir } from './fileStorage.js';

// 检查 Git 是否已初始化
export async function isGitInitialized() {
  try {
    const notesDir = await getNotesDir();
    const gitDir = `${notesDir}/.git`;
    return await window.electronAPI.fs.exists(gitDir);
  } catch (error) {
    console.error('检查 Git 状态失败:', error);
    return false;
  }
}

// 执行 Git 命令
async function execGitCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    // 通过 IPC 调用主进程执行命令
    window.electronAPI.git.exec(command, cwd)
      .then(resolve)
      .catch(reject);
  });
}

// 初始化 Git 仓库
export async function initGitRepo() {
  try {
    const notesDir = await getNotesDir();
    
    // 检查是否已初始化
    const initialized = await isGitInitialized();
    if (initialized) {
      console.log('Git 仓库已存在');
      return { success: true, message: 'Git 仓库已存在' };
    }
    
    // 初始化 Git
    await execGitCommand('git init', notesDir);
    
    // 创建 .gitignore
    const gitignore = `# macOS
.DS_Store

# Temporary files
*.tmp
*.bak
`;
    await window.electronAPI.fs.writeFile(`${notesDir}/.gitignore`, gitignore);
    
    // 初始提交
    await execGitCommand('git add .', notesDir);
    await execGitCommand('git commit -m "Initial commit: RI Notes"', notesDir);
    
    console.log('✓ Git 仓库已初始化');
    return { success: true, message: 'Git 仓库已初始化' };
  } catch (error) {
    console.error('初始化 Git 失败:', error);
    return { success: false, message: error.message };
  }
}

// 提交更改
export async function commitChanges(message = null) {
  try {
    const notesDir = await getNotesDir();
    
    // 检查是否有更改
    const status = await execGitCommand('git status --porcelain', notesDir);
    if (!status || status.trim() === '') {
      return { success: true, message: '没有需要提交的更改' };
    }
    
    // 生成提交消息
    const commitMessage = message || `Auto-save: ${new Date().toLocaleString('zh-CN')}`;
    
    // 添加所有更改
    await execGitCommand('git add .', notesDir);
    
    // 提交
    await execGitCommand(`git commit -m "${commitMessage}"`, notesDir);
    
    console.log('✓ 更改已提交:', commitMessage);
    return { success: true, message: '更改已提交' };
  } catch (error) {
    console.error('提交失败:', error);
    return { success: false, message: error.message };
  }
}

// 推送到远程仓库
export async function pushToRemote() {
  try {
    const notesDir = await getNotesDir();
    
    // 检查是否有远程仓库
    const remotes = await execGitCommand('git remote -v', notesDir);
    if (!remotes || !remotes.includes('origin')) {
      return { success: false, message: '未配置远程仓库，请先设置 GitHub 仓库地址' };
    }
    
    // 推送
    await execGitCommand('git push origin main', notesDir);
    
    console.log('✓ 已推送到 GitHub');
    return { success: true, message: '已推送到 GitHub' };
  } catch (error) {
    // 尝试 master 分支
    try {
      const notesDir = await getNotesDir();
      await execGitCommand('git push origin master', notesDir);
      return { success: true, message: '已推送到 GitHub' };
    } catch (e) {
      console.error('推送失败:', error);
      return { success: false, message: error.message };
    }
  }
}

// 设置远程仓库
export async function setRemoteRepo(repoUrl) {
  try {
    const notesDir = await getNotesDir();
    
    // 检查是否已有远程
    const remotes = await execGitCommand('git remote -v', notesDir);
    
    if (remotes && remotes.includes('origin')) {
      // 更新远程地址
      await execGitCommand(`git remote set-url origin ${repoUrl}`, notesDir);
    } else {
      // 添加远程
      await execGitCommand(`git remote add origin ${repoUrl}`, notesDir);
    }
    
    console.log('✓ 远程仓库已设置:', repoUrl);
    return { success: true, message: '远程仓库已设置' };
  } catch (error) {
    console.error('设置远程仓库失败:', error);
    return { success: false, message: error.message };
  }
}

// 获取远程仓库地址
export async function getRemoteUrl() {
  try {
    const notesDir = await getNotesDir();
    const result = await execGitCommand('git remote get-url origin', notesDir);
    return result ? result.trim() : null;
  } catch (error) {
    return null;
  }
}

// 一键同步到 GitHub（提交 + 推送）
export async function syncToGitHub(commitMessage = null) {
  try {
    // 1. 检查 Git 是否初始化
    const initialized = await isGitInitialized();
    if (!initialized) {
      const initResult = await initGitRepo();
      if (!initResult.success) {
        return initResult;
      }
    }
    
    // 2. 提交更改
    const commitResult = await commitChanges(commitMessage);
    if (!commitResult.success && commitResult.message !== '没有需要提交的更改') {
      return commitResult;
    }
    
    // 3. 检查远程仓库
    const remoteUrl = await getRemoteUrl();
    if (!remoteUrl) {
      return { 
        success: false, 
        needsRemote: true,
        message: '请先设置 GitHub 仓库地址' 
      };
    }
    
    // 4. 推送
    const pushResult = await pushToRemote();
    return pushResult;
  } catch (error) {
    console.error('同步失败:', error);
    return { success: false, message: error.message };
  }
}

// 获取 Git 状态
export async function getGitStatus() {
  try {
    const notesDir = await getNotesDir();
    const initialized = await isGitInitialized();
    
    if (!initialized) {
      return { initialized: false };
    }
    
    const status = await execGitCommand('git status --porcelain', notesDir);
    const remoteUrl = await getRemoteUrl();
    
    // 获取最后提交时间
    let lastCommit = null;
    try {
      const log = await execGitCommand('git log -1 --format=%ci', notesDir);
      lastCommit = log ? log.trim() : null;
    } catch (e) {}
    
    return {
      initialized: true,
      hasChanges: status && status.trim() !== '',
      remoteUrl,
      lastCommit
    };
  } catch (error) {
    console.error('获取 Git 状态失败:', error);
    return { initialized: false, error: error.message };
  }
}
