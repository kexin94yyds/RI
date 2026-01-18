#!/bin/bash
# 启动 Mac 独立版笔记本应用
if [ ! -f package.json ]; then
    cp package-mac.json package.json
fi
npm install
npm start
