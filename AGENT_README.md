# Nafchanaphata — 项目实现速览（面向后续 Agent）

本文件用于让后续 Agent 快速理解项目实现方式，无需重复通读全部代码。

## 1. 项目是什么

Nafchanaphata 是一个**纯前端、无构建步骤的 Web 音乐音序器**，基于 LΛMPLIGHT 的「シャサフ式（Shasav）音乐理论」。它把音高之间的音程关系以「维度（次元）」可视化，在类钢琴卷帘（piano-roll）的 UI 上编辑和播放**微分音/纯律**音乐。

- 入口页面：[index.html](file:///d:/AI项目/git/nafchanaphata/index.html)
- 逻辑入口模块：[js/shasav.js](file:///d:/AI项目/git/nafchanaphata/js/shasav.js)
- 原项目说明：[README.md](file:///d:/AI项目/git/nafchanaphata/README.md)

## 2. 技术栈与运行方式

- 纯 HTML + CSS + ES Modules（`<script type="module">`），无打包器。
- 渲染：[Konva.js](https://konvajs.org)（canvas 场景图）
- 音频：[Tone.js](https://tonejs.github.io)（Transport / Sampler / Part / PolySynth）
- UI：[Beer.css](https://beercss.com)
- 压缩：[JSONCrush](https://github.com/KilledByAPixel/JSONCrush)（用于 URL 分享与 `.naf` 文件）
- 本地服务：[server.py](file:///d:/AI项目/git/nafchanaphata/server.py)（Python `http.server`，端口 3000），额外提供 `/api/backgrounds` 接口列出 `assets/background` 下的图片，并修复 Windows 下 `.js/.mjs/.ogg/.mp3/.otf` 的 MIME 类型。

> 运行：`python server.py` 后打开 `http://localhost:3000`。第三方库从 CDN 加载（beercss、konva、tone、jsoncrush）。

## 3. 目录结构

```
nafchanaphata/
├── index.html          # 全部 DOM：菜单、Config 面板、各类 modal、内联键盘拦截脚本
├── style.css
├── server.py           # 本地静态服务 + /api/backgrounds
├── js/
│   ├── shasav.js       # 主模块：初始化 + 事件绑定 + 大量功能实现
│   ├── sequencer.js    # Konva Stage/图层初始化、点击建音、拖拽/捏合
│   ├── note.js         # Note/RootNote/SubNote 类（和弦树）
│   ├── grid.js         # 网格图层（谱线/节拍线/循环箭头/播放指示线）
│   ├── util.js         # 音高/坐标/量化数学、音程表、常量
│   ├── sound.js        # Tone.js 采样器与合成器
│   ├── midi.js         # MIDI 导入导出 + WAV 离线渲染
│   ├── serialize.js    # 工程序列化/反序列化（.naf / URL / 历史快照）
│   ├── history.js      # 撤销栈
│   ├── selection.js    # 多选/框选/复制粘贴剪切/组拖拽
│   ├── text.js         # 画布文字注释（HTML overlay，富文本）
│   ├── staff.js        # 谱表符号（文字指令）解析
│   ├── keybinds.js     # Ctrl+Z、Tab 分辨率输入
│   ├── i18n.js         # 多语言翻译表
│   ├── pincher.js      # 触屏双指缩放
│   └── test.js         # localhost 下的测试钩子
├── assets/             # 字体、背景图、乐器采样
├── data/  dustbin/  utils/  videos/   # 与核心实现无关，忽略
```

## 4. 模块依赖与职责

加载链：`index.html` → `<script type="module" src="./js/shasav.js">`。

`shasav.js` 是装配中心，导入并初始化其余模块：

- `sequencer.js` 导出 `stage`、`grid`、`rootlayer` 三个全局共享对象（Konva Stage、Grid 图层、根音图层）。
- `note.js`、`grid.js`、`serialize.js`、`history.js` 等都从 `sequencer.js` 反 import 这些对象，形成少量循环依赖，靠 ES module 的 live binding 与 `window._*` 全局兜底解决。
- 大量跨模块调用通过 **`window._xxx`** 暴露（见 §10），以避免模块间硬 import 循环。

各模块职责见下表：

| 模块 | 职责 |
|---|---|
| `sequencer.js` | 创建全屏可拖拽 Konva Stage；`pointerclick` 建音；非卷帘模式点击 seek 播放线 |
| `note.js` | 音符类。`Note` 基类（音高线、子音树、颜色、静音/隐藏/播放），`RootNote`（拖拽：head/tail/body、Shift 连锁、Ctrl 和弦联动、构建 Tone.Part），`SubNote`（相对父音定位、维度连线、提升为根音） |
| `grid.js` | 绘制 0d~4d 谱线、EDO 线、调式线、五度线、主从线、节拍竖线；循环箭头；播放指示线；卷帘自动滚屏 |
| `util.js` | 纯函数与常量：坐标换算、音程表 `pitchIntervals`、量化 `qb/qs/qh/qt`、`tav()` 比率→维度名 |
| `sound.js` | `sampler` 单例 + `switchTones()` 切音色 + `playNotes()` |
| `midi.js` | 微分音 MIDI（pitch bend）、12TET、自定义 EDO 导出；MIDI 导入；WAV 离线渲染 |
| `serialize.js` | `Serializer.serialize/deserialize/root2json/sub2json/json2sub` |
| `history.js` | 最多 100 条快照的撤销栈 |
| `selection.js` | `Select` 单例（`window._sel`） |
| `text.js` | `TextNote` 类 + `TextSel`（`window._textSel`）；文字用 HTML 元素渲染 |
| `staff.js` | 把文字注释解析为指令，写入 `window._staffDirectives` |
| `keybinds.js` | 全局快捷键 |
| `i18n.js` | `i18n()` / `t()`，内置 ja/en/zh/sf 四语 |
| `pincher.js` | 双指捏合缩放 |

## 5. 核心领域概念（Shasav 音乐理论）

### 5.1 维度 / 音程（pitchIntervals）

音高关系用**有理数比率 n/d** 表示，称为「维度（dimension）」。内置维度见 [util.js](file:///d:/AI项目/git/nafchanaphata/js/util.js#L15-L33)：

| 维度 | 比率 | 含义 | 颜色 |
|---|---|---|---|
| 0d | 1/1 | 同音 | #aaaaaa |
| 1d | 2/1 | 八度 | #aaaaaa |
| 2d | 3/2 | 纯五度 | #f27992 |
| 3d | 5/4 | 大三度 | #6cd985 |
| 4d | 7/4 | 和声七度 | #b598ee |
| 5d | 11/4 | | #ffc247 |
| 6d | 13/4 | | #b5b500 |
| 7d | 17/4 | | #ed9877 |

负维度（`-1d` 等）是正维度的倒数。每条音程含：`id`、`n`、`d`、颜色 `c`、线宽 `w`、连线端点参数 `b/t/m`（或自定义 `points` 数组 + `curve`）。`tav(n,d)` 把任意比率分解为 `Nd↑/Nd↓` 的维度符号串。

### 5.2 音符树（和弦树）

- **RootNote**：顶层根音，绝对定位。
- **SubNote**：子音符，通过 `interval`（比率）挂到父音，其频率 = `parent.hz * n / d`，在 Konva 中作为父 Group 的子节点（相对定位）。
- 一棵音符树即一个「和弦」。子音可无限递归嵌套。

## 6. 坐标系与量化

- **Y 轴（音高）**：对数刻度。`hz2y(hz) = (log2(20000) - log2(hz)) * 100`，`y2hz(y) = 20000 / 2^(y/100)`。**一个八度 = 100px**。
- **X 轴（时间）**：`1 拍 = 48px = 192 ticks`。`x2t(x) = round(x/48*192)`，`t2x(t) = t*48/192`。播放时间轴用 Tone.js Transport ticks。
- **全局偏移**：`OFFSET = 192000`（避免负 ticks）。
- **量化函数**：
  - `qb(hz, tonic, edo)`：底音按 EDO（等分八度）量化。
  - `qs(hz, tonic, edo)`：子音按 EDO 量化。
  - `qh(x, tick)`：起始位置吸附到网格（1/tick 拍）。
  - `qt(x, tick)`：结束位置吸附。
  - 谱表符号可分段覆盖 tonic/edo/tick。

## 7. 数据模型

`Note`（继承 `Konva.Group`）关键属性：`pitchline`（Konva.Line，音符横线）、`childNotes`/`childLinks`（子音与连线 Group）、`volume`、`isMuted`、`_hidden`、每音外观 `_pitchThick/_linkThick/_linkOpacity/_noteOpacity`、`_tick`、`_timeX/_timeLen`（小节视图用）、`delay`、`len`。

`note` getter 返回 Tone.js 播放用的对象 `{time, hz, len, vol, absX}`；`notes` getter 递归展平整棵树。

## 8. 渲染架构（Konva 图层）

`stage` 上依次叠加：
1. `grid`（Grid，背景参考线，非交互）
2. `rootlayer`（所有 RootNote）
3. selection 专用 Layer（`Select._layer`）
4. `textlayer`（文字锚点，Konva 命中/拖拽用）

文字实际渲染用 **HTML overlay**（`#text-html-layer`，z-index 20），以保证 OpenType 连字与编辑器显示一致；Konva 侧仅作命中/拖拽锚点。

## 9. 播放与音频

- 音源：`sound.js` 的 `sampler`（默认 Salamander 钢琴），另有 Strumstick、Vibraphone、竖琴、管风琴、以及 4 种实时合成波形（sine/square/sawtooth/triangle）。
- 播放用**单个全局 `Tone.Part`**（`staff.js` 的 `buildPlayback()`，`window._playbackPart`），先 `collectPlaybackNotes` 把全部音符树展平成 `{startTick, lenTick, hz, vol, absX}`，再注册到 Transport。力度（velocity）与分段速度（BPM/BEAT）由谱表符号在触发时动态应用。
- 循环反复（`||:` / `:||`）通过 `Tone.Transport.schedule` 在反复点 seek 跳回实现（`startLoopMonitor`）。
- 播放/暂停、自动停止、卷帘滚屏、循环箭头都在 `shasav.js` 的 `#play-pause-btn` 等处理器中完成。

## 10. 跨模块通信约定

大量功能通过挂到 `window` 的全局函数/对象协作，这是理解代码的关键：

- `window._sel`（Select）、`window._textSel`/`_textlayer`/`_TextNote`（文字）、`window._scale`/`_fifth`/`_masterSlave`（调式/五度/主从状态）。
- `window._staffDirectives`、`window._getStaffState(x)`、`window._parseStaff()`、`window._staffChanged()`、`window._applyStaffTempo()`、`window._buildPlayback()`、`window._startLoopMonitor()/_stopLoopMonitor()`（谱表符号）。
- `window._snapToScale`、`window._snapToMasterSlave`、`window._scaleTonesAt`、`window._collectScale`（吸附/调式）。
- `window._renderExtShortcuts(prefix)`（弹窗底部快捷键渲染）。
- `window._barView`/`_barViewData`/`_barViewX(ticks)`/`_barViewTicks(viewX)`/`_relayoutBarView()`（小节视图）。
- `window._shiftDown/_shiftUpAt`（内联脚本与音符创建共享的 Shift 状态）。

## 11. 序列化与文件格式

- `.naf` 文件与 URL 分享：`Serializer.serialize(true)` 输出 **JSONCrush 压缩 + URL 编码**的字符串。
- 历史快照：`Serializer.serialize(false)` 输出纯 JSON（不压缩）。
- 结构：`{ s: {v:2, b:beat, t:tonic, s:loopStart, e:loopEnd, i:音色, o:layer透明度, sc:调式段}, n: [根音数组], x: [文字数组] }`。
- 音符字段用短键压缩：根音 `{x,l,h,m,v,hd,pt,lt,lo,no,tk,s:[子音]}`；子音 `{i:intervalId,d:delay,l:len,h,m,v,hd,...,lx,s:[...]}`。
- `h` 是 `Hz * HZ_MUL`（v2=256，旧版=16），`x/l/d/lx` 是 `像素 * 4`。
- 反序列化通过 `interval.id` 反查 `pitchIntervals` 键（`id≥100` → `c(id-100)` 自定义，`id≤-100` → `-c(...)`，其余 → `id+'d'`）。

## 12. 主要功能速查

- **建音**：点击空白 → RootNote；点击音符 → 弹编辑菜单。
- **拖拽**：左端=head（改起点）、右端=tail（改长度）、中部=body（改音高）；`Alt`=仅移动；`Ctrl`=整和弦时值联动。
- **维度操作按钮**（菜单/弹窗）：`Prog`（累进移根音）、`Trans`（改写音程）、`Ext`（从当前音加子音）、`root-ext`（从根音加子音），配合方向开关（↑/↓）。
- **扩展快捷键**：数字键/Alt+数字 直接给当前音加维度；Shift+快捷键 链式嵌套；可自定义（点击弹窗底部标签）。
- **选择**：Shift+点击切换、Shift+拖拽框选、组拖拽、Ctrl+C/V/X/A/D（音符与文字可同时操作）。
- **谱表符号**：文字注释里写 `EDO=24`、`BEAT=500`、`BPM=120`、`TONIC=440`、`SCALE`、`||:`/`:||`/`:||=N`、力度 `PPP…FFF`、小节线 `|`，实时分段生效。
- **调式（Scale）**：选中和弦后按 `D` 设调式内音；创建音符自动吸附。
- **五度扩展 / 主从扩展**：与调式谱线互斥的另外两种参考线系统。
- **泛音拟合**（`C` 键）：BFS 用 3/5/7/11 泛音逼近目标音高。
- **和弦连接**（`V` 键）：把同时值音符用维度路径连成和弦（中继音虚线显示）。
- **自定义维度**：Config → 自定义维度 → 扳手，可加任意 `n/d` 比率，支持自定义连线折线/曲线/颜色。
- **小节视图**（`X` 键）：等宽小节布局的纯视觉重排视图；`M` 键自动加小节号。
- **导入导出**：MIDI（微分音 pitch bend / 12TET / 自定义 EDO）、WAV（OfflineAudioContext 离线渲染）；导入 12TET MIDI（含 pitch bend 还原）与微分音 EDO MIDI。
- **背景/外观**：背景色/透明度/图片、音符颜色（波长/HSI/白）、粗细/透明度，多语言（ja/en/zh/sf）。

## 13. 关键入口点（改代码定位）

- 建音逻辑：[sequencer.js](file:///d:/AI项目/git/nafchanaphata/js/sequencer.js#L36-L124) `stage.on('pointerclick')`
- 音符拖拽：[note.js](file:///d:/AI项目/git/nafchanaphata/js/note.js) `RootNote` 构造函数内 `dragstart/dragmove/dragend`
- 网格绘制：[grid.js](file:///d:/AI项目/git/nafchanaphata/js/grid.js) `drawScorelines/drawBeatlines/...`
- 播放控制：[shasav.js](file:///d:/AI项目/git/nafchanaphata/js/shasav.js#L706-L766) `#play-pause-btn` / `#skip-btn` / `#repeat-btn`
- 序列化：[serialize.js](file:///d:/AI项目/git/nafchanaphata/js/serialize.js) `Serializer`
- 谱表符号解析：[staff.js](file:///d:/AI项目/git/nafchanaphata/js/staff.js) `matchDirective/matchDirectives/parseStaff`
- 调式/五度/主从：[shasav.js](file:///d:/AI项目/git/nafchanaphata/js/shasav.js#L130-L373)
- 自定义维度：[shasav.js](file:///d:/AI项目/git/nafchanaphata/js/shasav.js#L1569-L2066)
- 小节视图：[shasav.js](file:///d:/AI项目/git/nafchanaphata/js/shasav.js#L2398-L2653)
