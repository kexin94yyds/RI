#!/bin/bash

# Replace-Information 清理启动脚本
# 用于解决开机后窗口跳动问题
# 
# 问题原因：
# 1. Electron 单实例锁文件残留
# 2. macOS Gatekeeper 隔离属性
# 3. macOS Spaces 机制与窗口状态冲突

echo "🧹 Replace-Information 清理启动脚本"
echo "=================================="

APP_NAME="Replace-Information"
APP_PATH="/Applications/${APP_NAME}.app"
APP_SUPPORT="$HOME/Library/Application Support/replace-information"

# 1. 强制关闭所有相关进程
echo ""
echo "🛑 1/4 关闭所有 ${APP_NAME} 进程..."
killall -9 "${APP_NAME}" 2>/dev/null
killall -9 "${APP_NAME} Helper" 2>/dev/null
killall -9 "${APP_NAME} Helper (GPU)" 2>/dev/null
killall -9 "${APP_NAME} Helper (Renderer)" 2>/dev/null
sleep 1

# 检查是否还有残留进程
remaining=$(ps aux | grep -i "${APP_NAME}" | grep -v grep | wc -l)
if [ "$remaining" -gt 0 ]; then
    echo "⚠️  发现残留进程，强制终止..."
    pkill -9 -f "${APP_NAME}"
    sleep 1
fi
echo "✓ 进程已清理"

# 2. 清理单实例锁文件
echo ""
echo "🔓 2/4 清理单实例锁文件..."
if [ -d "$APP_SUPPORT" ]; then
    rm -f "$APP_SUPPORT/SingletonLock" 2>/dev/null && echo "  - 已删除 SingletonLock"
    rm -f "$APP_SUPPORT/SingletonCookie" 2>/dev/null && echo "  - 已删除 SingletonCookie"
    rm -f "$APP_SUPPORT/SingletonSocket" 2>/dev/null && echo "  - 已删除 SingletonSocket"
    echo "✓ 锁文件已清理"
else
    echo "⚠️  应用数据目录不存在: $APP_SUPPORT"
fi

# 3. 清理 Gatekeeper 隔离属性
echo ""
echo "🔐 3/4 清理 Gatekeeper 隔离属性..."
if [ -d "$APP_PATH" ]; then
    if xattr -l "$APP_PATH" 2>/dev/null | grep -q "com.apple.quarantine"; then
        xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null
        echo "✓ 已清除隔离属性"
    else
        echo "✓ 无需清理（未发现隔离属性）"
    fi
else
    echo "⚠️  应用不存在: $APP_PATH"
fi

# 4. 启动应用
echo ""
echo "🚀 4/4 启动 ${APP_NAME}..."
if [ -d "$APP_PATH" ]; then
    open "$APP_PATH"
    echo "✓ 应用已启动"
else
    echo "❌ 无法启动：应用不存在"
    exit 1
fi

echo ""
echo "=================================="
echo "✅ 清理启动完成！"
echo ""
echo "📝 验证步骤："
echo "  1. 使用 Shift+⌘+U 呼出主窗口"
echo "  2. 在全屏应用中测试窗口是否不再跳动"
echo "  3. 使用 ⌘+M 测试笔记窗口"
echo ""
