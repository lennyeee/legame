# 乐 GAME · MVP

Phaser 3 + TypeScript + Vite 的 H5 游戏基础交互原型。

## 本机启动

在此文件夹打开 PowerShell，运行：

```powershell
npm run dev
```

保持终端打开，在浏览器访问终端显示的 Local 地址（通常是 http://localhost:5173）。
页面显示米白色主界面、镜像棋盘、资源和征兵槽位。按 Ctrl+C 停止服务。
首次下载本项目到其他电脑时，需要先安装 Node.js，然后在项目目录执行 `npm ci`。

## 检查和构建

```powershell
npm run typecheck
npm test
npm run build
npm run preview
```

`build` 会先检查 TypeScript，再生成 `dist/`。`preview` 用于本机预览构建结果。

## 结构

- `index.html`：网页入口和手机 viewport 设置。
- `src/main.ts`：Phaser 初始化及缩放配置。
- `src/scenes/GameScene.ts`：主界面及征兵交互、资源计时器。
- `src/config/game.ts`：初始资源、增长速度、征兵价格、槽位数和随机池。
- `src/config/maps.ts`：测试地图的路径节点、部署格和解锁状态。
- `src/ui/board.ts`：根据地图数据绘制玩家半场及上方镜像展示。
- `src/ui/text.ts`：统一文字样式。
- `src/config/units.ts`：等级颜色配置。
- `src/systems/board.ts`：单位和部署格状态，以及部署、交换、合成、解锁规则（不依赖 Phaser）。
- `src/ui/deployment.ts`、`src/ui/unit.ts`：玩家部署格、槽位、等级和高亮显示。
- `src/input/DeploymentController.ts`：鼠标和触摸共用的 Pointer 拖拽控制。
- `tests/board.test.mjs`：规则回归测试，使用 Node 24 内置测试能力，无额外依赖。
- `src/systems/recruitment.ts`：征兵扣费及槽位替换。
- `src/utils/random.ts`：统一随机抽取，可注入随机源验证。
- `src/style.css`：页面背景和容器尺寸。
- `tsconfig.json`：TypeScript 配置。

逻辑尺寸为 750×1334，采用 FIT 等比缩放和 CENTER_BOTH 居中；不同宽高比下可能留白，背景保持米白色。
初始美金为 $100，每秒自动增加 $1，波次固定为第 1 波。
本阶段每次征兵固定花费 $10，五个槽位均独立等概率抽取刀、枪、弓、骑、铲（可重复），并替换旧内容。
美金不足时按钮变灰，点击只提示，不扣费或更换槽位。
上半场仅镜像展示。下半场支持鼠标/触摸拖动：

- 普通兵拖到已解锁空格可部署，初始 Lv.1；非法目标会返回原位，不消耗。
- 铲子只能拖到锁定格，消耗后解锁为空格。解锁在本局内保持，征兵不会重置。
- 已部署单位可以移动到空格；拖到同类型同等级单位会合成并在目标格升级，无等级上限。
- 棋盘上不匹配的单位互换位置；待放置栏的不匹配单位不能放入占用格。
- 再次征兵只更新待放置栏，不改变棋盘单位和解锁状态。拖动中不能再次征兵。
- 刷新页面会重开一局；本阶段不实现存档、敌人或战斗。
