/*
 * 网格图层模块 — 音高谱线、节拍线、循环箭头、播放指示器
 * グリッドレイヤーモジュール — ピッチスコアライン、ビートライン、ループ矢印、再生インジケーター
 * Grid layer module — pitch score-lines, beat lines, loop arrows, playback indicator
 */
import { $, range, hz2y, x2t, t2x, f2d, qh, OFFSET, pitchIntervals } from './util.js'
import { rootlayer } from './sequencer.js'

// 网格类：管理所有背景参考线、播放指示器和循环控制 / グリッドクラス：背景参照線、再生インジケーター、ループ制御を管理 / Grid class: manages background reference lines, playback indicator, and loop controls
export class Grid extends Konva.Layer {
	constructor(stage, tonic, beat) {
		super() // {listening: false})
		this.stage = stage
		// 从 localStorage 恢复（优先），否则从 DOM/参数读取 / localStorageから復元（優先）、なければDOM/引数から読み取り / Restore from localStorage (preferred), otherwise read from DOM/params
		const savedTonic = localStorage.getItem('naf_tonic')
		const savedBeat = localStorage.getItem('naf_beat')
		this._tonic = tonic || (savedTonic ? parseFloat(savedTonic) : null) || parseFloat($('#config-tonic').value) || 440
		this._beat = beat || (savedBeat ? parseFloat(savedBeat) : null) || parseFloat($('#config-beat').value) || 500
		// 同步到 DOM / DOMに同期 / Sync to DOM
		$('#config-tonic').value = this._tonic
		$('#config-beat').value = this._beat
		this.octave = f2d(1, 2)
		this._2dInterval = f2d(2, 3)   // 3/2 = 五度 / 完全五度 / perfect fifth
		this._3dInterval = f2d(4, 5)   // 5/4 = 大三度 / 長三度 / major third
		this._4dInterval = f2d(4, 7)   // 7/4 = 和声七度 / 和声的七度 / harmonic seventh
		
		this.scorelines = new Konva.Group()
		this.scorelines2 = new Konva.Group()
		this.scorelines3 = new Konva.Group()
		this.scorelines4 = new Konva.Group()
		this.beatlines = new Konva.Group()
		this.edolines = new Konva.Group()
		this.scalelines = new Konva.Group()
		this.fifthlines = new Konva.Group()
		this.masterslavelines = new Konva.Group()
		this.tonicline = new Konva.Group()
		
		this.indicator = new Konva.Line({
			strokeWidth: 1,
			stroke: "#aaaaaa"
		})
		this._pianoRollOffset = 0   // 用户在卷帘模式下手动拖动的偏移（内容坐标）/ ユーザーがピアノロールモードで手動ドラッグしたオフセット（コンテンツ座標） / Manual drag offset in piano roll mode (content coords)
		this._isUserDragging = false
		// 动画帧：每帧更新播放指示线位置 / アニメーションフレーム：毎フレーム再生インジケーター位置を更新 / Animation frame: update playback indicator position each frame
		this.anim = new Konva.Animation(frame => {
			const transportX = t2x(Tone.Transport.ticks - OFFSET)
			const sx = this.stage.scaleX()
			const sy = this.stage.scaleY()
			const playing = Tone.Transport.state === 'started'
			if (this._pianoRoll) {
				const FIXED_X = window.innerWidth * 0.25
				if (playing) {
					// 播放中：自动滚屏跟随transport（含用户手动偏移），用户拖动时不覆盖
					if (!this._isUserDragging) {
						this.stage.x(FIXED_X - (transportX + this._pianoRollOffset) * sx)
					}
				}
				// 始终固定在FIXED_X屏幕位置：播放/暂停/拖动都不变
				this.indicator.x((FIXED_X - this.stage.x()) / sx)
			} else {
				this.indicator.x(transportX)
			}
			this.indicator.y(-this.stage.y() / sy)
			this.indicator.points([0, 0, 0, window.innerHeight / sy])
			// 播放中每帧更新网格位置（拖动时dragmove已处理；暂停时不需要自动跟滚）
			if (this._pianoRoll && playing) this.adjust()
		})
		this._pianoRoll = true  // 默认开启 / デフォルトで有効 / enabled by default
		
		this.loopStart = new Konva.Group({
			x: 0,
			opacity: 0.5,
			draggable: true
		}).add(
			new Konva.RegularPolygon({
				sides: 4, radius: 14, fill: '#f27999', stroke: 'white', strokeWidth: 0.5
			}),
			new Konva.RegularPolygon({
				sides: 3, radius: 8, fill: 'white', rotation: 90
			})
		).on('dragstart', e => {
			this.stage.isNoteDragging = true
		}).on('dragmove', e => {
			this.loopStart.x(qh(this.loopStart.x()))
			this.loopStart.y(-this.stage.y() / this.stage.scaleY() + 15)
		}).on('dragend', e => {
			this.stage.isNoteDragging = false
			this.setLoop()
		})
		this.loopEnd = new Konva.Group({
			x: 480,
			opacity: 0.5,
			draggable: true
		}).add(
			new Konva.RegularPolygon({
				sides: 4, radius: 14, fill: '#6cd985', stroke: 'white', strokeWidth: 0.5
			}),
			new Konva.RegularPolygon({
				sides: 3, radius: 8, fill: 'white', rotation: -90
			})
		).on('dragstart', e => {
			this.stage.isNoteDragging = true
		}).on('dragmove', e => {
			this.loopEnd.x(qh(this.loopEnd.x()))
			this.loopEnd.y(-this.stage.y() / this.stage.scaleY() + 15)
		}).on('dragend', e => {
			this.stage.isNoteDragging = false
			this.setLoop()
		})
		this.setLoop()
		
		this.add(this.edolines, this.fifthlines, this.masterslavelines, this.scalelines, this.scorelines4, this.scorelines3, this.scorelines2, this.scorelines, this.beatlines, this.tonicline, this.indicator, this.loopEnd, this.loopStart)
		// 非交互元素禁用 hit 检测，减少大量网格线的碰撞计算 / 非インタラクティブ要素のヒット検出を無効化し、大量のグリッド線の衝突計算を削減 / Disable hit detection on non-interactive elements to reduce collision checks
		this.scorelines.listening(false)
		this.scorelines2.listening(false)
		this.scorelines3.listening(false)
		this.scorelines4.listening(false)
		this.beatlines.listening(false)
		this.edolines.listening(false)
		this.scalelines.listening(false)
		this.fifthlines.listening(false)
		this.masterslavelines.listening(false)
		this.tonicline.listening(false)
		this.indicator.listening(false)
		this.drawScorelines()
		this.drawBeatlines()
		this.adjust()

		// 卷帘模式下手动拖动：stage移动 → 更新内容偏移，播放线保持屏幕位置不变 / ピアノロールモードでの手動ドラッグ：stage移動→コンテンツオフセット更新、再生線は画面位置固定 / Manual drag in piano roll: stage moves → update content offset, playback line stays fixed on screen
		stage.on('dragstart.pianoroll', e => {
			if (this._pianoRoll && Tone.Transport.state === 'started') {
				this._isUserDragging = true
			}
		})
		stage.on('dragmove.pianoroll', e => {
			if (this._pianoRoll && this._isUserDragging) {
				const transportX = t2x(Tone.Transport.ticks - OFFSET)
				const FIXED_X = window.innerWidth * 0.25
				const sx = this.stage.scaleX()
				// stage.x = FIXED_X - (transportX + offset) * sx
				// → offset = (FIXED_X - stage.x()) / sx - transportX
				this._pianoRollOffset = (FIXED_X - this.stage.x()) / sx - transportX
				this.adjust()
			}
		})
		stage.on('dragend.pianoroll', e => {
			this._isUserDragging = false
		})
	}
	
	// 重置卷帘偏移 / ピアノロールオフセットをリセット / Reset piano roll offset
	resetPianoRollOffset() {
		this._pianoRollOffset = 0
	}

	// 返回播放线当前指向的内容坐标（stage坐标系）/ 再生線が現在指しているコンテンツ座標を返す（stage座標系）/ Return the content coordinate the playback line currently points to (stage coords)
	getIndicatorContentX() {
		const FIXED_X = window.innerWidth * 0.25
		return (FIXED_X - this.stage.x()) / this.stage.scaleX()
	}

	// 基频属性的getter/setter / 基音プロパティのgetter/setter / Tonic property getter/setter
	get tonic() {
		return this._tonic
	}
	set tonic(v) {
		this._tonic = v
		$('#config-tonic').value = v
		localStorage.setItem('naf_tonic', v)
		this.drawScorelines()
	}
	
	// 拍长属性的getter/setter / 拍長プロパティのgetter/setter / Beat property getter/setter
	get beat() {
		return this._beat
	}
	set beat(v) {
		this._beat = v
		$('#config-beat').value = v
		localStorage.setItem('naf_beat', v)
		this.drawBeatlines()
	}

	// 获取某类符号的分段边界（返回 [{startX, endX, value}]）
	// 記号のセクション境界を取得
	_getSections(symbolType, globalValue) {
		const bounds = [{ x: -1e7, value: globalValue }]
		for (const d of (window._staffDirectives || [])) {
			if (d.type === symbolType) bounds.push({ x: d.x, value: d.value })
		}
		bounds.sort((a, b) => a.x - b.x)
		const sections = []
		for (let i = 0; i < bounds.length; i++) {
			sections.push({ startX: bounds[i].x, endX: bounds[i + 1] ? bounds[i + 1].x : 1e7, value: bounds[i].value })
		}
		return sections
	}
	// 查询 x 位置生效的分段值
	_sectionValueAt(sections, x) {
		let val = null
		for (const sec of sections) {
			if (sec.startX <= x) val = sec.value
		}
		return val
	}
	// 画分段横线：每段用该段 tonic 画间隔为 interval 的横线（绝对内容坐标，x 限制在段范围内）
	_drawSectionedLines(group, sections, interval, color, width) {
		const half = Math.ceil(window.innerHeight / this.stage.scaleY() / interval) + 1
		for (const sec of sections) {
			const tonic = sec.value || this.tonic
			const tonicY = hz2y(tonic)
			if (!tonicY) continue
			for (let i = -half; i <= half; i++) {
				group.add(new Konva.Line({
					points: [sec.startX, tonicY + interval * i, sec.endX, tonicY + interval * i],
					strokeWidth: width,
					stroke: color
				}))
			}
		}
	}
	// 绘制音高谱线（1d~4d维度，按 tonic 符号分段）
	drawScorelines() {
		this.scorelines.destroyChildren()
		this.scorelines2.destroyChildren()
		this.scorelines3.destroyChildren()
		this.scorelines4.destroyChildren()
		if (!this.tonic) return

		const sections = this._getSections('tonic', this.tonic)
		if ($('#config-scoreline-1d').checked) this._drawSectionedLines(this.scorelines, sections, this.octave, '#7e7d93', 3)
		if ($('#config-scoreline-2d').checked) this._drawSectionedLines(this.scorelines2, sections, this._2dInterval, '#8c6f88', 3)
		if ($('#config-scoreline-3d').checked) this._drawSectionedLines(this.scorelines3, sections, this._3dInterval, '#6cd985', 3)
		if ($('#config-scoreline-4d').checked) this._drawSectionedLines(this.scorelines4, sections, this._4dInterval, '#b598ee', 3)

		// 主音线（0d 基准线）：按 tonic 符号分段，每段在对应 tonic 处画一条粗横线
		this.tonicline.destroyChildren()
		if ($('#config-scoreline-0d')?.checked) {
			for (const sec of sections) {
				const t = sec.value || this.tonic
				const ty = hz2y(t)
				if (!ty) continue
				this.tonicline.add(new Konva.Line({
					points: [sec.startX, ty, sec.endX, ty],
					strokeWidth: 3,
					stroke: '#b5b4c2'
				}))
			}
		}
		this.drawEdoLines()
		this.adjust()
	}

	// 绘制 EDO 谱线：八度等分为 EDO 份的半透明横线（按 edo 符号分段，可超越全局 EDO）
	drawEdoLines() {
		this.edolines.destroyChildren()
		const check = $('#config-edo-lines')?.checked
		if (!check) return
		const globalEdo = parseInt($('#config-edo').value) || 12
		const sections = this._getSections('edo', globalEdo)
		const tonicSections = this._getSections('tonic', this.tonic)
		for (const sec of sections) {
			const edo = (sec.value >= 2) ? sec.value : 12
			const step = this.octave / edo  // 每个音高步的像素高度
			const tonic = this._sectionValueAt(tonicSections, sec.startX) || this.tonic
			const tonicY = hz2y(tonic)
			const half = Math.ceil(window.innerHeight / this.stage.scaleY() / step) + 1
			for (let i = -half; i <= half; i++) {
				this.edolines.add(new Konva.Line({
					points: [sec.startX, tonicY + step * i, sec.endX, tonicY + step * i],
					strokeWidth: 0.5,
					stroke: '#ffffff',
					opacity: 0.12
				}))
			}
		}
	}

	// 绘制调式谱线：调式内音的半透明横线（按调式段分段，每段使用对应调式内音）
	drawScaleLines() {
		this.scalelines.destroyChildren()
		if (!$('#config-scale-lines')?.checked) return
		const colorLines = $('#config-scale-color')?.checked
		const thick = parseFloat($('#config-scale-thick')?.value) || 0.8
		const depth = parseFloat($('#config-scale-depth')?.value) || 0.35
		const segments = window._scale?.segments || [{ startX: -1e7, tones: window._scale?.tones || [] }]
		// 以视口中心为基准、上下各铺约一屏（内容坐标），避免平移/缩放后下半部分谱线消失
		const sy = this.stage.scaleY() || 1
		const viewH = window.innerHeight / sy
		const centerY = (window.innerHeight / 2 - this.stage.y()) / sy
		const kMin = Math.floor((centerY - viewH) / 100) - 2
		const kMax = Math.ceil((centerY + viewH) / 100) + 2
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i]
			const s = (seg.startX === -Infinity) ? -1e7 : seg.startX
			const e = (segments[i + 1] ? (segments[i + 1].startX === -Infinity ? -1e7 : segments[i + 1].startX) : 1e7)
			if (s >= e) continue
			const tones = seg.tones || []
			if (!tones.length) continue
			for (const t of tones) {
				const yMod = ((hz2y(t.hz) % 100) + 100) % 100
				for (let k = kMin; k <= kMax; k++) {
					this.scalelines.add(new Konva.Line({
						points: [s, yMod + 100 * k, e, yMod + 100 * k],
						strokeWidth: thick,
						stroke: colorLines ? t.color : '#ffffff',
						opacity: depth
					}))
				}
			}
		}
	}

	// 绘制五度扩展谱线：选中和弦的根音按 2d（五度）上下堆叠，再叠加 xd 音程谱线
	drawFifthLines() {
		this.fifthlines.destroyChildren()
		if (!$('#config-fifth-extend')?.checked) return
		const colorLines = $('#config-scale-color')?.checked
		const segments = window._fifth?.segments || []
		const interval = this._2dInterval   // 五度（3/2）间距
		const sy = this.stage.scaleY() || 1
		const viewH = window.innerHeight / sy
		const centerY = (window.innerHeight / 2 - this.stage.y()) / sy
		const topY = centerY - viewH - 200
		const bottomY = centerY + viewH + 200
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i]
			if (seg.rootHz == null) continue
			const s = seg.startX === -Infinity ? -1e7 : seg.startX
			const e = (segments[i + 1] ? (segments[i + 1].startX === -Infinity ? -1e7 : segments[i + 1].startX) : 1e7)
			if (s >= e) continue
			const rootY = hz2y(seg.rootHz)
			if (rootY == null) continue
			const bases = [{ y: rootY, color: colorLines ? '#f27992' : '#ffffff' }]
			if (seg.xdHz != null) {
				const xdY = hz2y(seg.xdHz)
				if (xdY != null) bases.push({ y: xdY, color: colorLines ? (seg.xdColor || '#ffffff') : '#ffffff' })
			}
			for (const b of bases) {
				const kMin = Math.floor((topY - b.y) / interval) - 1
				const kMax = Math.ceil((bottomY - b.y) / interval) + 1
				for (let k = kMin; k <= kMax; k++) {
					this.fifthlines.add(new Konva.Line({
						points: [s, b.y + interval * k, e, b.y + interval * k],
						strokeWidth: 0.8,
						stroke: b.color,
						opacity: 0.35
					}))
				}
			}
		}
	}

	// 绘制主从扩展谱线：基准音高按主维度上下堆叠，从维度线基于每条主维度线再向上附加
	drawMasterSlaveLines() {
		this.masterslavelines.destroyChildren()
		if (!$('#config-master-slave-extend')?.checked) return
		const ms = window._masterSlave
		if (!ms) return
		const colorLines = $('#config-scale-color')?.checked
		const rootHz = ms.rootHz || this.tonic
		const main = pitchIntervals[ms.mainKey] || pitchIntervals['2d']
		const sub = pitchIntervals[ms.subKey] || pitchIntervals['3d']
		const rootY = hz2y(rootHz)
		if (rootY == null) return
		const intervalMain = f2d(main.d, main.n)   // 主维度间距
		const intervalSub = f2d(sub.d, sub.n)      // 从维度间距
		if (!intervalMain || !intervalSub) return
		const sy = this.stage.scaleY() || 1
		const viewH = window.innerHeight / sy
		const centerY = (window.innerHeight / 2 - this.stage.y()) / sy
		const topY = centerY - viewH - 200
		const bottomY = centerY + viewH + 200
		const kMin = Math.floor((topY - rootY) / intervalMain) - 1
		const kMax = Math.ceil((bottomY - rootY) / intervalMain) + 1
		const mainColor = colorLines ? (main.c || '#ffffff') : '#ffffff'
		const subColor = colorLines ? (sub.c || '#ffffff') : '#ffffff'
		for (let k = kMin; k <= kMax; k++) {
			const my = rootY + intervalMain * k
			// 主维度线
			this.masterslavelines.add(new Konva.Line({
				points: [-1e7, my, 1e7, my],
				strokeWidth: 0.8,
				stroke: mainColor,
				opacity: 0.35
			}))
			// 从维度线：基于主维度线向上附加一条
			this.masterslavelines.add(new Konva.Line({
				points: [-1e7, my - intervalSub, 1e7, my - intervalSub],
				strokeWidth: 0.8,
				stroke: subColor,
				opacity: 0.35
			}))
		}
	}

	// 绘制节拍竖线 / ビート縦線を描画 / Draw beat vertical lines
	drawBeatlines() {
		this.beatlines.destroyChildren()
		if (!this.beat) return
		// 分割谱线未勾选时不画任何竖线（节拍竖线与细分线都不显示）
		if ($('#config-subdivide-lines')?.checked) {
			const lineCount = Math.ceil(window.innerWidth / this.stage.scaleX() / 48) + 1
			for (const i of range(lineCount)) {
				this.beatlines.add(new Konva.Line({
					x: 48 * i,
					y: 0,
					points: [0, 0, 0, window.innerHeight / this.stage.scaleY()],
					strokeWidth: 1,
					stroke: '#7e7d93'
				}))
			}
			// 细分谱线
			this.drawSubdivisionLines()
		}
		this.adjust()
		Tone.Transport.bpm.value = 60000 / ($('#config-beat').value || 500)
	}

	// 细分谱线：在拍之间插入更细更透明的竖线（按拍号 BEAT=1/N 符号分段）
	drawSubdivisionLines() {
		try {
		const subEl = document.getElementById('config-subdivide-lines')
		if (!subEl?.checked) return
		const tickEl = document.getElementById('config-tick')
		const globalTick = tickEl ? (parseInt(tickEl.value) || 1) : 1
		const sections = this._getSections('timesig', globalTick)
		const left = Math.floor(-this.stage.x() / this.stage.scaleX() / 48) * 48
		const right = left + window.innerWidth / this.stage.scaleX()
		for (const sec of sections) {
			const tick = sec.value >= 2 ? sec.value : 1
			if (tick <= 1) continue
			const s = Math.max(sec.startX, left)
			const e = Math.min(sec.endX, right)
			if (s >= e) continue
			const startBeat = Math.floor(s / 48)
			const endBeat = Math.ceil(e / 48)
			for (let i = startBeat; i <= endBeat; i++) {
				for (let j = 1; j < tick; j++) {
					const absX = 48 * i + (48 / tick) * j
					if (absX < s || absX >= e) continue
					this.beatlines.add(new Konva.Line({
						x: absX - left,
						y: 0,
						points: [0, 0, 0, window.innerHeight / this.stage.scaleY()],
						strokeWidth: 0.5,
						stroke: '#7e7d93',
						opacity: 0.35
					}))
				}
			}
		}
		} catch(err) { console.error('drawSubdivisionLines error:', err) }
	}
	// 仅更新位置（画布平移/缩放时调用） / 位置のみ更新（キャンバス移動・ズーム時に呼出） / Adjust positions only (called on canvas pan/zoom)
	adjust() {
		// 分段谱线使用绝对内容坐标，group 不平移（Konva 随 stage 平移/缩放自动显示）
		this.scorelines.x(0)
		this.scorelines.y(0)
		this.scorelines2.x(0)
		this.scorelines2.y(0)
		this.scorelines3.x(0)
		this.scorelines3.y(0)
		this.scorelines4.x(0)
		this.scorelines4.y(0)
		this.edolines.x(0)
		this.edolines.y(0)
		this.scalelines.x(0)
		this.scalelines.y(0)
		this.fifthlines.x(0)
		this.fifthlines.y(0)
		this.masterslavelines.x(0)
		this.masterslavelines.y(0)
		this.tonicline.x(0)
		this.tonicline.y(0)

		const left = Math.floor(-this.stage.x() / this.stage.scaleX() / 48) * 48
		this.beatlines.x(left)
		this.beatlines.y(-this.stage.y() / this.stage.scaleY())

		this.loopStart.y(-this.stage.y() / this.stage.scaleY() + 15)
		this.loopEnd.y(-this.stage.y() / this.stage.scaleY() + 15)
	}
	
	// 显示/隐藏播放指示器 / 再生インジケーターの表示・非表示 / Show/hide playback indicator
	showIndicator() {
		this.anim.start()
		this.indicator.show()
	}
	hideIndicator() {
		this.indicator.hide()
		this.anim.stop()
	}

	// 设置卷帘模式开关 / ピアノロールモードのオンオフ / Toggle piano roll mode
	setPianoRoll(v) {
		this._pianoRoll = v
		if (!v) this._pianoRollOffset = 0
	}
	
	// 将循环起止位置同步到 Tone.Transport / ループ開始・終了位置をTone.Transportに同期 / Sync loop start/end positions to Tone.Transport
	setLoop() {
		Tone.Transport.loopStart = x2t(this.loopStart.x()) + OFFSET + "i"
		Tone.Transport.loopEnd = x2t(this.loopEnd.x()) + OFFSET + "i"
	}

	// 自动将循环箭头分配到最左/最右音符
	// ループ矢印を最も左・最も右の音符に自動配置
	// Automatically position loop arrows at the leftmost/rightmost notes
	autoLoop() {
		const children = rootlayer.getChildren()
		if (children.length === 0) return

		let minX = Infinity, maxX = -Infinity
		for (const note of children) {
			const x = note.x()
			const len = note.len || 48
			if (x < minX) minX = x
			if (x + len > maxX) maxX = x + len
		}

		const pad = 48  // 1拍间距
		this.loopStart.x(minX - pad)
		this.loopEnd.x(maxX + pad)
		this.setLoop()
		this.batchDraw()
	}

	// 修复非等比缩放时红绿箭头和根音标记变形
	// 非等比拡大縮小時に赤緑矢印とルートマークの変形を修正
	// Fix distortion of red/green arrows and root mark under non-uniform scaling
	fixArrowScale() {
		const sx = this.stage.scaleX() || 1
		const sy = this.stage.scaleY() || 1
		const isx = 1 / sx, isy = 1 / sy
		// 循环箭头（外框菱形旋转0°→不交换；内三角旋转90°/-90°→需交换）
		for (const g of [this.loopStart, this.loopEnd]) {
			for (const child of g.children) {
				const rot = child.rotation()
				if (Math.abs(rot) === 90) {
					child.scaleX(isy)  // 交换
					child.scaleY(isx)
				} else {
					child.scaleX(isx)
					child.scaleY(isy)
				}
			}
		}
		// 根音标记 rotation:90 → 交换
		for (const n of rootlayer.getChildren()) {
			if (n.mark) { n.mark.scaleX(isy); n.mark.scaleY(isx) }
		}
		this.batchDraw()
	}
}
