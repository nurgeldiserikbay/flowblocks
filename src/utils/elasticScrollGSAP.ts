// src/utils/elasticScrollGSAP.ts

export interface ElasticScrollOptions {
	dragMult?: number
	wheelMult?: number
	maxOverscroll?: number

	/** 0.92..0.97 (per 60fps frame) */
	momentumResistance?: number

	/** 800..2200 */
	springK?: number

	/** 0.85..0.95 */
	springDamping?: number

	/** px/sec */
	stopVelocity?: number

	/** px */
	snapDistance?: number

	/**
	 * Smooth визуального движения (0..1).
	 * 0 = без smoothing (моментально),
	 * 0.08..0.18 = приятный smooth.
	 */
	smooth?: number
}

export type ElasticScrollState = {
	y: number
	rawY: number
	velocity: number
	isDragging: boolean
	isOverscrolling: boolean
	atTop: boolean
	atBottom: boolean
	isSettled: boolean
	minY: number
	maxY: number
}

type Bounds = { minY: number; maxY: number }

export class ElasticScroll {
	private el: HTMLElement
	private opts: Required<ElasticScrollOptions>
	private bounds: Bounds = { minY: 0, maxY: 0 }

	// physics
	private rawY = 0
	private v = 0

	// render target + displayed (for smoothing)
	private targetY = 0
	private y = 0

	private isDragging = false

	private rafId = 0
	private lastT = 0
	private lastDragT = 0

	private onStateCb: ((s: ElasticScrollState) => void) | null = null

	constructor(contentEl: HTMLElement, options: ElasticScrollOptions = {}) {
		this.el = contentEl

		this.opts = {
			dragMult: options.dragMult ?? 1.25,
			wheelMult: options.wheelMult ?? 1.4,
			maxOverscroll: options.maxOverscroll ?? 60,
			momentumResistance: options.momentumResistance ?? 0.94,
			springK: options.springK ?? 1400,
			springDamping: options.springDamping ?? 0.9,
			stopVelocity: options.stopVelocity ?? 10,
			snapDistance: options.snapDistance ?? 0.8,
			smooth: options.smooth ?? 0.12,
		}

		this.applyTransform(0)
		this.startLoop()
	}

	destroy() {
		cancelAnimationFrame(this.rafId)
		this.rafId = 0
		this.onStateCb = null
	}

	setOnState(cb: ((s: ElasticScrollState) => void) | null) {
		this.onStateCb = cb
	}

	setBounds(minY: number, maxY: number) {
		this.bounds.minY = minY
		this.bounds.maxY = Math.max(minY, maxY)

		if (!this.isDragging) {
			this.rawY = this.clamp(this.rawY)
			this.v = 0
		}

		this.targetY = this.renderY(this.rawY)
		this.y = this.targetY
		this.applyTransform(this.y)
		this.emitState()
	}

	getY() {
		return this.y
	}

	getState(): ElasticScrollState {
		return this.makeState()
	}

	setY(y: number) {
		this.rawY = y
		this.v = 0
		this.targetY = this.renderY(this.rawY)
		this.y = this.targetY
		this.applyTransform(this.y)
		this.emitState()
	}

	onDragStart(now = performance.now()) {
		this.isDragging = true
		this.v = 0
		this.lastDragT = now
		this.emitState()
	}

	onDrag(deltaY: number, now = performance.now()) {
		const dy = deltaY * this.opts.dragMult

		const dt = Math.max(0.001, (now - this.lastDragT) / 1000)
		this.lastDragT = now

		this.rawY += dy

		// velocity estimate (smoothed)
		const instantV = dy / dt
		this.v = this.lerp(this.v, instantV, 0.25)

		this.targetY = this.renderY(this.rawY)
		// transform will be applied in loop with smoothing
		this.emitState()
	}

	onDragEnd() {
		this.isDragging = false
		this.emitState()
	}

	onWheel(deltaY: number, deltaMode: number, viewportHeight: number) {
		let px = deltaY
		if (deltaMode === 1) px *= 16
		if (deltaMode === 2) px *= viewportHeight

		const dy = px * this.opts.wheelMult

		const now = performance.now()
		const dt = Math.max(0.001, (now - (this.lastT || now - 16)) / 1000)

		this.rawY += dy

		const instantV = dy / dt
		this.v = this.lerp(this.v, instantV, 0.18)

		this.targetY = this.renderY(this.rawY)
		this.emitState()
	}

	private startLoop() {
		this.lastT = performance.now()
		const tick = (t: number) => {
			const dt = Math.min(0.033, Math.max(0.001, (t - this.lastT) / 1000))
			this.lastT = t

			this.update(dt)
			this.rafId = requestAnimationFrame(tick)
		}
		this.rafId = requestAnimationFrame(tick)
	}

	private update(dt: number) {
		if (!this.isDragging) {
			const { minY, maxY } = this.bounds
			const outside = this.rawY < minY || this.rawY > maxY

			if (outside) {
				const target = this.clamp(this.rawY)
				const k = this.opts.springK
				const c = 2 * Math.sqrt(k) * this.opts.springDamping
				const a = k * (target - this.rawY) - c * this.v

				this.v += a * dt
				this.rawY += this.v * dt

				if (
					Math.abs(target - this.rawY) < this.opts.snapDistance &&
					Math.abs(this.v) < 20
				) {
					this.rawY = target
					this.v = 0
				}
			} else {
				const f = Math.pow(this.opts.momentumResistance, dt * 60)
				this.v *= f
				if (Math.abs(this.v) < this.opts.stopVelocity) this.v = 0
				if (this.v !== 0) this.rawY += this.v * dt
			}

			this.targetY = this.renderY(this.rawY)
		}

		// ✅ Smooth визуального движения
		const s = this.opts.smooth
		if (s <= 0) {
			if (this.y !== this.targetY) {
				this.y = this.targetY
				this.applyTransform(this.y)
				this.emitState()
			}
			return
		}

		// smoothing scaled by dt (stable across FPS)
		const t = 1 - Math.pow(1 - s, dt * 60)
		const newY = this.y + (this.targetY - this.y) * t

		if (Math.abs(newY - this.y) > 0.01) {
			this.y = newY
			this.applyTransform(this.y)
			this.emitState()
		}
	}

	private renderY(raw: number) {
		const { minY, maxY } = this.bounds
		if (raw < minY) return minY - this.rubber(minY - raw)
		if (raw > maxY) return maxY + this.rubber(raw - maxY)
		return raw
	}

	private rubber(d: number) {
		const m = this.opts.maxOverscroll
		return (m * d) / (m + d)
	}

	private clamp(y: number) {
		return Math.min(this.bounds.maxY, Math.max(this.bounds.minY, y))
	}

	private applyTransform(y: number) {
		this.el.style.transform = `translate3d(0, ${-y}px, 0)`
	}

	private lerp(a: number, b: number, t: number) {
		return a + (b - a) * t
	}

	private makeState(): ElasticScrollState {
		const { minY, maxY } = this.bounds
		const isOverscrolling = this.rawY < minY || this.rawY > maxY
		const atTop = this.clamp(this.rawY) <= minY + 0.5
		const atBottom = this.clamp(this.rawY) >= maxY - 0.5

		const isSettled =
			Math.abs(this.targetY - this.y) < 0.5 &&
			Math.abs(this.rawY - this.clamp(this.rawY)) < 0.5 &&
			Math.abs(this.v) < 10 &&
			!this.isDragging

		return {
			y: this.y,
			rawY: this.rawY,
			velocity: this.v,
			isDragging: this.isDragging,
			isOverscrolling,
			atTop,
			atBottom,
			isSettled,
			minY,
			maxY,
		}
	}

	private emitState() {
		if (this.onStateCb) this.onStateCb(this.makeState())
	}
}
