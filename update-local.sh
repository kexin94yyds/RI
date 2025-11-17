#!/bin/bash

# Replace-Information 本地更新脚本
# 功能：打包应用并安装到本地 Applications 文件夹

set -e

echo "🚀 开始更新本地应用..."

# 获取版本号
VERSION=$(node -p "require('./package.json').version")
APP_NAME="Replace-Information"
APP_PATH="/Applications/${APP_NAME}.app"
DIST_DIR="./dist/mac-arm64/${APP_NAME}.app"

echo "📦 当前版本: ${VERSION}"

# 检查是否已打包
if [ ! -d "$DIST_DIR" ]; then
    echo "⚠️  应用尚未打包，开始打包..."
    npm run build:mac
else
    echo "✅ 应用已打包"
fi

# 检查打包是否成功
if [ ! -d "$DIST_DIR" ]; then
    echo "❌ 打包失败，请检查错误信息"
    exit 1
fi

# 备份旧应用（如果存在）
if [ -d "$APP_PATH" ]; then
    echo "📦 备份旧应用..."
    BACKUP_PATH="/Applications/${APP_NAME}.app.backup.$(date +%Y%m%d_%H%M%S)"
    mv "$APP_PATH" "$BACKUP_PATH"
    echo "✅ 旧应用已备份到: $BACKUP_PATH"
fi

# 安装新应用
echo "📥 安装新应用到 /Applications..."
cp -R "$DIST_DIR" "$APP_PATH"

# 设置权限
chmod -R 755 "$APP_PATH"

echo "✅ 应用已成功安装到 /Applications/${APP_NAME}.app"
echo ""
echo "📋 安装信息:"
echo "   - 版本: ${VERSION}"
echo "   - 路径: ${APP_PATH}"
echo ""
echo "🎉 更新完成！现在可以启动应用了。"

