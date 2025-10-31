# 毛玻璃悬浮窗口样式更改文档

> 记录时间：2025-10-30  
> 版本：Electron 桌面版 v2.1.0  
> 效果：现代毛玻璃悬浮窗口 + 半透明背景 + 圆角阴影

---

## 📋 概述

将 Chrome 插件转换为 Electron 桌面应用后，实现了现代化的毛玻璃悬浮窗口效果，主要包括：
- ✅ 透明窗口 + 毛玻璃模糊效果
- ✅ 圆角边框 + 优雅阴影
- ✅ 半透明卡片布局
- ✅ 渐变蓝紫色按钮
- ✅ 流畅的交互动画

---

## 🔧 核心配置更改

### 1. Electron 主进程配置 (`electron-main.js`)

#### 窗口配置
```javascript
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,                    // 窗口宽度：420px
    height: 680,                   // 窗口高度：680px
    show: false,                   // 初始隐藏
    frame: false,                  // 无边框
    resizable: true,               // 可调整大小
    transparent: true,             // 🔑 启用透明窗口
    alwaysOnTop: true,            // 始终置顶
    skipTaskbar: false,           
    hasShadow: true,              // 🔑 窗口阴影
    roundedCorners: true,         // 🔑 圆角
    vibrancy: 'hud',              // 🔑 macOS 毛玻璃效果
    visualEffectState: 'active',  // 🔑 视觉效果始终激活
    backgroundColor: '#00000000',  // 🔑 完全透明背景
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      backgroundThrottling: false  // 防止后台节流
    }
  });
}
```

**关键参数说明：**
- `transparent: true` - 启用窗口透明
- `vibrancy: 'hud'` - macOS 原生毛玻璃效果（HUD 风格）
- `backgroundColor: '#00000000'` - 完全透明的背景色
- `hasShadow: true` - 系统级窗口阴影
- `roundedCorners: true` - 圆角窗口边框

---

## 🎨 CSS 样式更改 (`style.css`)

### 2. 主容器样式 (body)

```css
body {
  font-family: 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif;
  width: 100%;
  height: 100vh;
  margin: 0;
  padding: 16px;
  
  /* 🔑 毛玻璃效果核心 */
  background: rgba(255, 255, 255, 0.85);           /* 半透明白色背景 */
  backdrop-filter: blur(40px) saturate(180%);      /* 背景模糊 + 饱和度提升 */
  -webkit-backdrop-filter: blur(40px) saturate(180%); /* Safari/Chromium 兼容 */
  
  /* 圆角和阴影 */
  border-radius: 16px;                             /* 16px 圆角 */
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2),       /* 外阴影 */
              0 0 0 1px rgba(255, 255, 255, 0.5) inset; /* 内边框高光 */
  
  box-sizing: border-box;
  overflow-y: auto;
}
```

**效果说明：**
- `rgba(255, 255, 255, 0.85)` - 85% 不透明度的白色背景
- `backdrop-filter: blur(40px)` - 40px 高斯模糊，产生毛玻璃效果
- `saturate(180%)` - 饱和度提升 180%，让背景色彩更鲜艳
- `border-radius: 16px` - 大圆角，现代化设计
- `box-shadow` 双层阴影 - 外阴影 + 内边框高光

---

### 3. 卡片区域样式 (.section)

```css
.section {
  margin-bottom: 16px;
  padding: 16px;
  
  /* 🔑 二级毛玻璃效果 */
  background: rgba(255, 255, 255, 0.5);        /* 50% 不透明度 */
  backdrop-filter: blur(10px);                 /* 10px 模糊 */
  -webkit-backdrop-filter: blur(10px);
  
  /* 边框和阴影 */
  border-radius: 12px;                         /* 12px 圆角 */
  border: 1px solid rgba(255, 255, 255, 0.6);  /* 半透明白色边框 */
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);   /* 轻微阴影 */
}
```

**层级设计：**
- 主容器：85% 不透明度 + 40px 模糊
- 卡片区域：50% 不透明度 + 10px 模糊
- 形成视觉层次感

---

### 4. 剪贴板显示区域 (.clipboard-word, .review-word)

```css
.clipboard-word, .review-word {
  font-size: 1.1em;
  margin-bottom: 12px;
  padding: 14px;
  color: #333;
  
  /* 内容区域样式 */
  background: rgba(255, 255, 255, 0.7);        /* 70% 不透明度 */
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.05);       /* 轻微边框 */
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);   /* 轻微阴影 */
  text-align: center;
}
```

---

### 5. 按钮样式 (button)

```css
button {
  margin: 6px 0;
  width: 100%;
  padding: 10px 0;
  border: none;
  border-radius: 10px;
  
  /* 🔑 渐变背景 */
  background: linear-gradient(135deg, #667eea 0%, #5a67d8 100%);  /* 蓝紫色渐变 */
  
  color: #fff;
  font-size: 0.95em;
  font-weight: 500;
  cursor: pointer;
  
  /* 🔑 流畅动画 */
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);  /* 缓动函数 */
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);    /* 彩色阴影 */
}

button:hover {
  background: linear-gradient(135deg, #5a67d8 0%, #4c51bf 100%);  /* 深色渐变 */
  transform: translateY(-2px);                         /* 向上提升 2px */
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);    /* 增强阴影 */
}

button:active {
  transform: translateY(0);                            /* 恢复位置 */
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);     /* 减弱阴影 */
}
```

**按钮设计亮点：**
- 渐变背景：从 `#667eea` 到 `#5a67d8` 的 135° 线性渐变
- 悬停效果：向上提升 2px + 阴影加深
- 点击效果：恢复原位 + 阴影减弱
- 缓动函数：`cubic-bezier(0.4, 0, 0.2, 1)` 提供自然流畅的动画

---

### 6. 单词列表样式 (.word-list)

```css
.word-list {
  margin-top: 12px;
  max-height: 200px;
  overflow-y: auto;
  
  /* 列表容器毛玻璃效果 */
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 10px;
  padding: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}
```

---

## 🎯 关键技术点

### 1. 毛玻璃效果实现

**CSS 属性：**
```css
backdrop-filter: blur(40px) saturate(180%);
-webkit-backdrop-filter: blur(40px) saturate(180%);
```

- `blur(40px)` - 背景模糊程度
- `saturate(180%)` - 背景饱和度
- `-webkit-` 前缀 - 确保 Chromium 引擎兼容

**Electron 配置：**
```javascript
transparent: true,        // 必须启用透明窗口
vibrancy: 'hud',         // macOS 原生毛玻璃
backgroundColor: '#00000000'  // 透明背景
```

---

### 2. 透明度层次设计

```
窗口背景：rgba(255, 255, 255, 0)      - 完全透明
↓
主容器：  rgba(255, 255, 255, 0.85)   - 85% 不透明 + 40px 模糊
↓
卡片：    rgba(255, 255, 255, 0.5)    - 50% 不透明 + 10px 模糊
↓
内容：    rgba(255, 255, 255, 0.7)    - 70% 不透明
```

**层次感原理：**
- 每一层都有独立的透明度和模糊度
- 形成由外到内的视觉深度
- 多层毛玻璃叠加产生高级感

---

### 3. 色彩方案

**主色调：**
- 背景：白色半透明 `rgba(255, 255, 255, 0.85)`
- 按钮渐变：蓝紫色 `#667eea → #5a67d8`
- 文字：深灰色 `#333`

**阴影颜色：**
- 窗口阴影：`rgba(0, 0, 0, 0.2)` - 20% 黑色
- 按钮阴影：`rgba(102, 126, 234, 0.3)` - 30% 主色调
- 卡片阴影：`rgba(0, 0, 0, 0.08)` - 8% 黑色

---

### 4. 圆角规范

```
主容器 (body)：         16px  - 大圆角
卡片区域 (.section)：    12px  - 中圆角
内容区域 (clipboard)：   10px  - 小圆角
按钮 (button)：         10px  - 小圆角
```

**设计原则：**
- 外层元素使用更大的圆角
- 内层元素使用较小的圆角
- 保持视觉协调性

---

### 5. 动画参数

**缓动函数：**
```css
transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
```

- `0.3s` - 动画时长 300ms
- `cubic-bezier(0.4, 0, 0.2, 1)` - Material Design 标准缓动曲线
- 提供自然、流畅的过渡效果

**按钮交互：**
```
默认状态：     transform: translateY(0)      + shadow: 4px
悬停状态：     transform: translateY(-2px)   + shadow: 6px
点击状态：     transform: translateY(0)      + shadow: 2px
```

---

## 📊 样式对比

### 修改前（Chrome 插件风格）
```css
body {
  width: 300px;
  margin: 10px;
  background: #f8f9fa;  /* 纯色背景 */
}

button {
  background: #1976d2;   /* 纯色按钮 */
  border-radius: 4px;    /* 小圆角 */
}
```

### 修改后（现代毛玻璃风格）
```css
body {
  width: 100%;
  margin: 0;
  padding: 16px;
  background: rgba(255, 255, 255, 0.85);           /* 半透明 */
  backdrop-filter: blur(40px) saturate(180%);      /* 毛玻璃 */
  border-radius: 16px;                             /* 大圆角 */
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);      /* 阴影 */
}

button {
  background: linear-gradient(135deg, #667eea 0%, #5a67d8 100%);  /* 渐变 */
  border-radius: 10px;                             /* 更大圆角 */
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);  /* 流畅动画 */
}
```

---

## 🚀 最终效果

### 视觉特性
✅ **毛玻璃模糊背景** - 40px 高斯模糊 + 180% 饱和度  
✅ **半透明多层设计** - 85% → 50% → 70% 透明度层次  
✅ **圆角窗口** - 16px 主圆角 + 系统级阴影  
✅ **渐变按钮** - 蓝紫色线性渐变 + 悬停动画  
✅ **流畅交互** - 300ms 缓动动画 + 提升效果  

### 技术实现
✅ Electron 透明窗口 (`transparent: true`)  
✅ macOS 原生毛玻璃 (`vibrancy: 'hud'`)  
✅ CSS `backdrop-filter` 模糊效果  
✅ 多层半透明容器嵌套  
✅ Material Design 缓动曲线  

### 兼容性
✅ macOS - 完整支持（原生 vibrancy）  
✅ Windows - 支持 CSS 毛玻璃效果  
✅ Linux - 基础透明效果  

---

## 📝 使用说明

### 如何应用这些样式

1. **确保 Electron 配置正确**
   ```javascript
   // electron-main.js
   transparent: true,
   vibrancy: 'hud',
   backgroundColor: '#00000000'
   ```

2. **在 CSS 中使用 backdrop-filter**
   ```css
   backdrop-filter: blur(40px) saturate(180%);
   -webkit-backdrop-filter: blur(40px) saturate(180%);
   ```

3. **设置半透明背景**
   ```css
   background: rgba(255, 255, 255, 0.85);
   ```

### 自定义调整

**修改模糊程度：**
```css
backdrop-filter: blur(20px);   /* 轻度模糊 */
backdrop-filter: blur(40px);   /* 中度模糊（当前） */
backdrop-filter: blur(60px);   /* 重度模糊 */
```

**修改透明度：**
```css
background: rgba(255, 255, 255, 0.95);   /* 更不透明 */
background: rgba(255, 255, 255, 0.85);   /* 当前设置 */
background: rgba(255, 255, 255, 0.70);   /* 更透明 */
```

**修改按钮颜色：**
```css
/* 蓝色系（当前） */
background: linear-gradient(135deg, #667eea 0%, #5a67d8 100%);

/* 紫色系 */
background: linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%);

/* 粉色系 */
background: linear-gradient(135deg, #f472b6 0%, #ec4899 100%);
```

---

## 🔍 注意事项

### 1. 性能考虑
- `backdrop-filter` 是 GPU 加速属性，性能良好
- 多层嵌套不宜超过 3 层
- 模糊值建议不超过 60px

### 2. 兼容性
- macOS：完美支持原生毛玻璃
- Windows 10+：支持 CSS backdrop-filter
- Linux：部分支持，需测试

### 3. 调试技巧
- 使用 `--enable-logging` 查看控制台
- 临时禁用 `transparent: true` 查看布局
- 使用开发者工具检查 CSS

---

## 📚 参考资源

- [Electron BrowserWindow 文档](https://www.electronjs.org/docs/latest/api/browser-window)
- [CSS backdrop-filter MDN](https://developer.mozilla.org/zh-CN/docs/Web/CSS/backdrop-filter)
- [macOS vibrancy 效果](https://www.electronjs.org/docs/latest/tutorial/window-customization#set-vibrancy-effect-macos)

---

**文档版本：** 1.0  
**最后更新：** 2025-10-30  
**维护者：** AI Assistant  
**项目：** 单词记录器 Electron 版  


