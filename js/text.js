/*
 * 文字模块：画布文字注释的添加、编辑、选中、复制/粘贴/剪切
 * テキストモジュール：キャンバス文字注釈の追加・編集・選択・コピー/貼り付け/切り取り
 * Text module: add, edit, select, copy/paste/cut text annotations on canvas
 *
 * 文字渲染采用 HTML 元素（而非 Konva.Text/canvas），
 * 以保证 OpenType 连字（如 Fglyph 的 -1→<）与输入框显示完全一致。
 */

import { stage } from './sequencer.js'
import { $, y2hz } from './util.js'
import history from './history.js'

// 文字锚点图层（用于 Konva 拖动/命中检测） // テキストアンカーレイヤー（Konvaドラッグ/当たり判定用）
export const textlayer = new Konva.Layer()
stage.add(textlayer)

// HTML 文字渲染层（叠加在画布上方） // HTMLテキスト描画レイヤー（キャンバスの上に重ねる）
export const textHtmlLayer = (() => {
	const el = document.createElement('div')
	el.id = 'text-html-layer'
	el.style.cssText = 'position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:20;'
	document.getElementById('sequencer').appendChild(el)
	return el
})()

// 可选字体列表 // 選択可能なフォント一覧 // Selectable font list
export const FONTS = [
	{ family: 'Arial', label: 'Arial' },
	{ family: 'Times New Roman', label: 'Times' },
	{ family: 'Courier New', label: 'Courier' },
	{ family: 'Georgia', label: 'Georgia' },
	{ family: 'Verdana', label: 'Verdana' },
	{ family: 'serif', label: 'Serif' },
	{ family: 'sans-serif', label: 'Sans' },
	{ family: 'monospace', label: 'Mono' },
	{ family: 'Fglyph', label: 'Fglyph' },
	{ family: 'ShasavMusic', label: 'Shasav' },
	{ family: 'Linshiziti', label: '临时字体' },
	{ family: 'LapisiaA', label: 'LapisiaA' },
]

// 可选符号列表：Fglyph 取 #2→#134，ShasavMusic 取 #11→#44（其余符号不用）
// 選択可能な記号一覧：Fglyph は #2→#134、ShasavMusic は #11→#44
// Selectable symbols: Fglyph #2→#134, ShasavMusic #11→#44
export const GLYPHS = [
	// Fglyph（#2 到 #134 之间有 Unicode 映射的符号）
	{ char: 'A', font: 'Fglyph' },
	{ char: 'B', font: 'Fglyph' },
	{ char: 'C', font: 'Fglyph' },
	{ char: 'a', font: 'Fglyph' },
	{ char: 'b', font: 'Fglyph' },
	{ char: 'c', font: 'Fglyph' },

	{ char: '*', font: 'Fglyph' },
	{ char: '`', font: 'Fglyph' },
	{ char: "'", font: 'Fglyph' },

	{ char: ',', font: 'Fglyph' },
	{ char: '_', font: 'Fglyph' },
	{ char: '.', font: 'Fglyph' },

	{ char: 'v', font: 'Fglyph' },
	{ char: 'x', font: 'Fglyph' },
	{ char: '^', font: 'Fglyph' },
	{ char: ';', font: 'Fglyph' },
	{ char: ':', font: 'Fglyph' },

	{ char: '0', font: 'Fglyph' },
	{ char: '1', font: 'Fglyph' },
	{ char: '2', font: 'Fglyph' },
	{ char: '3', font: 'Fglyph' },
	{ char: '4', font: 'Fglyph' },
	{ char: '5', font: 'Fglyph' },
	{ char: '-1', font: 'Fglyph' },
	{ char: '-2', font: 'Fglyph' },
	{ char: '-3', font: 'Fglyph' },
	{ char: '-4', font: 'Fglyph' },
	{ char: '-5', font: 'Fglyph' },

	{ char: '{', font: 'Fglyph' },
	{ char: '}', font: 'Fglyph' },
	{ char: "'", font: 'Fglyph' },
	{ char: ',', font: 'Fglyph' },
	{ char: '+', font: 'Fglyph' },
	{ char: '±', font: 'Fglyph' },

	{ char: '\u0304', font: 'Fglyph' },
	{ char: '\u030A', font: 'Fglyph' },
	{ char: '\u0320', font: 'Fglyph' },
	{ char: '\u0325', font: 'Fglyph' },

	// ShasavMusic（#11 到 #44）
	{ char: '↑', font: 'ShasavMusic' },
	{ char: '↓', font: 'ShasavMusic' },
	{ char: '\uE000', font: 'ShasavMusic' },
	{ char: '\uE001', font: 'ShasavMusic' },
	{ char: '\uE002', font: 'ShasavMusic' },
	{ char: '\uE003', font: 'ShasavMusic' },
	{ char: '\uE004', font: 'ShasavMusic' },
	{ char: '\uE005', font: 'ShasavMusic' },
	{ char: '\uE006', font: 'ShasavMusic' },
	{ char: '\uE007', font: 'ShasavMusic' },
	{ char: '\uE011', font: 'ShasavMusic' },
	{ char: '\uE012', font: 'ShasavMusic' },
	{ char: '\uE013', font: 'ShasavMusic' },
	{ char: '\uE014', font: 'ShasavMusic' },
	{ char: '\uE015', font: 'ShasavMusic' },
	{ char: '\uE016', font: 'ShasavMusic' },
	{ char: '\uE017', font: 'ShasavMusic' },
	{ char: '\uE021', font: 'ShasavMusic' },
	{ char: '\uE022', font: 'ShasavMusic' },
	{ char: '\uE023', font: 'ShasavMusic' },
	{ char: '\uE024', font: 'ShasavMusic' },
	{ char: '\uE025', font: 'ShasavMusic' },
	{ char: '\uE026', font: 'ShasavMusic' },
	{ char: '\uE027', font: 'ShasavMusic' },
]

// 渲染文本（直接返回原文本，连字由 HTML 渲染引擎的 OpenType 特性处理）
// 描画テキスト（元のテキストをそのまま返す。合字は HTML レンダリングエンジンの OpenType 機能で処理）
// Render text (returns original text; ligatures handled by HTML rendering engine)
function renderText(text) {
	return text
}

// 转义 HTML 特殊字符（纯文本 → 安全 HTML） // HTML 特殊文字をエスケープ（プレーンテキスト→安全な HTML）
function escapeHtml(s) {
	return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

// 文字节点类 // テキストノードクラス // Text node class
export class TextNote {
	constructor(text, x, y, opts = {}) {
		this.text = text ?? ''
		this.htmlText = opts.htmlText || ''  // 富文本 HTML（支持每段不同字体/大小/颜色）
		this.fill = opts.fill || '#ffffff'
		this.fontSize = opts.fontSize || 30
		this.fontFamily = opts.fontFamily || 'Arial'

		// Konva 锚点（用于拖动、命中检测、位置存储）
		this.konva = new Konva.Group({ x, y, draggable: true })
		this.hitRect = new Konva.Rect({
			x: 0, y: 0,
			width: 10, height: 10,
			fill: 'rgba(0,0,0,0.02)',
			name: 'text-hit'
		})
		this.konva.add(this.hitRect)

		// HTML 元素渲染文字
		this.html = document.createElement('div')
		this.html.className = 'text-note-html'
		this.html.style.cssText = 'position:absolute;left:0;top:0;transform-origin:left top;pointer-events:none;cursor:move;white-space:pre;line-height:1;user-select:none;letter-spacing:normal;'
		textHtmlLayer.appendChild(this.html)

		this.applyHtml()
		this.highlight(false)

		// 点击：切换/选中
		this.konva.on('pointerclick', e => {
			e.cancelBubble = true
			if (e.evt.shiftKey) {
				TextSel.toggle(this)
			} else {
				TextSel.select(this)
			}
		})
		// 双击：打开编辑弹窗
		this.konva.on('dblclick', e => {
			e.cancelBubble = true
			TextSel.select(this)
			TextSel.openEditor(this)
		})
		// 拖动：多选组拖动 + 音符一起动 + HTML 位置同步
		this.konva.on('dragstart', e => {
			e.cancelBubble = true
			stage.isNoteDragging = true
			history.snapshot()
			this._dragStart = { x: this.konva.x(), y: this.konva.y() }
			if (TextSel.selected.size > 1 && TextSel.selected.has(this)) {
				TextSel._startGroupDrag()
			}
			// 同时选中音符时，记录音符初始位置，拖动文字时一起动
			if (window._sel?.selected?.size > 0) {
				window._sel._startGroupDrag()
			}
		})
		this.konva.on('dragmove', e => {
			if (TextSel._groupRef) {
				TextSel._syncGroupMove(this, this.konva.x(), this.konva.y())
			}
			// 同步移动选中的音符
			this._syncNotes()
			this.syncHtmlPosition()
		})
		this.konva.on('dragend', e => {
			stage.isNoteDragging = false
			if (TextSel._groupRef) TextSel._endGroupDrag()
			if (window._sel?._groupRef) window._sel._endGroupDrag()
			this.syncHtmlPosition()
		})
	}

	// 应用文字内容与样式到 HTML // テキスト内容とスタイルを HTML に適用
	applyHtml() {
		// 默认样式（无 span 的文字继承）
		this.html.style.color = this.fill
		this.html.style.fontSize = this.fontSize + 'px'
		this.html.style.fontFamily = '"' + this.fontFamily + '", sans-serif'
		// 内容
		if (this.htmlText) {
			// 富文本：直接渲染 HTML（每个 span 自带样式，覆盖默认）
			this.html.innerHTML = this.htmlText
		} else {
			this.html.textContent = this.text
		}
		this.syncHtmlPosition()
		// 更新命中区域尺寸
		this.hitRect.width(this.html.offsetWidth || 10)
		this.hitRect.height(this.html.offsetHeight || 10)
	}

	// 应用样式与内容 // スタイルと内容を適用 // Apply style and content
	applyStyle(htmlText, text, fill, fontSize, fontFamily) {
		this.htmlText = htmlText || ''
		this.text = text || ''
		this.fill = fill
		this.fontSize = fontSize
		this.fontFamily = fontFamily
		this.applyHtml()
		textlayer.draw()
	}

	// 高亮开关（用 CSS outline，不影响布局） // ハイライト切替（CSS outline を使用、レイアウトに影響しない）
	highlight(on) {
		this.html.style.outline = on ? '1.5px dashed rgba(100,160,255,0.9)' : 'none'
		this.html.style.outlineOffset = on ? '3px' : '0px'
	}

	// 同步 HTML 元素位置（跟随 stage 平移/缩放） // HTML要素の位置を同期（stageのパン/ズームに追従）
	syncHtmlPosition() {
		const sx = stage.scaleX()
		const sy = stage.scaleY()
		const sp = stage.position()
		const gp = this.konva.position()
		const x = sp.x + gp.x * sx
		const y = sp.y + gp.y * sy
		this.html.style.transform = `translate(${x}px, ${y}px) scale(${sx}, ${sy})`
	}

	// 拖动文字时同步移动选中的音符 // テキストドラッグ時に選択中の音符を同期移動
	_syncNotes() {
		if (!this._dragStart) return
		const gr = window._sel?._groupRef
		if (!gr) return
		const dx = this.konva.x() - this._dragStart.x
		const dy = this.konva.y() - this._dragStart.y
		for (const [n, r] of gr) {
			if (n.position) {
				n.position({ x: r.x + dx, y: r.y + dy })
				if (n.updateColor) {
					n._hz = y2hz(r.y + dy)
					n.updateColor()
				}
			}
		}
	}

	destroy() {
		this.konva.destroy()
		if (this.html.parentNode) this.html.parentNode.removeChild(this.html)
	}

	toJSON() {
		return {
			x: this.konva.x(), y: this.konva.y(),
			text: this.text, htmlText: this.htmlText,
			fill: this.fill,
			fontSize: this.fontSize, fontFamily: this.fontFamily
		}
	}

	static fromJSON(j) {
		return new TextNote(j.text, j.x, j.y, j)
	}
}

// 文字选中管理器 // テキスト選択マネージャー // Text selection manager
export const TextSel = {
	selected: new Set(),
	all: new Set(),
	clipboard: [],
	_editing: null,
	_groupRef: null,

	// 添加文字 // テキストを追加 // Add text
	add(x, y) {
		history.snapshot()
		const t = new TextNote('', x, y)
		textlayer.add(t.konva)
		this.all.add(t)
		this.select(t)
		this.openEditor(t)
		textlayer.draw()
		return t
	},

	// 选中单个文字（清除其他选中） // 単一テキストを選択（他を解除） // Select a single text
	select(t) {
		for (const s of this.selected) s.highlight(false)
		this.selected.clear()
		this.selected.add(t)
		t.highlight(true)
		textlayer.draw()
	},

	// 切换单个文字选中状态（多选） // 単一テキストの選択状態を切替（複数選択） // Toggle a single text selection (multi-select)
	toggle(t) {
		if (this.selected.has(t)) {
			this.selected.delete(t)
			t.highlight(false)
		} else {
			this.selected.add(t)
			t.highlight(true)
		}
		textlayer.draw()
	},

	// 清除选区 // 選択解除 // Clear selection
	clear() {
		for (const s of this.selected) s.highlight(false)
		this.selected.clear()
		textlayer.draw()
	},

	// 全选所有文字 // すべてのテキストを選択 // Select all texts
	selectAll() {
		this.selected.clear()
		for (const t of this.all) {
			this.selected.add(t)
			t.highlight(true)
		}
		textlayer.draw()
	},

	// 复制 // コピー // Copy
	copy() {
		if (this.selected.size === 0) return
		this.clipboard = [...this.selected].map(t => t.toJSON())
	},

	// 粘贴（偏移避免重叠） // 貼り付け（重なり回避のためオフセット） // Paste (offset to avoid overlap)
	paste() {
		if (this.clipboard.length === 0) return
		history.snapshot()
		for (const s of this.selected) s.highlight(false)
		this.selected.clear()
		for (const j of this.clipboard) {
			const t = TextNote.fromJSON(j)
			t.konva.position({ x: j.x + 30, y: j.y + 30 })
			t.syncHtmlPosition()
			textlayer.add(t.konva)
			this.all.add(t)
			this.selected.add(t)
			t.highlight(true)
		}
		textlayer.draw()
	},

	// 剪切 // 切り取り // Cut
	cut() {
		this.copy()
		this.deleteSelected()
	},

	// 删除选中 // 選択中を削除 // Delete selected
	deleteSelected() {
		if (this.selected.size === 0) return
		history.snapshot()
		for (const t of this.selected) {
			t.destroy()
			this.all.delete(t)
		}
		this.selected.clear()
		textlayer.draw()
	},

	// 删除所有文字（清屏用，不单独记录历史） // すべてのテキストを削除（クリア用、履歴は記録しない）
	clearAll() {
		for (const t of this.all) t.destroy()
		this.all.clear()
		this.selected.clear()
		this._editing = null
		textlayer.draw()
	},

	// 打开编辑弹窗 // 編集ポップアップを開く // Open editor
	openEditor(t) {
		this._editing = t
		const editor = $('#text-edit-content')
		editor.innerHTML = t.htmlText || escapeHtml(t.text)
		$('#text-edit-color').value = t.fill
		$('#text-edit-size').value = t.fontSize
		$('#text-edit-size-val').textContent = t.fontSize
		const idx = FONTS.findIndex(f => f.family === t.fontFamily)
		$('#text-edit-font').value = idx >= 0 ? idx : 0
		$('#text-edit-font-val').textContent = FONTS[idx >= 0 ? idx : 0].label
		syncTextareaFont()
		$('#text-edit-modal').style.display = 'flex'
	},

	// 关闭编辑弹窗 // 編集ポップアップを閉じる // Close editor
	closeEditor() {
		this._editing = null
		$('#text-edit-modal').style.display = 'none'
	},

	// 应用编辑 // 編集を適用 // Apply editor
	applyEditor() {
		const t = this._editing
		if (!t) return
		const editor = $('#text-edit-content')
		const htmlText = editor.innerHTML
		const text = editor.textContent
		const fill = $('#text-edit-color').value
		const fontSize = parseInt($('#text-edit-size').value) || 30
		const fontIdx = parseInt($('#text-edit-font').value) || 0
		const fontFamily = FONTS[fontIdx]?.family || 'Arial'
		history.snapshot()
		t.applyStyle(htmlText, text, fill, fontSize, fontFamily)
		this.closeEditor()
	},

	// 删除正在编辑的文字 // 編集中のテキストを削除 // Delete the text being edited
	deleteEditing() {
		const t = this._editing
		if (!t) return
		history.snapshot()
		this.selected.delete(t)
		this.all.delete(t)
		t.destroy()
		textlayer.draw()
		this.closeEditor()
	},

	// 组拖动开始：记录所有选中文字的初始位置 // グループドラッグ開始：全選択テキストの初期位置を記録
	_startGroupDrag() {
		this._groupRef = new Map()
		for (const t of this.selected) {
			this._groupRef.set(t, { x: t.konva.x(), y: t.konva.y() })
		}
	},

	// 组拖动同步：根据拖动文字的位置偏移同步移动其他选中文字 // グループドラッグ同期
	_syncGroupMove(dragged, cx, cy) {
		if (!this._groupRef) return
		const ref = this._groupRef.get(dragged)
		if (!ref) return
		const dx = cx - ref.x
		const dy = cy - ref.y
		for (const [t, r] of this._groupRef) {
			if (t === dragged) continue
			t.konva.position({ x: r.x + dx, y: r.y + dy })
			t.syncHtmlPosition()
		}
		textlayer.draw()
	},

	// 组拖动结束 // グループドラッグ終了 // End group drag
	_endGroupDrag() {
		this._groupRef = null
	},
}

// 暴露给内联脚本和 serialize.js 使用 // 内联スクリプトとserialize.js用に公開 // Expose for inline script and serialize.js
window._textSel = TextSel
window._textlayer = textlayer
window._textHtmlLayer = textHtmlLayer
window._TextNote = TextNote

// 同步所有文字的 HTML 位置（跟随 stage 平移/缩放） // 全テキストの HTML 位置を同期
function syncAllTextHtml() {
	for (const t of TextSel.all) t.syncHtmlPosition()
}

// 用 rAF 循环在 Konva 渲染后同步文字位置，避免与音符渲染时序不同步导致的晃动
// rAF ループで Konva 描画後に文字位置を同期し、音符との描画タイミングずれによる揺れを防ぐ
let _lastTx = null, _lastTy = null, _lastSx = null, _lastSy = null
function textSyncLoop() {
	const x = stage.x(), y = stage.y(), sx = stage.scaleX(), sy = stage.scaleY()
	if (x !== _lastTx || y !== _lastTy || sx !== _lastSx || sy !== _lastSy) {
		_lastTx = x; _lastTy = y; _lastSx = sx; _lastSy = sy
		syncAllTextHtml()
	}
	requestAnimationFrame(textSyncLoop)
}
requestAnimationFrame(textSyncLoop)

// 字体加载完成后更新文字尺寸/命中区域（HTML 会自动重排，这里同步锚点尺寸）
if (document.fonts) {
	const updateAll = () => { for (const t of TextSel.all) t.applyHtml() }
	for (const f of FONTS) {
		if (f.family === 'Fglyph' || f.family === 'ShasavMusic') {
			document.fonts.load(`30px "${f.family}"`).then(updateAll).catch(() => {})
		}
	}
}

// 初始化字体滑块范围 // フォントスライダーの範囲を初期化 // Init font slider range
{
	const fontSlider = $('#text-edit-font')
	if (fontSlider) fontSlider.max = FONTS.length - 1
}

// 弹窗事件绑定 // ポップアップイベントバインド // Bind popup events
$('#text-edit-content').addEventListener('mouseup', saveEditorSelection)
$('#text-edit-content').addEventListener('keyup', saveEditorSelection)
$('#text-edit-size').addEventListener('input', e => {
	const size = parseInt(e.target.value) || 30
	$('#text-edit-size-val').textContent = size
	applyStyleToSelection('font-size: ' + size + 'px')
	syncTextareaFont()
})
$('#text-edit-font').addEventListener('input', e => {
	const idx = parseInt(e.target.value)
	const family = FONTS[idx]?.family || 'Arial'
	$('#text-edit-font-val').textContent = FONTS[idx]?.label || ''
	applyStyleToSelection('font-family: "' + family + '", sans-serif')
	syncTextareaFont()
})
$('#text-edit-color').addEventListener('input', e => {
	applyStyleToSelection('color: ' + e.target.value)
	syncTextareaFont()
})
$('#text-edit-ok-btn').addEventListener('click', () => TextSel.applyEditor())
$('#text-edit-del-btn').addEventListener('click', () => TextSel.deleteEditing())
$('#text-edit-cancel-btn').addEventListener('click', () => TextSel.closeEditor())
$('#text-edit-modal').addEventListener('click', function(e) {
	if (e.target === this) TextSel.closeEditor()
})

// 点击空白清除文字选中 // 空白クリックでテキスト選択解除 // Click empty space to clear text selection
stage.on('pointerclick', e => {
	if (TextSel._editing) return
	if (TextSel.selected.size > 0) TextSel.clear()
})

// W 键添加文字（屏幕中心） // Wキーでテキスト追加（画面中央） // W key adds text at screen center
document.addEventListener('keydown', e => {
	if (e.key === 'w' && !e.ctrlKey && !e.metaKey && !e.altKey) {
		const el = document.activeElement
		const tag = el?.tagName
		if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return
		if ($('#overlay').style.visibility === 'visible') return
		if ($('#text-edit-modal').style.display === 'flex') return
		e.preventDefault()
		const x = -stage.x() / stage.scaleX() + window.innerWidth / (2 * stage.scaleX())
		const y = -stage.y() / stage.scaleY() + window.innerHeight / (2 * stage.scaleY())
		TextSel.add(x, y)
	}
})

// 同步文本框默认样式（字体/大小/颜色） // テキストボックスのデフォルトスタイルを同期
function syncTextareaFont() {
	const editor = $('#text-edit-content')
	if (!editor) return
	const idx = parseInt($('#text-edit-font').value) || 0
	const family = FONTS[idx]?.family || 'Arial'
	const size = parseInt($('#text-edit-size').value) || 30
	const color = $('#text-edit-color')?.value || '#ffffff'
	editor.style.fontFamily = '"' + family + '", sans-serif'
	editor.style.fontSize = size + 'px'
	editor.style.color = color
}

// 缓存的选区（点击滑块/颜色控件时 contenteditable 选区会丢失，这里缓存）
// キャッシュされた選択範囲（スライダー/カラー操作で contenteditable の選択が失われるためキャッシュ）
let _savedRange = null
function saveEditorSelection() {
	const sel = window.getSelection()
	if (sel.rangeCount && !sel.getRangeAt(0).collapsed) {
		_savedRange = sel.getRangeAt(0).cloneRange()
	}
}

// 应用 CSS 样式到缓存的选中文本范围 // キャッシュ済み選択範囲に CSS スタイルを適用
function applyStyleToSelection(cssText) {
	if (!_savedRange) return
	const range = _savedRange
	const span = document.createElement('span')
	span.style.cssText = cssText
	const frag = range.extractContents()
	span.appendChild(frag)
	range.insertNode(span)
	const nr = document.createRange()
	nr.selectNodeContents(span)
	_savedRange = nr
}

// 构建符号选择网格 // 記号選択グリッドを構築 // Build symbol selection grid
function buildSymbolGrid() {
	const grid = $('#text-edit-symbols')
	if (!grid) return
	grid.innerHTML = ''
	for (const g of GLYPHS) {
		const btn = document.createElement('button')
		btn.textContent = g.char
		btn.style.fontFamily = g.font
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
		btn.title = g.font
		btn.onclick = () => insertSymbol(g)
		grid.appendChild(btn)
	}
}

// 插入符号到文字内容并切换字体 // 記号をテキスト内容に挿入しフォントを切替 // Insert symbol into text content and switch font
function insertSymbol(g) {
	const editor = $('#text-edit-content')
	editor.focus()
	const span = document.createElement('span')
	span.style.fontFamily = '"' + g.font + '", sans-serif'
	span.textContent = g.char
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
	// 切换字体到该符号对应字体
	const idx = FONTS.findIndex(f => f.family === g.font)
	if (idx >= 0) {
		$('#text-edit-font').value = idx
		$('#text-edit-font-val').textContent = FONTS[idx].label
		syncTextareaFont()
	}
}

buildSymbolGrid()
