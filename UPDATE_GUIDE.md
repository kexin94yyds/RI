# Replace-Information 更新指南

## 🔄 自动更新功能

Replace-Information 从 v2.1.0 开始支持自动更新功能。应用会自动检测 GitHub Releases 上的新版本并提示用户更新。

## 📦 用户更新流程

### 自动更新（v2.1.0 及以上版本）

1. **打开应用**
   - 应用启动后 5 秒自动检查更新

2. **发现新版本**
   - 弹窗提示：`发现新版本 X.X.X，是否立即下载？`
   - 选项：`[立即下载]` `[稍后提醒]`

3. **下载更新**
   - 点击"立即下载"后台下载
   - 系统通知显示下载进度

4. **安装更新**
   - 下载完成后弹窗：`新版本已下载完成，点击"立即重启"以安装更新`
   - 选项：`[立即重启]` `[稍后安装]`
   - 或者退出应用时自动安装

### 手动更新（首次或任何版本）

如果你的应用版本低于 v2.1.0，需要手动更新一次：

1. **下载最新版本**
   - 访问 [GitHub Releases](https://github.com/kexin94yyds/RI/releases)
   - 下载 `Replace-Information-X.X.X-arm64.dmg`

2. **安装更新**
   - 双击 DMG 文件
   - 拖拽应用到 Applications 文件夹
   - 选择"替换"覆盖旧版本

3. **首次运行**
   - 右键点击应用选择"打开"（首次需要）
   - 以后就可以正常双击打开

## 🚀 开发者发布新版本

### 1. 更新版本号

编辑 `package.json`：
```json
{
  "version": "2.2.0"
}
```

### 2. 提交代码

```bash
git add .
git commit -m "版本 2.2.0 更新内容"
git push origin main
```

### 3. 打包应用

```bash
npm run build:mac
```

生成的文件在 `dist/` 目录：
- `Replace-Information-2.2.0-arm64.dmg` - DMG 安装包
- `Replace-Information-2.2.0-arm64-mac.zip` - ZIP 压缩包
- `latest-mac.yml` - 自动更新配置（重要！）

### 4. 创建 GitHub Release

1. **访问 Releases 页面**
   ```
   https://github.com/kexin94yyds/RI/releases/new
   ```

2. **填写 Release 信息**
   - **Tag version**: `v2.2.0`（必须以 v 开头）
   - **Release title**: `Replace-Information v2.2.0`
   - **描述**: 写更新内容，例如：
     ```markdown
     ## 🎉 新功能
     - 添加了自动更新功能
     - 优化了用户界面
     
     ## 🐛 Bug 修复
     - 修复了某某问题
     
     ## 📦 安装说明
     下载 DMG 文件，拖拽到 Applications 文件夹即可
     ```

3. **上传文件**
   - 拖拽上传以下文件（从 `dist/` 目录）：
     - ✅ `Replace-Information-2.2.0-arm64.dmg`
     - ✅ `Replace-Information-2.2.0-arm64-mac.zip`
     - ✅ `latest-mac.yml`（必须上传，自动更新需要）

4. **发布**
   - 点击 "Publish release"

### 5. 用户自动收到更新

- 所有 v2.1.0+ 的用户打开应用时会收到更新提示
- 用户可以选择立即下载或稍后提醒

## 🔧 版本号规则

遵循语义化版本（Semantic Versioning）：

- **主版本号**（Major）：不兼容的 API 变更
  - 例如：`1.0.0` → `2.0.0`

- **次版本号**（Minor）：新增功能，向下兼容
  - 例如：`2.1.0` → `2.2.0`

- **修订号**（Patch）：Bug 修复，向下兼容
  - 例如：`2.1.0` → `2.1.1`

## 📋 发布检查清单

发布新版本前检查：

- [ ] 更新 `package.json` 中的 `version`
- [ ] 测试所有功能正常
- [ ] 提交并推送代码到 GitHub
- [ ] 运行 `npm run build:mac` 打包
- [ ] 创建 GitHub Release
- [ ] 上传 DMG、ZIP 和 `latest-mac.yml`
- [ ] 填写更新日志
- [ ] 发布 Release

## ⚠️ 注意事项

1. **版本号必须递增**
   - 新版本号必须高于当前版本
   - 例如：`2.1.0` → `2.2.0` ✅
   - 不能：`2.2.0` → `2.1.0` ❌

2. **必须上传 latest-mac.yml**
   - 这个文件包含版本信息和下载链接
   - 没有它自动更新功能无法工作

3. **Tag 必须以 v 开头**
   - 正确：`v2.1.0` ✅
   - 错误：`2.1.0` ❌

4. **首次更新需要手动**
   - v2.1.0 之前的版本没有自动更新功能
   - 需要用户手动下载安装一次

## 🐛 故障排除

### 应用检测不到更新

1. **检查版本号**
   - 确保 Release 的版本号高于当前版本
   - 检查 Tag 格式是否正确（v 开头）

2. **检查文件**
   - 确认 `latest-mac.yml` 已上传
   - 确认 DMG/ZIP 文件已上传

3. **查看日志**
   - 运行 `npm run dev` 查看控制台日志
   - 检查是否有更新检查错误

### 更新下载失败

1. **检查网络**
   - 确保能访问 GitHub
   - 检查防火墙设置

2. **检查文件大小**
   - DMG 文件应该在 90-100MB
   - 文件损坏会导致下载失败

### 更新安装失败

1. **权限问题**
   - 确保有 Applications 文件夹写权限
   - 尝试手动替换应用

2. **应用正在运行**
   - 完全退出应用再安装
   - 检查后台进程

## 📚 相关文档

- [README.md](README.md) - 项目说明
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - 问题排查
- [GitHub Releases](https://github.com/kexin94yyds/RI/releases) - 版本发布页面

## 💡 最佳实践

1. **定期发布更新**
   - 建议每月至少发布一次小更新
   - 重大功能可以单独发布

2. **清晰的更新日志**
   - 详细说明新功能和修复内容
   - 用户能快速了解更新价值

3. **测试再发布**
   - 本地充分测试后再打包
   - 避免频繁发布修复版本

4. **备份用户数据**
   - 提醒用户重要更新前备份
   - 数据存储在 `~/Library/Application Support/replace-information/`





