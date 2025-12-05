#!/bin/bash

echo "🔄 开始更新 Replace-Information..."

# 1. 重新打包
echo "📦 1/5 重新打包..."
cd "/Users/apple/信息置换起/RI"
npm run build:mac

if [ $? -ne 0 ]; then
    echo "❌ 打包失败！"
    exit 1
fi

# 2. 停止应用并清理锁文件
echo "🛑 2/5 停止旧版本并清理..."
killall -9 "Replace-Information" 2>/dev/null
killall -9 "Replace-Information Helper" 2>/dev/null
killall -9 "Replace-Information Helper (GPU)" 2>/dev/null
killall -9 "Replace-Information Helper (Renderer)" 2>/dev/null
sleep 1

# 清理单实例锁文件（防止开机后窗口跳动问题）
APP_SUPPORT="$HOME/Library/Application Support/replace-information"
if [ -d "$APP_SUPPORT" ]; then
    rm -f "$APP_SUPPORT/SingletonLock" 2>/dev/null
    rm -f "$APP_SUPPORT/SingletonCookie" 2>/dev/null
    rm -f "$APP_SUPPORT/SingletonSocket" 2>/dev/null
    echo "  ✓ 已清理单实例锁文件"
fi

# 3. 备份并替换 Contents 目录
echo "📋 3/5 替换应用内容..."
if [ ! -d "/Applications/Replace-Information.app" ]; then
    echo "⚠️  应用不存在，直接复制整个应用..."
    cp -R dist/mac-arm64/Replace-Information.app /Applications/
else
    # 备份原 Contents
    if [ -d "/Applications/Replace-Information.app/Contents" ]; then
        echo "💾 备份原 Contents 目录..."
        mv /Applications/Replace-Information.app/Contents /Applications/Replace-Information.app/Contents.backup.$(date +%Y%m%d_%H%M%S)
    fi
    # 复制新的 Contents
    cp -R dist/mac-arm64/Replace-Information.app/Contents /Applications/Replace-Information.app/
    
    if [ ! -d "/Applications/Replace-Information.app/Contents" ]; then
        echo "❌ 替换失败！"
        exit 1
    fi
fi

# 4. 清理 Gatekeeper 隔离属性（防止首次运行问题）
echo "🔐 4/5 清理隔离属性..."
if xattr -l "/Applications/Replace-Information.app" 2>/dev/null | grep -q "com.apple.quarantine"; then
    xattr -dr com.apple.quarantine "/Applications/Replace-Information.app" 2>/dev/null
    echo "  ✓ 已清除 Gatekeeper 隔离属性"
else
    echo "  ✓ 无需清理隔离属性"
fi

# 5. 启动新版本
echo "🚀 5/5 启动新版本..."
open /Applications/Replace-Information.app

echo ""
echo "✅ 更新完成！"
echo ""
echo "📝 验证步骤："
echo "  1. 使用快捷键唤出应用"
echo "  2. 测试窗口在全屏应用前是否不再跳动"
echo ""





