// src/utils/elasticScrollGSAP.ts

export interface ElasticScrollOptions {
	dragMult?: number
	wheelMult?: number
	maxOverscroll?: number

	/** 0.92..0.97 (per 60fps frame) */
	momentumResistance?: number

	/** Сила пружины (чем больше — тем быстрее возврат). Рекомендую 800..2200 */
	springK?: number

	/** Демпфирование пружины (обычно 0.85..0.95) */
	springDamping?: number

	/** Остановка микродвижений (px/sec) */
	stopVelocity?: number

	/** Снэп к границе (px) */
	snapDistance?: number
}

type Bounds = { minY: number; maxY: number }

export class ElasticScroll {
	private el: HTMLElement

	private opts: Required<ElasticScrollOptions>
	private bounds: Bounds = { minY: 0, maxY: 0 }

	// physics
	private rawY = 0 // может уходить за границы
	private v = 0 // px/sec

	// render
	private y = 0

	private isDragging = false

	private rafId = 0
	private lastT = 0
	private lastDragT = 0

	constructor(contentEl: HTMLElement, options: ElasticScrollOptions = {}) {
		this.el = contentEl

		this.opts = {
			dragMult: options.dragMult ?? 1.25,
			wheelMult: options.wheelMult ?? 1.4,
			maxOverscroll: options.maxOverscroll ?? 60,

			// ✅ важно: 0.54 — слишком мало. Должно быть около 0.92..0.97
			momentumResistance: options.momentumResistance ?? 0.94,

			// ✅ стабильный возврат
			springK: options.springK ?? 1400,
			springDamping: options.springDamping ?? 0.9,

			stopVelocity: options.stopVelocity ?? 10,
			snapDistance: options.snapDistance ?? 0.8,
		}

		this.applyTransform(0)
		this.startLoop()
	}

	destroy() {
		cancelAnimationFrame(this.rafId)
		this.rafId = 0
	}

	setBounds(minY: number, maxY: number) {
		this.bounds.minY = minY
		this.bounds.maxY = Math.max(minY, maxY)

		if (!this.isDragging) {
			this.rawY = this.clamp(this.rawY)
			this.v = 0
		}

		this.y = this.renderY(this.rawY)
		this.applyTransform(this.y)
	}

	getY() {
		return this.y
	}

	setY(y: number) {
		this.rawY = y
		this.v = 0
		this.y = this.renderY(this.rawY)
		this.applyTransform(this.y)
	}

	onDragStart(now = performance.now()) {
		this.isDragging = true
		this.v = 0
		this.lastDragT = now
	}

	onDrag(deltaY: number, now = performance.now()) {
		const dy = deltaY * this.opts.dragMult

		const dt = Math.max(0.001, (now - this.lastDragT) / 1000)
		this.lastDragT = now

		this.rawY += dy

		// velocity estimate (smoothed)
		const instantV = dy / dt
		this.v = this.lerp(this.v, instantV, 0.25)

		this.y = this.renderY(this.rawY)
		this.applyTransform(this.y)
	}

	onDragEnd() {
		this.isDragging = false
	}

	onWheel(deltaY: number, deltaMode: number, viewportHeight: number) {
		let px = deltaY
		if (deltaMode === 1) px *= 16
		if (deltaMode === 2) px *= viewportHeight

		const dy = px * this.opts.wheelMult

		const now = performance.now()
		const dt = Math.max(0.001, (now - (this.lastT || now - 16)) / 1000)

		this.rawY += dy

		// умеренный импульс от wheel
		const instantV = dy / dt
		this.v = this.lerp(this.v, instantV, 0.18)

		this.y = this.renderY(this.rawY)
		this.applyTransform(this.y)
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
		if (this.isDragging) return

		const { minY, maxY } = this.bounds
		const outside = this.rawY < minY || this.rawY > maxY

		if (outside) {
			// ✅ ВНЕ ГРАНИЦ: spring-damper без friction/stopVelocity
			const target = this.clamp(this.rawY)

			// критически демпфированная модель:
			// a = k*(target - rawY) - c*v
			const k = this.opts.springK
			const c = 2 * Math.sqrt(k) * this.opts.springDamping

			const a = k * (target - this.rawY) - c * this.v

			this.v += a * dt
			this.rawY += this.v * dt

			// snap чтобы никогда не "залипало"
			if (
				Math.abs(target - this.rawY) < this.opts.snapDistance &&
				Math.abs(this.v) < 20
			) {
				this.rawY = target
				this.v = 0
			}
		} else {
			// ✅ ВНУТРИ ГРАНИЦ: обычный momentum + friction
			const f = Math.pow(this.opts.momentumResistance, dt * 60)
			this.v *= f

			if (Math.abs(this.v) < this.opts.stopVelocity) this.v = 0
			if (this.v !== 0) this.rawY += this.v * dt
		}

		const newY = this.renderY(this.rawY)
		if (newY !== this.y) {
			this.y = newY
			this.applyTransform(this.y)
		}
	}

	private renderY(raw: number) {
		const { minY, maxY } = this.bounds

		if (raw < minY) {
			const d = minY - raw
			return minY - this.rubber(d)
		}
		if (raw > maxY) {
			const d = raw - maxY
			return maxY + this.rubber(d)
		}
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
}
