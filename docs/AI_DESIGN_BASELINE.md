# legame AI Design Baseline

AI行为 Source of Truth。建立日期：2026-09-28；对应游戏基线 [GAME_DESIGN_BASELINE.md](GAME_DESIGN_BASELINE.md)，只读代码核对版本v0.60、commit `bd2631f`。

## 状态与证据

✅ 是用户已确认的AI行为/工程边界，包含尚未实现的方向；🟡 是方向已确认但参数待试玩；⬜ 是未设计的具体内容。证据优先级：用户后来明确确认/纠正 → 用户试玩录像截图证据 → 审核设计总结 → 早期资料 → 猜测。当前代码和开发fixture不是设计权威。

以下完整保留权威AI规格A–S。当前尚无正式AIController；本文不表示AI已实现。主文档中的Superseded / Deprecated Decisions同样约束AI。

## A. 核心原则

> ✅ 已确认的设计或工程要求；具体未提供的评分/参数不推定为已确定。

AI 与玩家：

同规则
同资源
同 recruit pool
同 RNG 概率
同单位
同道具
同土地规则
同 5-slot pressure。

AI 不拥有：

- 隐藏资源
- 额外钱
- recruit protection
- 好牌概率加成
- 隐藏仓库
- 特殊土地
- 更高伤害
- 特殊 cooldown
- 额外视野
- comeback bonus

双方随机结果独立。

不要求 AI 和玩家抽到相同东西。

## B. AI 能知道什么

> ✅ 已确认的设计或工程要求；具体未提供的评分/参数不推定为已确定。

AI 只能依据自己的当前真实状态决策：

- 自己的钱
- 自己的 holding
- 自己的 board
- 自己的 units
- 自己的 heroes
- 自己的 Farmer
- 自己的 items
- 自己的 locked/unlocked cells
- 自己当前正在面对的 enemies / 当前战场事实
- 当前合法操作

AI 不知道未来 spawn timeline。

AI 不读取未来 RNG。

AI 不为了决策观察玩家棋盘。

当前没有跨棋盘机制时：
玩家阵容不应该影响 AI 的决策。

## C. 决策模型

> ✅ 已确认的设计或工程要求；具体未提供的评分/参数不推定为已确定。

第一版 AI 采用：

当前状态
→ 枚举当前合法动作
→ 对动作评分
→ 选择一个“值得做”的动作
→ 等待 actionDelay
→ 执行
→ 重新读取当前状态
→ 再次决策

禁止第一版做：

- 多步搜索
- minimax
- 全局最优阵容搜索
- “连续刷新5次找某字”的预计划
- 未来经济预测
- 未来波次预测
- 预知下一次 recruit
- 大规模 board optimization

例如：
AI 即使连续 recruit 多次，
也必须每 recruit 一次后重新读取新状态再决定下一步，
而不是提前规划固定连续刷新序列。

## D. 不做紧急救场

> ✅ 已确认的设计或工程要求；具体未提供的评分/参数不推定为已确定。

第一版 AI 不建立特殊 emergency/rescue mode。

即使敌人已经接近乐：

AI 不因此获得：
- 更快 action speed
- 特殊资源
- 特殊决策权限
- 隐藏 buff
- 强制完美操作

它仍然按照正常 decision loop 运行。

它可以正常“看到当前敌人状态”，
但不建立独立的作弊式/特殊紧急救场系统。

玩家应该可以观察到：
“对面这局快守不住了”，
而不是 AI 突然进入隐藏狂暴模式。

## E. AI 不允许长期无意义发呆

> ✅ 已确认的设计或工程要求；具体未提供的评分/参数不推定为已确定。

“不做未来规划”
不等于
“什么都不做”。

如果 AI 当前：

- 有大量钱
- holding 已满
- board 有空间
- 存在明显合法的提升战力/腾空间动作

AI 不应该几十秒完全不操作直到死亡。

只要当前存在合理 worthwhile action，
它应该继续处理当前局面。

## F. 5-slot pressure

> ✅ 已确认的设计或工程要求；具体未提供的评分/参数不推定为已确定。

AI 真实使用同一个 5 格 holding。

recruit 会覆盖全部 5 格。

AI 没有：
- lock slot
- auto-save
- hidden reserve
- protected hero letters

board 可以和玩家一样作为临时仓库。

AI 允许因为空间处理不好而损失有价值单位。

不能把 AI 做成永远完美保存所有资源的机器人。

## G. 当前牌处理原则

> ✅ 已确认的设计或工程要求；具体未提供的评分/参数不推定为已确定。

总体价值方向包括：

- 当前可以直接 merge 的单位
- 当前可以直接完成的 hero
- 当前值得部署的战斗单位
- shovel / unlock
- 当前可用 item
- Farmer
- 空间释放
- 保留高价值牌
- 处理低价值牌
- recruit

这不是必须硬编码成绝对 if-else 顺序。

应该通过 action scoring 表达。

空间极端紧张时，
整体处理思路可以包括：

直接 merge
→ 当前可完成 hero
→ shovel / unlock
→ retention value
→ 必要时 点金手
→ 把值得保护的东西放 board
→ 实在无法处理时接受 recruit 覆盖损失。

AI 允许做不完美但合理的选择。

## H. Hero 处理

> ✅ 已确认的设计或工程要求；具体未提供的评分/参数不推定为已确定。

AI 能识别当前可以直接形成的 hero。

必须遵守：

横向
正确左右顺序
相邻。

AI 不主动拆已经 active 的 hero，
除非未来有明确新设计覆盖此规则。

第一版不做复杂的“为了未来第二个同 heroId 武将”
而长期保留/规划字。

如果已有某 heroId：

重复字如果可以用于已有 HeroLetter 升级：
正常评估为升级材料。

如果相关 HeroLetter 已经 Lv5，
且这个重复字对当前状态没有其他立即价值：
其 retention value 可以降至 0，
允许之后被 recruit 覆盖/处理。

共享字仍按当前可立即形成的合法 hero 组合评估。

不做复杂未来组合树搜索。

## I. Shovel / 土地

> ✅ 已确认的设计或工程要求；具体未提供的评分/参数不推定为已确定。

第一版不需要复杂地图战略搜索。

unlock 倾向：
优先当前有实际部署价值、靠近 path 的土地。

不要为了未来可能的阵型提前做复杂开地图规划。

v0.61 不要求预计算一整套
knifeScore/bowScore/spearScore/cavalryScore
全地图最优矩阵。

更高级的兵种站位智能以后可以继续增强。

## J. 站位

> ✅ 已确认的设计或工程要求；具体未提供的评分/参数不推定为已确定。

第一版目标：
合理，而不是最优。

允许非常简单的单位类型偏好，
但不要做昂贵的整局 combat simulation 来搜索最佳格。

不要因为追求 AI 强度而让 AI 变成最优解机器人。

## K. AI 操作表现

> ✅ 行为边界已确认；🟡 动画时间、延迟、噪声和人格参数待试玩。

AI board 上发生单位移动时：
未来/当前目标表现约 0.2–0.3 秒短移动动画。

不要瞬间 teleport（正式表现）。

但也不要模拟：
- 鼠标轨迹
- 手指
- 假拖拽
- 假误触
- 手滑

AI 的“不完美”来自决策能力有限，
不是人为写“10%概率犯傻”。

## L. decisionNoise

> ✅ 行为边界已确认；🟡 动画时间、延迟、噪声和人格参数待试玩。

如果几个行动价值接近：

例如：
A = 92
B = 88
C = 84

AI 可以因为 decisionNoise/personality
选择不同的合理动作。

但如果：

A = 92
B = 20

不能为了“像人”
故意经常选 B。

噪声用于：
制造合理差异。

不是：
制造人工智障。

## M. actionDelay / jitter

> ✅ 行为边界已确认；🟡 动画时间、延迟、噪声和人格参数待试玩。

AI 操作之间存在 human-like delay。

不是 0ms 连续完成几十个动作。

delay 带适度 jitter。

具体毫秒数属于 🟡 待试玩调整。

actionDelay 不应成为隐藏难度作弊。

## N. personality

> ✅ 行为边界已确认；🟡 动画时间、延迟、噪声和人格参数待试玩。

personality 可以影响：

- 操作速度
- decisionNoise
- hero preference
- ordinary preference
- retention tendency
- unlock aggressiveness
- active item usage quality
- economy tendency

personality 只能改变：
“如何选择”。

不能改变：
- attack
- HP
- money generation
- recruit RNG
- item power
- enemy rules
- cooldown
- 基础游戏规则

## O. AI loadout

> ✅ 已确认的设计或工程要求；具体未提供的评分/参数不推定为已确定。

AI 每局生成自己的 loadout。

一旦 Match 开始：
该局 loadout 固定。

AI 实际使用自己装备的：
active/passive items。

不是永远使用开发测试配置。

以后 fake profile / rank 可以和 loadout/personality 合理关联。

但 v0.61 不需要提前完成整个 rank matchmaking 系统。

## P. 对手 UI 信息

> ✅ 已确认的设计或工程要求；具体未提供的评分/参数不推定为已确定。

玩家不看到 AI：

- holding
- money
- recruit button
- item operation UI
- internal score
- internal decision
- Hero EXP
- skill CD
- range

玩家看到：

- AI board
- units
- levels
- active hero
- hero level
- Farmer pending money
- locked/unlocked land
- skills actually happening
- enemies/combat
- life/result

## Q. AI 架构原则

> ✅ 已确认的设计或工程要求；具体未提供的评分/参数不推定为已确定。

AIController 只负责：
“决定下一步做什么”。

合法性和真正游戏规则必须继续由共享 gameplay system 决定。

AI 不允许复制一套独立规则。

例如：

- recruit 扣钱
- recruit price advance
- merge
- hero activation
- shovel
- active item legality
- Farmer collect
- board move
- selling
- level cap

都必须尽量调用 PlayerSide / shared domain operation。

这样以后：

AIController
可以被
RemotePlayerController

替换，

而底层 PlayerSide / Match / Combat 规则不用重写。

## R. v0.61 与 v0.67 边界

> ✅ 已确认的设计或工程要求；具体未提供的评分/参数不推定为已确定。

v0.61：
先让 AI 真正会玩完整 Match。

建议分层：

v0.61-A
基础 live AI：
- 从空局开始
- recruit
- move/deploy
- merge
- hero
- shovel
- 基础 item/Farmer
- 可以独立完整玩

v0.61-B
current-state intelligence：
- action scoring
- retention
- space pressure
- hero value
- merge value
- 简单 placement
- item timing
- 合理 recruit decision

v0.61-C
基础 human-like execution：
- actionDelay
- jitter
- decisionNoise
- personality hooks

v0.67：
进一步增强 fake opponent realism/personality，
不要把所有拟人系统都塞进 v0.61。

## S. 当前 v0.61 实现前的工程要求

> ✅ 已确认的设计或工程要求；具体未提供的评分/参数不推定为已确定。

当前 v0.60 已经存在：

PlayerSide
Match
BattleController / CombatSimulation
独立 topSide / bottomSide

AI 接入前应先审计：

1. PlayerSide 已经有哪些可复用操作入口？
2. 哪些玩家操作仍直接写在 GameScene，AI 无法调用？
3. AI 是否可以只通过 shared operations 操作 topSide？
4. 当前 top dev setup 在哪里？
5. 移除 top dev setup 后如何保证 AI 从：
   $20 + empty holding + normal open cells
   开始？
6. restart 是否能彻底销毁旧 AI state/timer/callback？
7. pause/result 是否能自然冻结 AI？
8. AI 是否会绕过 Match lifecycle？
9. 哪些地方需要最小接口补充？

这次建立文档任务：
只记录这些架构要求，
不要开始实现 AI。

## 工程核对：v0.61接入前的实际入口

| 核对项 | 当前代码事实 | 后续实施边界 |
| --- | --- | --- |
| 招募 | `PlayerSide.recruit(random?)`绑定本方RecruitmentState | 不让AI复制扣费/价格/五格覆盖/被动计数逻辑 |
| 移动/交换/合并/铲地 | `PlayerSide.drop(source,target,random?)`复用`board.applyDrop`，同步Farmer | 枚举当前合法动作后调用本方入口，不直接伪造occupant或地皮状态 |
| 道具 | `PlayerSide.useActiveItem(index,target)`校验本方装备、CD和目标 | 复用升级/出售/heroId强化，不给AI独立CD |
| 农民领取 | `PlayerSide.collectFarmerReward(farmer,rewardId)`校验本方对象和奖励 | AI走同一领取入口，不能后台自动绕过pending/过期规则 |
| 拖动生命周期 | `syncDeployment(draggedTile)` + bottom的DeploymentController、BattleController | 人类拖动悬起会解除Link/暂停攻击；AI无需模拟假鼠标，但动作必须遵守同一合法结果，移动表现另行处理 |
| 运行控制 | Match.update/pause/resume/destroy统一双方；Side方法以running门控 | AI调度不得绕过Match状态；旧AI计时/待执行动作需随旧局销毁，未来由测试验证 |
| 当前top fixture | `GameScene.create`调用`dev/topSetup.ts`：高等级兵/武将/农民及特殊格，空loadout | v0.61替换；正式AI必须从$20、空holding、6普通开放格开始，没有赠送单位/土地 |
| UI依赖 | 招募按钮、反馈和输入在GameScene/输入控制器；真正动作已有Side接口 | AI不调用Phaser按钮，不依赖反馈文本；不复制一套规则；动画/展示仍属于表现层 |
| 无AI实现 | 没有当前评分/动作延迟/人格/AI装备生成，也没有0.2–0.3s AI移动表现 | 属于后续实现，不能将fixture宣称真人化AI |
| 对手隐私 | top无操作HUD与range输入，但CombatView仍画top EXP | 与已确认隐藏对手EXP不一致；本次只记录不修复 |

以上是后续施工审计要求，不是提前选择新的AI算法、参数或实现方案。

## 尚未确定的参数

- 🟡 worthwhile action的评分/阈值、保留价值和兵种简单站位权重。
- 🟡 actionDelay毫秒、jitter幅度、noise范围、“价值接近”的界限与personality采样。
- 🟡 约0.2–0.3s移动动画最终时长和表现；不据此建立假拖拽/手滑。
- ⬜ loadout/profile/personality与段位的具体生成分布及映射；段位匹配算法。
- ⬜ 未来跨棋盘机制如果出现，AI可观测范围需新的明确设计；当前不得读取玩家棋盘或未来timeline/RNG。

## Superseded / Deprecated Decisions

不得恢复：隐藏资源/额外钱/补偿、好牌保护或概率加成、隐藏仓库、AI独有土地/伤害/CD/视野、读取玩家棋盘作弊、未来RNG/timeline预测、独立emergency救场权限、段位/胜率改变招募概率、提前连续刷新搜索某字、为了拟人随机犯傻/误触/手滑、鼠标/手指轨迹模拟、把top开发预置阵容当正式AI。

## 维护

用户确认新AI设计 → 更新本文及相关游戏基线 → 再实现代码。未确认的参数保留🟡/⬜，不得由当前实现或猜测推定。规则冲突按主文档证据优先级处理；无法判断时停止并询问。
