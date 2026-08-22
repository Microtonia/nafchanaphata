/*
 * 谱表符号模块：把时间线上的「文字指令」解析为分段标记
 * 譜表記号モジュール：タイムライン上の「テキスト指令」をセクションマークとして解析
 * Staff symbol module: parse "text directives" on the timeline into section markers
 *
 * 谱表符号本质上是识别特殊文字（用 LapisiaA 字体标注），例如：
 *   EDO=24  BEAT=500  BPM=120  TONIC=440  SCALE  ||:  :||  :||=2  P/PP/PPP/MF/F/FF/FFF
 * 解析结果写入 window._staffDirectives，供谱线/量化/播放使用。
 * 被识别的文字左侧会渲染一条竖线。
 */

import { $, x2t, OFFSET } from './util.js'
import { grid, rootlayer } from './sequencer.js'
import { sampler } from './sound.js'

// 指令类型对应的竖线颜色
const STAFF_COLORS = {
	edo: '#7aa2ff',
	beat: '#ffc247',
	timesig: '#f2c94c',
	bpm: '#ffc247',
	tonic: '#6cd985',
	scale: '#b598ee',
	loopstart: '#f27992',
	loopend: '#f27992',
	velocity: '#ed9877'
}

// 力度标记 → 相对音量
const VELOCITY_MAP = {
	'PPP': 0.15, 'PP': 0.3, 'P': 0.45, 'MP': 0.55,
	'MF': 0.65, 'F': 0.8, 'FF': 0.9, 'FFF': 1.0
}

// 谱表符号框按钮定义（点击后在文字栏插入前缀文本，用 LapisiaA 字体）
const STAFF_BUTTONS = [
	{ label: 'EDO=',      text: 'EDO=',      hint: 'EDO=整数' },
	{ label: 'DURATION=', text: 'DURATION=', hint: 'DURATION=拍长ms' },
	{ label: 'BEAT=1/',   text: 'BEAT=1/',   hint: 'BEAT=1/每小节拍数' },
	{ label: 'BPM=',      text: 'BPM=',      hint: 'BPM=拍/分' },
	{ label: 'TONIC=',    text: 'TONIC=',    hint: 'TONIC=Hz' },
	{ label: 'SCALE',     text: 'SCALE',     hint: '调式清零' },
	{ label: '||:',       text: '||:',       hint: '循环节开始' },
	{ label: ':||',       text: ':||',       hint: '循环节结束（可=次数）' },
	{ label: 'PPP',       text: 'PPP',       hint: '力度 ppp' },
	{ label: 'PP',        text: 'PP',        hint: '力度 pp' },
	{ label: 'P',         text: 'P',         hint: '力度 p' },
	{ label: 'MP',        text: 'MP',        hint: '力度 mp' },
	{ label: 'MF',        text: 'MF',        hint: '力度 mf' },
	{ label: 'F',         text: 'F',         hint: '力度 f' },
	{ label: 'FF',        text: 'FF',        hint: '力度 ff' },
	{ label: 'FFF',       text: 'FFF',       hint: '力度 fff' },
]

// 解析单个文本，返回指令对象或 null
function matchDirective(raw) {
	const s = (raw || '').trim()
	if (!s) return null
	let m
	if ((m = s.match(/^EDO=(\d+)$/))) return { type: 'edo', value: parseInt(m[1]) }
	if ((m = s.match(/^DURATION=(\d+(?:\.\d+)?)$/))) return { type: 'beat', value: parseFloat(m[1]) }
	if ((m = s.match(/^BEAT=1\/(\d+)$/))) return { type: 'timesig', value: parseInt(m[1]) }
	if ((m = s.match(/^BPM=(\d+(?:\.\d+)?)$/))) return { type: 'bpm', value: parseFloat(m[1]) }
	if ((m = s.match(/^TONIC=(\d+(?:\.\d+)?)$/))) return { type: 'tonic', value: parseFloat(m[1]) }
	if (s === 'SCALE') return { type: 'scale' }
	if (s === '||:') return { type: 'loopstart' }
	if ((m = s.match(/^:\|\|(?:=(\d+))?$/))) {
		// :||=N 表示「一共播放 N 次」；:||（无数字）默认一共 2 次
		const total = m[1] ? parseInt(m[1]) : 2
		return { type: 'loopend', times: total - 1 }
	}
	if (VELOCITY_MAP[s] != null) return { type: 'velocity', value: VELOCITY_MAP[s] }
	return null
}

// 指令 token 的全局匹配（按最长的力度标记优先，避免 P 误吞 PP）
const TOKEN_REGEX = /EDO=\d+|DURATION=\d+(?:\.\d+)?|BEAT=1\/\d+|BPM=\d+(?:\.\d+)?|TONIC=\d+(?:\.\d+)?|:\|\|(?:=\d+)?|\|\|:|SCALE|PPP|FFF|PP|FF|MP|MF|P|F/g

// 解析多段文本：直接匹配所有指令 token（不依赖空白分隔），支持一个文字包含多个谱表符号
function matchDirectives(raw) {
	const result = []
	const tokens = String(raw || '').match(TOKEN_REGEX) || []
	for (const tok of tokens) {
		const d = matchDirective(tok)
		if (d) result.push(d)
	}
	return result
}

// 重新解析所有文字标注，更新竖线样式与 window._staffDirectives
function parseStaff() {
	const list = []
	for (const t of window._textSel?.all || []) {
		const text = (t.text != null && t.text !== '') ? t.text : (t.html?.textContent || '')
		const directives = matchDirectives(text)
		t._staffDirective = directives.length ? directives[0] : null
		if (directives.length) {
			for (const d of directives) {
				d.x = t.konva.x()
				d.textNote = t
				list.push(d)
			}
		}
		applyMark(t, t._staffDirective)
	}
	list.sort((a, b) => a.x - b.x)
	window._staffDirectives = list
	// 通知谱线/调式段刷新
	window._staffChanged?.()
	return list
}

// 应用竖线样式到文字元素
function applyMark(t, d) {
	if (!t.html) return
	if (d) {
		t.html.style.borderLeft = '2px solid ' + (STAFF_COLORS[d.type] || '#ffc247')
		t.html.style.paddingLeft = '5px'
	} else {
		t.html.style.borderLeft = 'none'
		t.html.style.paddingLeft = '0'
	}
}

// 查询 x 位置生效的分段参数（tonic/edo 用于量化，velocity 用于力度，tick 用于时间分辨率）
function getStaffState(x) {
	let beat = null, bpm = null, tonic = null, edo = null, velocity = null, tick = null
	for (const d of window._staffDirectives || []) {
		if (d.x > x) break
		if (d.type === 'beat') beat = d.value
		else if (d.type === 'bpm') bpm = d.value
		else if (d.type === 'tonic') tonic = d.value
		else if (d.type === 'edo') edo = d.value
		else if (d.type === 'velocity') velocity = d.value
		else if (d.type === 'timesig') tick = d.value
	}
	return { beat, bpm, tonic, edo, velocity, tick }
}

// 获取某类指令的分段边界（供 grid.js 谱线分段使用）
function getStaffSections(type, globalValue) {
	const bounds = [{ x: -1e7, value: globalValue }]
	for (const d of window._staffDirectives || []) {
		if (d.type === type) bounds.push({ x: d.x, value: d.value })
	}
	bounds.sort((a, b) => a.x - b.x)
	const sections = []
	for (let i = 0; i < bounds.length; i++) {
		sections.push({ startX: bounds[i].x, endX: bounds[i + 1] ? bounds[i + 1].x : 1e7, value: bounds[i].value })
	}
	return sections
}

// 变速调度 ID（用于停止时清理）
let _tempoScheduleIds = []

// 播放前应用分段速度（beat=ms、bpm=拍/分 统一转成 Tone.Transport.bpm）
function applyStaffTempo() {
	// 清理旧的变速调度
	for (const id of _tempoScheduleIds) Tone.Transport.clear(id)
	_tempoScheduleIds = []

	const bpm = Tone.Transport.bpm
	// 清空之前的 bpm 自动化（含历史残留），重置为全局起始速度
	bpm.cancelScheduledValues(0)
	bpm.setValueAtTime(60000 / grid.beat, 0)

	const dirs = (window._staffDirectives || []).filter(d => d.type === 'beat' || d.type === 'bpm')
	for (const d of dirs) {
		const bpmVal = d.type === 'bpm' ? d.value : 60000 / d.value
		const ticks = x2t(d.x) + OFFSET
		// 在变速点用精确的 transport 时间设置 bpm（ticks 调度会自动跟随 bpm 变化）
		const id = Tone.Transport.schedule((time) => {
			Tone.Transport.bpm.setValueAtTime(bpmVal, time)
		}, ticks + 'i')
		_tempoScheduleIds.push(id)
	}
}

// 停止变速调度
function stopTempoMonitor() {
	for (const id of _tempoScheduleIds) Tone.Transport.clear(id)
	_tempoScheduleIds = []
}

// === 循环节（反复记号）播放 ===

// 配对 ||: 和 :|| 循环节（栈式匹配）
function pairLoops() {
	const stack = []
	const loops = []
	const loopDirs = (window._staffDirectives || []).filter(d => d.type === 'loopstart' || d.type === 'loopend')
	for (const d of loopDirs) {
		if (d.type === 'loopstart') {
			stack.push(d.x)
		} else {
			const startX = stack.length ? stack.pop() : grid.loopStart.x()
			loops.push({ startTick: x2t(startX) + OFFSET, endTick: x2t(d.x) + OFFSET, times: d.times || 1 })
		}
	}
	return loops
}

// 构建全局播放（含力度），替代每个 root 的 Tone.Part；循环反复由 seek 跳回实现
function buildPlayback() {
	// 清除旧的全局 Part 和所有 per-root Part
	if (window._playbackPart) { window._playbackPart.dispose(); window._playbackPart = null }
	for (const root of rootlayer.getChildren()) {
		if (root._part) { root._part.dispose(); root._part = null }
	}

	// 收集所有音符（绝对 ticks，不展开）
	const notes = []
	for (const root of rootlayer.getChildren()) {
		const head = root.noteHead
		for (const n of root.notes) {
			notes.push({
				startTick: head + n._time,
				lenTick: n._len,
				hz: n.hz,
				vol: n.vol,
				absX: n.absX
			})
		}
	}
	notes.sort((a, b) => a.startTick - b.startTick)

	const data = notes.map(n => ({
		time: n.startTick + 'i',
		hz: n.hz,
		len: n.lenTick + 'i',
		vol: n.vol,
		absX: n.absX
	}))
	window._playbackPart = new Tone.Part((time, note) => {
		if (!sampler.loaded) return
		let vol = note.vol
		const st = window._getStaffState ? window._getStaffState(note.absX) : null
		if (st && st.velocity != null) vol = note.vol * st.velocity
		sampler.triggerAttackRelease(note.hz, note.len, time, vol)
	}, data).start("0i")
	window._playbackPart.humanize = ($('#config-humanize').value || 0) / 1000
}

// 循环节播放状态（用于 seek 跳回，声音与显示一并反复）
let _loopScheduleIds = []
let _loopStates = null

// 启动循环节监控（播放开始时调用）：在 :|| 处 seek 回 ||:，直到反复次数用尽
function startLoopMonitor() {
	stopLoopMonitor()
	const loops = pairLoops()
	if (!loops.length) return
	_loopStates = loops.map(l => ({ start: l.startTick, end: l.endTick, remaining: l.times }))
	for (let i = 0; i < loops.length; i++) {
		const id = Tone.Transport.schedule((time) => {
			const s = _loopStates && _loopStates[i]
			if (s && s.remaining > 0) {
				s.remaining--
				Tone.Transport.ticks = s.start
			}
		}, loops[i].endTick + "i")
		_loopScheduleIds.push(id)
	}
}

// 停止循环节监控
function stopLoopMonitor() {
	for (const id of _loopScheduleIds) Tone.Transport.clear(id)
	_loopScheduleIds = []
	_loopStates = null
}

// 向文字编辑器插入谱表符号前缀（LapisiaA 字体）
function insertStaffText(text) {
	const editor = $('#text-edit-content')
	if (!editor) return
	editor.focus()
	const span = document.createElement('span')
	span.style.fontFamily = '"LapisiaA", serif'
	span.textContent = text
	const sel = window.getSelection()
	if (sel.rangeCount) {
		const range = sel.getRangeAt(0)
		range.deleteContents()
		range.insertNode(span)
		range.setStartAfter(span)
		range.collapse(true)
		sel.removeAllRanges()
		sel.addRange(range)
	} else {
		editor.appendChild(span)
	}
}

// 构建谱表符号框按钮
function buildStaffSymbols() {
	const box = $('#staff-symbols')
	if (!box) return
	box.innerHTML = ''
	for (const b of STAFF_BUTTONS) {
		const btn = document.createElement('button')
		btn.textContent = b.label
		btn.title = b.hint
		btn.style.fontFamily = '"LapisiaA", serif'
		btn.style.fontSize = '16px'
		btn.style.background = '#3a3a56'
		btn.style.color = '#fff'
		btn.style.border = '1px solid #555'
		btn.style.borderRadius = '3px'
		btn.style.padding = '0'
		btn.style.cursor = 'pointer'
		btn.style.width = '100%'
		btn.style.height = '30px'
		btn.style.boxSizing = 'border-box'
		btn.style.display = 'flex'
		btn.style.alignItems = 'center'
		btn.style.justifyContent = 'center'
		btn.onclick = () => insertStaffText(b.text)
		box.appendChild(btn)
	}
}

// 初始化
buildStaffSymbols()
parseStaff()

// 暴露给其它模块
window._parseStaff = parseStaff
window._staffDirectives = []
window._getStaffState = getStaffState
window._getStaffSections = getStaffSections
window._applyStaffTempo = applyStaffTempo
window._stopTempoMonitor = stopTempoMonitor
window._buildPlayback = buildPlayback
window._startLoopMonitor = startLoopMonitor
window._stopLoopMonitor = stopLoopMonitor
window._insertStaffText = insertStaffText
