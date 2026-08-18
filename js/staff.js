/*
 * 谱表符号模块：把时间线上的「文字指令」解析为分段标记
 * 譜表記号モジュール：タイムライン上の「テキスト指令」をセクションマークとして解析
 * Staff symbol module: parse "text directives" on the timeline into section markers
 *
 * 谱表符号本质上是识别特殊文字（用 Times 字体标注），例如：
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

// 谱表符号框按钮定义（点击后在文字栏插入前缀文本，用 Times 字体）
const STAFF_BUTTONS = [
	{ label: 'EDO=',  text: 'EDO=',  hint: 'EDO=整数' },
	{ label: 'BEAT=', text: 'BEAT=', hint: 'BEAT=拍长ms' },
	{ label: 'BPM=',  text: 'BPM=',  hint: 'BPM=拍/分' },
	{ label: 'TONIC=', text: 'TONIC=', hint: 'TONIC=Hz' },
	{ label: 'SCALE', text: 'SCALE', hint: '调式清零' },
	{ label: '||:',   text: '||:',   hint: '循环节开始' },
	{ label: ':||',   text: ':||',   hint: '循环节结束（可=次数）' },
	{ label: 'PPP',   text: 'PPP',   hint: '力度 ppp' },
	{ label: 'PP',    text: 'PP',    hint: '力度 pp' },
	{ label: 'P',     text: 'P',     hint: '力度 p' },
	{ label: 'MP',    text: 'MP',    hint: '力度 mp' },
	{ label: 'MF',    text: 'MF',    hint: '力度 mf' },
	{ label: 'F',     text: 'F',     hint: '力度 f' },
	{ label: 'FF',    text: 'FF',    hint: '力度 ff' },
	{ label: 'FFF',   text: 'FFF',   hint: '力度 fff' },
]

// 解析单个文本，返回指令对象或 null
function matchDirective(raw) {
	const s = (raw || '').trim()
	if (!s) return null
	let m
	if ((m = s.match(/^EDO=(\d+)$/))) return { type: 'edo', value: parseInt(m[1]) }
	if ((m = s.match(/^BEAT=(\d+(?:\.\d+)?)$/))) return { type: 'beat', value: parseFloat(m[1]) }
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

// 重新解析所有文字标注，更新竖线样式与 window._staffDirectives
function parseStaff() {
	const list = []
	for (const t of window._textSel?.all || []) {
		const text = (t.text != null && t.text !== '') ? t.text : (t.html?.textContent || '')
		const d = matchDirective(text)
		t._staffDirective = d
		if (d) {
			d.x = t.konva.x()
			d.textNote = t
			list.push(d)
		}
		applyMark(t, d)
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

// 查询 x 位置生效的分段参数（tonic/edo 用于量化，velocity 用于力度）
function getStaffState(x) {
	let beat = null, bpm = null, tonic = null, edo = null, velocity = null
	for (const d of window._staffDirectives || []) {
		if (d.x > x) break
		if (d.type === 'beat') beat = d.value
		else if (d.type === 'bpm') bpm = d.value
		else if (d.type === 'tonic') tonic = d.value
		else if (d.type === 'edo') edo = d.value
		else if (d.type === 'velocity') velocity = d.value
	}
	return { beat, bpm, tonic, edo, velocity }
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

// 播放前应用分段速度（beat=ms、bpm=拍/分 统一转成 Tone.Transport.bpm）
function applyStaffTempo() {
	const bpm = Tone.Transport.bpm
	bpm.cancelScheduledValues(0)
	const globalBeat = (typeof grid !== 'undefined' && grid?.beat) ? grid.beat : 500
	bpm.value = 60000 / globalBeat

	const dirs = (window._staffDirectives || []).filter(d => d.type === 'beat' || d.type === 'bpm')
	if (!dirs.length) return

	const loopStartX = (typeof grid !== 'undefined') ? grid.loopStart.x() : 0
	const loopStartTicks = x2t(loopStartX) + OFFSET
	const loopStartSec = loopStartTicks / 192 * globalBeat / 1000

	let sec = 0
	let prevX = loopStartX
	let prevBeatMs = globalBeat
	for (const d of dirs) {
		if (d.x <= prevX) continue
		sec += (d.x - prevX) / 48 * prevBeatMs / 1000
		const bpmVal = d.type === 'bpm' ? d.value : 60000 / d.value
		bpm.setValueAtTime(bpmVal, loopStartSec + sec)
		prevX = d.x
		prevBeatMs = d.type === 'bpm' ? 60000 / d.value : d.value
	}
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

// 向文字编辑器插入谱表符号前缀（Times 字体）
function insertStaffText(text) {
	const editor = $('#text-edit-content')
	if (!editor) return
	editor.focus()
	const span = document.createElement('span')
	span.style.fontFamily = '"Times New Roman", serif'
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
		btn.style.fontFamily = '"Times New Roman", serif'
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
window._buildPlayback = buildPlayback
window._startLoopMonitor = startLoopMonitor
window._stopLoopMonitor = stopLoopMonitor
window._insertStaffText = insertStaffText
