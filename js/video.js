/*
 * 视频录制模块 — 按「拍长(ms)」定义的节拍时间轴，逐帧离线渲染当前画面（普通/x 模式）为 MP4
 * 采用 WebCodecs(H.264) + mp4-muxer，输出满足：
 *   MP4 / ≥1080P / 30~60fps / 码率 ≥10Mbps（60fps 时 ≥15Mbps）
 * 通过 Config 面板「视频录制」区域触发。
 */

import { stage, grid, rootlayer } from './sequencer.js'
import { x2t, t2x, OFFSET } from './util.js'

const MP4_MUXER_URL = 'https://cdn.jsdelivr.net/npm/mp4-muxer@4.3.3/build/mp4-muxer.mjs'

let recording = false
let cancelRequested = false

const $ = q => document.querySelector(q)

// 读取录制参数
function getOpts() {
	const outH = parseInt($('#video-resolution')?.value || '1080', 10) || 1080
	const ar = ($('#video-aspect')?.value || '16:9').split(':').map(Number)
	const arW = ar[0] || 16
	const arH = ar[1] || 9
	const fps = parseInt($('#video-fps')?.value || '60', 10) || 60
	const bitrateSel = $('#video-bitrate')?.value || 'auto'
	const hideBar = $('#video-hide-bar') ? $('#video-hide-bar').checked : true
	let supersample = parseFloat($('#video-supersample')?.value) || 4
	supersample = Math.min(8, Math.max(1, supersample))
	let outW = Math.round(outH * arW / arH)
	outW -= outW % 2
	return { outW, outH, fps, bitrateSel, hideBar, supersample }
}

// 码率：60fps 至少 15Mbps，30fps 至少 10Mbps；留出余量并随分辨率面积上调，避免细线被压缩糊掉
function computeBitrate(fps, outW, outH) {
	const base = fps >= 60 ? 24_000_000 : 16_000_000
	const area = (outW * outH) / (1920 * 1080)
	return Math.round(base * Math.max(1, area))
}

// 选择可用的 H.264 编码配置；均不支持返回 null
async function pickH264Config(width, height, fps, bitrate) {
	const candidates = ['avc1.640028', 'avc1.4d0028', 'avc1.42E01E']
	for (const codec of candidates) {
		const cfg = { codec, width, height, bitrate, framerate: fps }
		try {
			if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg
		} catch (e) { /* 尝试下一个 */ }
	}
	return null
}

// 读取背景颜色/透明度分量（与 applyBackground 用同一来源）
function getBgColorComponents() {
	const hex = $('#config-bg-color')?.value || '#676681'
	const rawA = $('#config-bg-opacity')?.value
	let a = 1
	if (rawA != null && rawA !== '') a = parseInt(rawA, 10) / 100
	if (Number.isNaN(a)) a = 1
	const r = parseInt(hex.slice(1, 3), 16)
	const g = parseInt(hex.slice(3, 5), 16)
	const b = parseInt(hex.slice(5, 7), 16)
	return {
		r: Number.isNaN(r) ? 0x67 : r,
		g: Number.isNaN(g) ? 0x66 : g,
		b: Number.isNaN(b) ? 0x81 : b,
		a
	}
}

// 预加载背景图（dataURL / 同源 URL），失败返回 null
function loadBgImage() {
	const url = localStorage.getItem('naf_bg_image')
	if (!url) return Promise.resolve(null)
	return new Promise(resolve => {
		const img = new Image()
		img.onload = () => resolve(img)
		img.onerror = () => resolve(null)
		img.src = url
	})
}

function showProgress(pct, text) {
	const modal = $('#video-export-modal')
	const t = $('#video-export-text')
	const bar = $('#video-export-bar')
	if (modal) modal.style.display = 'flex'
	if (t) t.textContent = text || `正在录制视频… ${Math.round(pct)}%`
	if (bar) bar.style.width = Math.round(pct) + '%'
}
function hideProgress() {
	const modal = $('#video-export-modal')
	if (modal) modal.style.display = 'none'
}

function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// cover 铺满绘制（居中裁切），模拟 CSS background-size: cover
function drawCover(ctx, img, x, y, w, h) {
	const iw = img.naturalWidth || img.width
	const ih = img.naturalHeight || img.height
	if (!iw || !ih) return
	const s = Math.max(w / iw, h / ih)
	const dw = iw * s
	const dh = ih * s
	ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

// 背景：body 底色 +（可选背景图）+ #sequencer 半透明背景色，仅在内容区域（letterbox 内）叠加
function fillBackground(ctx, outW, outH, offX, offY, fitW, fitH, bgImage) {
	const bodyBg = getComputedStyle(document.body).backgroundColor
	ctx.fillStyle = (bodyBg && bodyBg !== 'transparent' && bodyBg !== 'rgba(0, 0, 0, 0)') ? bodyBg : '#000000'
	ctx.fillRect(0, 0, outW, outH)

	ctx.save()
	ctx.beginPath()
	ctx.rect(offX, offY, fitW, fitH)
	ctx.clip()

	if (bgImage) drawCover(ctx, bgImage, offX, offY, fitW, fitH)

	const { r, g, b, a } = getBgColorComponents()
	ctx.fillStyle = `rgba(${r},${g},${b},${a})`
	ctx.fillRect(offX, offY, fitW, fitH)

	ctx.restore()
}

// 递归绘制富文本片段（支持 span 内联 color/font-size/font-family/font-weight，以及 br/div/p 换行）
function drawRichTextNodes(ctx, nodes, pos, style, scale, lineHeight) {
	for (const node of nodes) {
		if (node.nodeType === Node.TEXT_NODE) {
			const s = node.nodeValue || ''
			if (s) {
				ctx.font = style.font
				ctx.fillStyle = style.fill
				ctx.fillText(s, pos.x, pos.y)
				pos.x += ctx.measureText(s).width
			}
		} else if (node.nodeType === Node.ELEMENT_NODE) {
			const tag = node.tagName.toLowerCase()
			if (tag === 'br' || tag === 'div' || tag === 'p') {
				pos.x = pos.baseX
				pos.y += lineHeight
				if (node.childNodes && node.childNodes.length) {
					drawRichTextNodes(ctx, node.childNodes, pos, style, scale, lineHeight)
				}
				continue
			}
			const st = node.style || {}
			const child = { ...style }
			if (st.color) child.fill = st.color
			if (st.fontSize) { const v = parseFloat(st.fontSize); if (v) child.size = v }
			if (st.fontFamily) child.family = st.fontFamily
			if (st.fontWeight) child.weight = st.fontWeight
			child.font = `${child.weight} ${child.size * scale}px "${child.family}", sans-serif`
			drawRichTextNodes(ctx, node.childNodes, pos, child, scale, lineHeight)
		}
	}
}

// 把 HTML 文字注释绘制到目标画布
function drawTextOverlay(ctx, scale, offX, offY, stageW, stageH) {
	const texts = window._textSel?.all
	if (!texts || !texts.size) return
	const sx = stage.scaleX() || 1
	const sy = stage.scaleY() || 1
	const sp = stage.position()

	for (const t of texts) {
		if (!t.konva || t.konva.visible() === false) continue
		const plain = (t.text != null && t.text !== '') ? t.text : (t.html?.textContent || '')
		if (!plain) continue

		const gp = t.konva.position()
		const screenX = sp.x + gp.x * sx
		const screenY = sp.y + gp.y * sy
		const recX = offX + screenX / stageW * (stageW * scale)
		const recY = offY + screenY / stageH * (stageH * scale)
		const fontSizeScale = sx * scale
		const lineHeight = (t.fontSize || 30) * fontSizeScale

		ctx.save()
		ctx.textAlign = 'left'
		ctx.textBaseline = 'top'

		if (t.htmlText) {
			const container = document.createElement('div')
			container.innerHTML = t.htmlText
			const style = {
				fill: t.fill || '#ffffff',
				size: t.fontSize || 30,
				family: t.fontFamily || 'Arial',
				weight: 'normal'
			}
			style.font = `${style.size * fontSizeScale}px "${style.family}", sans-serif`
			const pos = { x: recX, y: recY, baseX: recX }
			drawRichTextNodes(ctx, container.childNodes, pos, style, fontSizeScale, lineHeight)
		} else {
			ctx.font = `${(t.fontSize || 30) * fontSizeScale}px "${t.fontFamily || 'Arial'}", sans-serif`
			ctx.fillStyle = t.fill || '#ffffff'
			ctx.fillText(plain, recX, recY)
		}

		ctx.restore()
	}
}

// 更新播放线（指示器）到指定 tick，并处理卷帘滚动
function updateIndicatorAtTick(tick) {
	const transportX = t2x(tick - OFFSET)
	const contentX = (window._barView && window._barViewX) ? window._barViewX(tick) : transportX
	const sx = stage.scaleX() || 1
	const sy = stage.scaleY() || 1
	if (grid._pianoRoll) {
		const FIXED_X = window.innerWidth * 0.25
		stage.x(FIXED_X - (contentX + (grid._pianoRollOffset || 0)) * sx)
		grid.indicator.x((FIXED_X - stage.x()) / sx)
	} else {
		grid.indicator.x(contentX)
	}
	grid.indicator.y(-stage.y() / sy)
	grid.indicator.points([0, 0, 0, window.innerHeight / sy])
	grid.adjust()
}

async function startRecording() {
	if (recording) return
	if (rootlayer.getChildren().length === 0) {
		alert('没有音符可录制')
		return
	}
	if (!('VideoEncoder' in window) || !('VideoFrame' in window)) {
		alert('当前浏览器不支持视频录制，请使用最新版 Chrome / Edge（需要 WebCodecs）')
		return
	}

	const opts = getOpts()
	const { outW, outH, fps, hideBar } = opts

	// 停止正在进行的实时播放，避免与离线渲染冲突
	Tone.Transport.stop()
	window._stopLoopMonitor?.()
	window._stopTempoMonitor?.()

	// 录制开始位置 = 播放线当前位置（非粉色循环开始箭头）
	let startTick = Tone.Transport.ticks
	if (!startTick) startTick = x2t(grid.loopStart.x()) + OFFSET
	const endTick = x2t(grid.loopEnd.x()) + OFFSET
	if (endTick <= startTick) {
		alert('请把播放线移到循环结束箭头之前再录制')
		return
	}

	recording = true
	cancelRequested = false

	// 录制期间隐藏下方控制栏 / 关闭遮罩弹窗
	const header = document.querySelector('header')
	const prevHeaderDisplay = header ? header.style.display : ''
	const overlay = $('#overlay')
	const prevOverlayVisibility = overlay ? overlay.style.visibility : ''
	const prevStagePos = stage.position()
	if (hideBar && header) header.style.display = 'none'
	if (overlay) overlay.style.visibility = ''

	grid.indicator.show()
	showProgress(0, '正在准备录制…')

	try {
		await capture({ startTick, endTick, outW, outH, fps, opts })
	} catch (err) {
		if (err?.name !== 'AbortError') {
			alert('视频录制失败：' + (err?.message || err))
		}
	} finally {
		stage.position(prevStagePos)
		grid.adjust()
		grid.hideIndicator()
		if (header) header.style.display = prevHeaderDisplay
		if (overlay) overlay.style.visibility = prevOverlayVisibility
		recording = false
		hideProgress()
	}
}

async function capture({ startTick, endTick, outW, outH, fps, opts }) {
	const { Muxer, ArrayBufferTarget } = await import(MP4_MUXER_URL)
	const bgImage = await loadBgImage()

	// 确定实际输出分辨率；2K/4K 若编码器不支持，自动降级到 1080p
	let finalW = outW
	let finalH = outH
	let bitrate = opts.bitrateSel === 'auto'
		? computeBitrate(fps, finalW, finalH)
		: (parseInt(opts.bitrateSel, 10) || 10) * 1_000_000

	let config = await pickH264Config(finalW, finalH, fps, bitrate)
	if (!config && (finalW > 1920 || finalH > 1080)) {
		finalW = 1920
		finalH = 1080
		if (opts.bitrateSel === 'auto') bitrate = computeBitrate(fps, finalW, finalH)
		config = await pickH264Config(finalW, finalH, fps, bitrate)
		alert('当前浏览器不支持 2K/4K 视频编码，已自动降级到 1080p')
	}
	if (!config) throw new Error('浏览器不支持 H.264 编码')

	const muxer = new Muxer({
		target: new ArrayBufferTarget(),
		video: { codec: 'avc', width: finalW, height: finalH },
		fastStart: 'in-memory'
	})

	let encodeErr = null
	const encoder = new VideoEncoder({
		output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
		error: e => { encodeErr = e }
	})
	encoder.configure(config)

	const recCanvas = document.createElement('canvas')
	recCanvas.width = finalW
	recCanvas.height = finalH
	const recCtx = recCanvas.getContext('2d')

	const stageW = stage.width()
	const stageH = stage.height()
	const scale = Math.min(finalW / stageW, finalH / stageH)
	const fitW = Math.round(stageW * scale)
	const fitH = Math.round(stageH * scale)
	const offX = Math.round((finalW - fitW) / 2)
	const offY = Math.round((finalH - fitH) / 2)

	// 超采样渲染比例：以 opts.supersample 倍目标分辨率矢量绘制，再高质量缩小，让 1080p 极其锐利
	let superScale = Math.max(finalW / stageW, finalH / stageH) * opts.supersample
	// 限制渲染 canvas 尺寸，避免超出浏览器上限或内存过大
	const maxSuperScale = Math.min(8192 / stageW, 8192 / stageH)
	superScale = Math.max(1, Math.min(superScale, maxSuperScale))

	const frameDuration = Math.round(1e6 / fps)
	const keyEvery = Math.max(1, fps * 2)

	// 视频时长严格按「1拍长度(ms)」计算，与真实时间无关
	const beatMs = grid.beat || 500
	const durationSeconds = (endTick - startTick) / 192 * beatMs / 1000
	const totalFrames = Math.max(1, Math.round(durationSeconds * fps))
	const tickPerFrame = (endTick - startTick) / totalFrames

	// 复用 layer 现有画布并临时提高其分辨率做超采样，避免每帧新建临时 canvas 导致 GC 压力/丢帧
	const layers = stage.getLayers()
	const prevRatios = layers.map(l => l.getCanvas().pixelRatio)
	for (const l of layers) l.getCanvas().setPixelRatio(superScale)

	try {
		for (let i = 0; i < totalFrames; i++) {
			if (cancelRequested) {
				try { encoder.close() } catch (e) { /* ignore */ }
				throw Object.assign(new Error('已取消录制'), { name: 'AbortError' })
			}

			const tick = startTick + i * tickPerFrame
			updateIndicatorAtTick(tick)

			// 同步重绘所有 layer 到各自（已超高分辨率的）画布
			for (const l of layers) l.draw()

			fillBackground(recCtx, finalW, finalH, offX, offY, fitW, fitH, bgImage)
			recCtx.imageSmoothingEnabled = true
			recCtx.imageSmoothingQuality = 'high'
			for (const l of layers) {
				recCtx.drawImage(l.getNativeCanvasElement(), offX, offY, fitW, fitH)
			}
			drawTextOverlay(recCtx, scale, offX, offY, stageW, stageH)

			const frame = new VideoFrame(recCanvas, {
				timestamp: i * frameDuration,
				duration: frameDuration
			})
			encoder.encode(frame, { keyFrame: i % keyEvery === 0 })
			frame.close()

			if (encodeErr) throw encodeErr
			showProgress((i + 1) / totalFrames * 100)

			// 背压：编码队列过长时等待，避免长时间录制时内存堆积、丢帧或画面空白卡顿
			while (encoder.encodeQueueSize > 2) {
				if (encodeErr) throw encodeErr
				await new Promise(r => setTimeout(r, 2))
			}
		}

		showProgress(100, '正在编码并导出…')
		await encoder.flush()
		if (encodeErr) throw encodeErr
		muxer.finalize()
		const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' })
		downloadBlob(blob, 'nafchanaphata-recording.mp4')
	} finally {
		// 恢复 layer 画布分辨率
		for (let i = 0; i < layers.length; i++) layers[i].getCanvas().setPixelRatio(prevRatios[i])
		for (const l of layers) l.draw()
		try { if (encoder.state !== 'closed') encoder.close() } catch (e) { /* ignore */ }
	}
}

function bind() {
	const btn = $('#video-record-btn')
	if (btn) btn.addEventListener('click', startRecording)
	const cancel = $('#video-export-cancel')
	if (cancel) cancel.addEventListener('click', () => { cancelRequested = true })
}

bind()
