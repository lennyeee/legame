# v0.70-A4 音频取证记录

## 结论与证据边界

没有真实 iPhone 控制台/运行时快照，尚不能确定「HOME 和战斗 BGM 始终无声」的唯一根因。A2 的格式替换、A3 的 unlock 修改均未通过真机验证，不能继续称它们已经解决根因。

已证明并修复一项局部缺陷：`startDesired()` 在有旧 BGM 和 Scene tweens 时以音量 0 创建新 BGM；`commitBgm()` 若发现 Scene 已不活跃而不执行 tween，原来的直接切换分支没有恢复音量。A4 显式恢复配置音量。这能解释特定切换中的静音，不能解释无旧曲目的首次 HOME 静音。

## 提交链

| 版本 | 改变 | 真实设备证据 |
| --- | --- | --- |
| v0.69-D b5c548e | 未接入项目音频 | 游戏启动正常 |
| A ff57198 | ReadyScene.preload 加载全部音频；Game 级 AudioManager；400ms Scene tween 切曲 | iPhone HOME 空白 |
| A1 bcbb691 | 从 create 后启动 Scene loader；异常静默降级 | HOME 恢复；SFX逐步可用；BGM无声 |
| A2 172d082 | 两首 BGM M4A 改 MP3 | BGM仍无声 |
| A3 48eba4e | 原生触摸恢复、context状态检测、HTML5 playing确认 | BGM仍无声 |

## 后端与生命周期（实际源代码）

1. `src/main.ts` 创建 Phaser.Game，没有设置 audio.noAudio 或 disableWebAudio。`SoundManagerCreator` 根据设备能力优先选择 WebAudio，否则 HTML5Audio，无能力时 NoAudio。BGM/SFX 均使用同一 `game.sound`，没有各自后端。真机具体类型由 A4 面板显示，不能从 UA 猜测。
2. `ReadyScene.create` 从 Game registry 获取/创建 AudioManager，读取存档音乐/音效开关，请求 home_bgm，然后创建 HOME UI，最后调用后台 loader。首次 sound.add 可能因尚无 cache 抛错；不会等待音频来创建 HOME。
3. WebAudio 路径是 HTTP ArrayBuffer → `AudioFile.onProcess/decodeAudioData` → AudioBuffer cache → filecomplete；HTML5 路径使用 HTMLAudioElement/canplaythrough。HTTP成功、解码成功、播放成功、可听输出是不同层级。
4. SoundManager 默认 pauseOnBlur=true。WebAudio 的 locked 是 Phaser 状态，不等同于实时 context.state。A3 同时监听 unlocked、context statechange 和原生画布触摸；musicEnabled 默认/迁移缺省均为 true，用户保存的 false 被保留。
5. BGM sound.add/play 使用 loop=true；SFX loop默认false。BGM有 desired、confirmed、pending状态以及400ms tween；SFX直接add/play并在complete销毁、有限流。BGM首次HOME无旧曲目时使用0.28音量，不走淡入；战斗音量0.25。SFX不走BGM pending/fade。
6. WebAudio play() 返回true只代表缓冲源已安排启动，isPlaying不是扬声器输出证明。HTML5 play()可能在媒体Promise失败前返回true。A3的检查能减少假状态，但没有真机数据证明它们是此次根因。
7. 菜单之间保持home_bgm；MATCHING/VS/INTRO保留菜单音乐，到GameScene运行阶段（首怪时间9500ms）请求battle_bgm。Game级AudioManager跨Scene存在，但fade属于发起的Scene。
8. pause暂停战斗BGM并停止SFX；resume优先恢复原clip；result停止BGM并播放胜败音效；退出/重开沿用现有Scene流程重新请求菜单音乐。没有新增游戏计时器。旧fade回调引用旧clip，未发现直接指向新clip的证据；inactive Scene跳过fade却留下0音量的分支已修复。

## 后台加载与SFX逐渐可用

当前不是串行加载：Phaser默认最多32路（Android默认6）；15个音频在同一后台队列中提交，实际网络和解码完成次序由浏览器决定。ui_click.wav约23KB，两首MP3分别约5.5MB/5.1MB，不能以小SFX可用推定大BGM已经解码。

加载器归属于Scene。ReadyScene退出时，LoaderPlugin.shutdown会reset队列、停止update、移除监听器；下一Scene重新排队尚未缓存的音频。MatchingScene没有独立加载入口。已经完成的缓存跨Scene保留，因此第二局SFX更完整符合这个机制；但未测量真机每项耗时，不能认定网络或解码中的某一个阶段是唯一瓶颈。

A4只增加下载完成、缓存完成、网络错误、loader结束和Scene shutdown记录；不改队列策略，不把HOME重新放到preload之后。某些Phaser解码失败只输出console而不发loaderror，面板据「下载完成但loader结束无cache」明确标注未完成处理，不伪称拿到了原始解码异常。

## 真机诊断方式

部署后在原地址增加 `?audioDebug=1`。默认地址不显示诊断UI。

面板显示：后端、Context状态/时钟、locked、pauseOnBlur、全局音量/mute、开关；当前活动Scene/phase；每首BGM缓存/解码时长、Sound数量、desired/confirmed/pending、isPlaying/isPaused、volume/Gain/mute、seek/duration、source是否存在、HTML5 readyState/error；最近play尝试、结果/异常、resume及加载日志；全部资源缓存状态。

先保留自动播放失败时的面板状态，再点 Resume AudioContext，随后分别点 Play Home BGM Direct / Play Battle BGM Direct。直接播放使用同一个Phaser SoundManager、loop=true、原配置音量，绕过AudioManager选曲和fade。Stop BGM停止测试曲目。按钮只有实际点击时才操作声音；面板轮询只读、不写存档、不改战斗。关闭游戏时清理轮询和测试音频。

- cache=false：尚未到Sound播放阶段，优先查下载/解码/Scene中断记录。
- cache=true且Direct可听、自动不可听：重点比较管理器状态、fade、音量和Scene时序。
- cache=true、Context running、Direct仍不可听：问题不止管理器选曲状态；记录底层Sound/Gain/seek和真实后端再决定下一步。
- confirmed=true或seek递增仍不等于可听；最终以用户听感为准。

本轮不把任何一个分支推测写作已验证的iPhone根因，不转码素材，不改变游戏规则。
