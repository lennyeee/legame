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
- `src/config/combat.ts`：四兵种战斗属性、成长公式、敌人和攻击视觉测试参数。
- `src/combat/path.ts`、`enemies.ts`、`targeting.ts`：连续路径移动、敌人/伤害、优先索敌与穿透判定。
- `src/combat/CombatSimulation.ts`：不依赖 Phaser 的生成、攻击冷却、弹道、死亡及奖励规则。
- `src/combat/BattleController.ts`、`src/ui/combat.ts`：Phaser 帧循环适配、血条、攻击效果、射程预览。
- `src/systems/board.ts`：单位和部署格状态，以及部署、交换、合成、解锁规则（不依赖 Phaser）。
- `src/systems/items.ts`：棋盘与待放置栏共用的单位类型和等级数据。
- `src/ui/deployment.ts`、`src/ui/unit.ts`：玩家部署格、槽位、等级和高亮显示。
- `src/input/DeploymentController.ts`：鼠标和触摸共用的 Pointer 拖拽控制。
- `tests/board.test.mjs`：规则回归测试，使用 Node 24 内置测试能力，无额外依赖。
- `tests/combat.test.mjs`：战斗规则、各兵种差异、奖励和拖拽兼容性测试。
- `src/systems/recruitment.ts`：征兵扣费及槽位替换。
- `src/utils/random.ts`：统一随机抽取，可注入随机源验证。
- `src/style.css`：页面背景和容器尺寸。
- `tsconfig.json`：TypeScript 配置。

逻辑尺寸为 750×1334，采用 FIT 等比缩放和 CENTER_BOTH 居中；不同宽高比下可能留白，背景保持米白色。
初始美金为 $100，每秒自动增加 $1。当前版本由 src/config/game.ts 中唯一的 GAME_VERSION 配置管理，画布右下角显示版本号。
本阶段每次征兵固定花费 $10，五个槽位均独立等概率抽取刀、枪、弓、骑、铲（可重复），并替换旧内容。
美金不足时按钮变灰，点击只提示，不扣费或更换槽位。
上半场仅镜像展示。下半场支持鼠标/触摸拖动：

- 普通单位在待放置槽、棋盘已解锁格之间双向拖动，类型和等级完整保留。
- 统一规则：空目标移动，同类型同等级合成，不同类型或等级交换；非法目标返回原位。
- 合成保留在目标位置并提升一级，来源清空，无等级上限；待放置栏同样支持合成。
- 铲子可移到待放置空槽，或拖到锁定格解锁并消耗。不能部署、合成或与普通单位交换。解锁在本局内保持。
- 再次征兵只更新待放置栏，不改变棋盘单位和解锁状态。拖动中不能再次征兵。
- 征兵会覆盖待放置栏的高级单位；需要保留的单位应先部署到棋盘。新征出的普通单位均为 Lv.1。
- 刷新页面会重开一局；不保存局内进度。

## 基础战斗

敌人每 2 秒从下半区入口生成，沿地图路径连续前进。初始 90 HP，速度 55 逻辑像素/秒；击杀获得 $5，走到「乐」则消失且不奖励。只有棋盘上已部署的普通兵能攻击，待放置栏不能攻击。

| 兵种 | Lv.1 伤害 | 攻击间隔 | 射程 | 攻击方式 |
| --- | --- | --- | --- | --- |
| 刀 | 12 | 0.45 秒 | 115 | 近距离单体，短线闪动 |
| 枪 | 18 | 1.25 秒 | 250 | 向目标方向穿透，攻击线总宽度 32 |
| 弓 | 30 | 1.7 秒 | 330 | 远程单体，圆点飞到目标后结算伤害 |
| 骑 | 22 | 1.6 秒 | 145 | 自身半径内群攻，圆环提示 |

每级伤害乘 1.55（四舍五入），射程相对基础值增加 6%，攻速系数相对基础值增加 8%。所有数值集中在 `src/config/combat.ts`。所有兵种优先选择射程内路径进度最高的敌人；判定采用敌人中心距离。枪只伤害前方、射程及攻击线宽度内的敌人。

按住棋盘单位查看当前等级的射程；松开（含画布外松开）、开始拖动或窗口失焦时立即隐藏，待放置栏不显示射程。小幅点击不触发拖放。实际拖动时来源兵暂停攻击；移动、交换、收回或合成会取消其旧弹道并重建冷却，避免幽灵攻击。弓箭的目标死亡、消失或离开射程后取消该箭，下一次攻击重新索敌。

上半区的路径、箭头、入口、终点和格子均从下半区配置统一变换得到。为满足上方入口在右下、终点在左上的对向布局，坐标使用 `x' = 750 - x`、`y' = 2 × mirrorY - y`，无第二套地图坐标，也没有上半区战斗逻辑。

战斗过程中仍能征兵、拖拽、交换、合成和解锁。正式测试流程共 5 波，各波敌人数为 5、6、7、8、10；每 2 秒生成一个，生命值每波相对基础值增加 25%。本波全部生成并清空后等待 3 秒进入下一波。

「乐」初始 3 点生命，每次漏怪扣 1 点且不奖励。生命归零显示“失败”；最后一波清空且仍有生命显示“胜利”。结束后停止出兵、战斗、收入和操作，显示简单胜负遮罩；胜利时显示剩余生命。点击“再来一局”在游戏内重新创建当前地图，恢复初始资源、波次、生命、空棋盘和待放置栏、默认锁定格，并清除上一局计时器、敌人和视觉效果。

波次、间隔、生命及成长集中在 src/config/waves.ts；src/combat/WaveProgress.ts 管理波次进度与胜负。tests/waves.test.mjs 验证完整流程，tests/presentation.test.mjs 验证实际场景的文字更新与结束状态。未实现 Boss、武将或联网。

## PVE 暂停与单局闭环

玩家战场右上角的“Ⅱ”按钮打开半透明暂停遮罩。“继续游戏”从原位置恢复，暂停期间波次、敌人、攻击、收入和操作全部冻结。暂停使用 Phaser 场景生命周期，不进入战斗核心规则。

`src/scenes/PveOverlayScene.ts` 负责暂停、胜负遮罩与继续/重开按钮。重开先关闭旧游戏场景，再创建新一局；原有控制器在 shutdown 时移除监听，Phaser 负责清理场景对象与时钟。自动测试覆盖暂停恢复、真实 Phaser 收入计时器、连续重开及监听数量。

## GitHub Pages 部署

目标地址：https://lennyeee.github.io/legame/

`vite.config.ts` 将 base 配置为 `/legame/`，开发及构建预览也使用此子路径，请打开终端显示的完整地址。

首次部署前，在 GitHub 仓库 Settings → Pages → Build and deployment 中，将 Source 设为 GitHub Actions。之后推送到 main 会自动运行 `.github/workflows/deploy.yml`；也可在 Actions 中选择 Deploy to GitHub Pages → Run workflow 手动运行。流程使用 Node 24，执行 npm ci、自动测试、TypeScript检查和构建，再通过官方 Pages Actions 发布 dist。

未来添加资源时，优先通过 Vite import 引用；放在 public 中并由 Phaser 动态加载的文件，应使用 `import.meta.env.BASE_URL + 'assets/文件名'`（或将 Phaser Loader 的 baseURL 设置为 `import.meta.env.BASE_URL`）。不要硬编码以 `/assets/` 开头的域名根路径，以免跳过 `/legame/`。

参考：[Vite 官方部署指南](https://vite.dev/guide/static-deploy.html#github-pages)、[GitHub Pages 官方工作流指南](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
