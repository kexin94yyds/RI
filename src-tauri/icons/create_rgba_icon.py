#!/usr/bin/env python3
import sys
try:
    from PIL import Image
    img = Image.open('icon.png').convert('RGBA')
    img.save('icon.png', 'PNG')
    print("✓ 图标已转换为RGBA格式")
except ImportError:
    print("错误: 需要安装PIL/Pillow")
    sys.exit(1)
except Exception as e:
    print(f"错误: {e}")
    sys.exit(1)
