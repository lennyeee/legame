# 乐 GAME · MVP

Phaser 3 + TypeScript + Vite 的最小 H5 游戏项目。

## 本机启动

在此文件夹打开 PowerShell，运行：

```powershell
npm run dev
```

保持终端打开，在浏览器访问终端显示的 Local 地址（通常是 http://localhost:5173）。
页面应显示米白色背景和居中的「乐 GAME · MVP」。按 Ctrl+C 停止服务。
首次下载本项目到其他电脑时，需要先安装 Node.js，然后在项目目录执行 `npm ci`。

## 检查和构建

```powershell
npm run typecheck
npm run build
npm run preview
```

`build` 会先检查 TypeScript，再生成 `dist/`。`preview` 用于本机预览构建结果。

## 结构

- `index.html`：网页入口和手机 viewport 设置。
- `src/main.ts`：Phaser 初始化及缩放配置。
- `src/scenes/GameScene.ts`：最基础场景，仅显示标题文字。
- `src/style.css`：页面背景和容器尺寸。
- `tsconfig.json`：TypeScript 配置。

逻辑尺寸为 750×1334，采用 FIT 等比缩放和 CENTER_BOTH 居中；不同宽高比下可能留白，背景保持米白色。
后续功能按需新增模块，目前不包含任何额外游戏系统。
