# RI 本地文件系统存储方案

## 目标
将笔记从 IndexedDB 迁移到本地文件系统，类似 vmark 的存储方式。

## 存储结构

```
~/Documents/RI-Notes/          # 默认笔记目录（可配置）
├── .ri-config.json            # 配置文件（模式列表、设置等）
├── 想法/                      # 模式文件夹
│   ├── 2024-01-27-笔记标题.md
│   └── 2024-01-28-另一个笔记.md
├── 学习/
│   └── ...
└── 工作/
    └── ...
```

## 实现步骤

### Phase 1: 基础文件操作 API
- [ ] 添加文件系统 API 到 electron-preload.js
  - readDir: 读取目录
  - readFile: 读取文件
  - writeFile: 写入文件
  - mkdir: 创建目录
  - exists: 检查文件/目录是否存在
  - rename: 重命名
  - delete: 删除

### Phase 2: 笔记目录管理
- [ ] 添加设置：笔记存储目录（默认 ~/Documents/RI-Notes）
- [ ] 首次启动时创建目录结构
- [ ] 模式 = 文件夹

### Phase 3: 笔记文件读写
- [ ] 保存笔记时写入 .md 文件
- [ ] 文件名格式：YYYY-MM-DD-标题.md
- [ ] 加载笔记时读取文件列表
- [ ] 支持富文本转 Markdown

### Phase 4: 数据迁移
- [ ] 从 IndexedDB 导出现有数据
- [ ] 转换为文件系统格式
- [ ] 提供迁移向导

### Phase 5: Git 集成（可选）
- [ ] 自动 git init
- [ ] 自动 commit
- [ ] 可配置远程仓库同步

## 优势
1. 数据可靠性：文件系统比 IndexedDB 更稳定
2. 可备份：直接复制文件夹即可备份
3. 可版本控制：配合 Git 使用
4. 可跨应用：其他 Markdown 编辑器也能打开
5. 可搜索：系统级搜索（Spotlight）可用

## 兼容性考虑
- 保留 IndexedDB 作为缓存/临时存储
- 提供导入/导出功能
- 渐进式迁移，不强制用户立即切换
