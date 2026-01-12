// src/utils/elasticScrollGSAP.ts

export interface ElasticScrollOptions {
	/** Скорость drag */
	dragMult?: number
	/** Скорость wheel */
	wheelMult?: number
	/** Максимальный визуальный overscroll */
	maxOverscroll?: number
	/** Инерция: ближе к 1 = дольше катится (0.90..0.98) */
	momentumResistance?: number
	/**
	 * Сила пружины. Больше = быстрее возвращается.
	 * В этой модели нормальные значения 50..140
	 */
	springK?: number
	/**
	 * Демпфирование пружины. 0..1
	 * Больше = меньше колебаний. Нормально 0.80..0.92
	 */
	springDamping?: number
	/** Остановка микродвижений */
	stopVelocity?: number
	/** Снэп к границе, чтобы не дрожало */
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
	private y = 0 // то, что показываем (rubber(rawY))

	private isDragging = false

	private rafId = 0
	private lastT = 0

	private lastDragT = 0

	constructor(contentEl: HTMLElement, options: ElasticScrollOptions = {}) {
		this.el = contentEl

		this.opts = {
			dragMult: options.dragMult ?? 1.25,
			wheelMult: options.wheelMult ?? 1.4,
			maxOverscroll: options.maxOverscroll ?? 40, // ✅ меньше по умолчанию
			momentumResistance: options.momentumResistance ?? 0.54,
			springK: options.springK ?? 90, // ✅ стабильный возврат
			springDamping: options.springDamping ?? 0.88, // ✅ без колебаний
			stopVelocity: options.stopVelocity ?? 8,
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

		// Если контент/вьюпорт изменился — подтягиваем к допустимому диапазону
		if (!this.isDragging) {
			const clamped = this.clamp(this.rawY)
			this.rawY = clamped
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
		this.y = this.renderY(this.rawY)
		this.v = 0
		this.applyTransform(this.y)
	}

	onDragStart(now = performance.now()) {
		this.isDragging = true
		this.v = 0
		this.lastDragT = now
	}

	onDrag(deltaY: number, now = performance.now()) {
		// deltaY: positive => scroll down
		const dy = deltaY * this.opts.dragMult

		const dt = Math.max(0.001, (now - this.lastDragT) / 1000)
		this.lastDragT = now

		// physics
		this.rawY += dy

		// velocity estimate (smoothed)
		const instantV = dy / dt
		this.v = this.lerp(this.v, instantV, 0.25)

		// render
		this.y = this.renderY(this.rawY)
		this.applyTransform(this.y)
	}

	onDragEnd() {
		this.isDragging = false
		// не обнуляем v — нужен momentum
	}

	onWheel(deltaY: number, deltaMode: number, viewportHeight: number) {
		// normalize wheel delta to pixels
		let px = deltaY
		if (deltaMode === 1) px *= 16
		if (deltaMode === 2) px *= viewportHeight

		const dy = px * this.opts.wheelMult

		const now = performance.now()
		const dt = Math.max(0.001, (now - (this.lastT || now - 16)) / 1000)

		this.rawY += dy

		// wheel тоже даёт импульс инерции (умеренный)
		const instantV = dy / dt
		this.v = this.lerp(this.v, instantV, 0.18)

		this.y = this.renderY(this.rawY)
		this.applyTransform(this.y)
	}

	// ------------------------
	// Loop / physics
	// ------------------------
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

		// friction
		const f = Math.pow(this.opts.momentumResistance, dt * 30)
		this.v *= f
		if (Math.abs(this.v) < this.opts.stopVelocity) this.v = 0

		// integrate
		if (this.v !== 0) {
			this.rawY += this.v * dt
		}

		// spring back if outside bounds
		const { minY, maxY } = this.bounds
		const outside = this.rawY < minY || this.rawY > maxY

		if (outside) {
			const target = this.clamp(this.rawY)

			// spring acceleration toward target
			const a = (target - this.rawY) * this.opts.springK

			// integrate velocity
			this.v += a * dt

			// damping (prevents oscillation)
			this.v *= this.opts.springDamping

			// snap to finish (prevents "not returning")
			if (
				Math.abs(target - this.rawY) < this.opts.snapDistance &&
				Math.abs(this.v) < 12
			) {
				this.rawY = target
				this.v = 0
			}
		}

		const newY = this.renderY(this.rawY)
		if (newY !== this.y) {
			this.y = newY
			this.applyTransform(this.y)
		}
	}

	// ------------------------
	// Render mapping (rubber band)
	// ------------------------
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
		// saturation curve: limited by maxOverscroll, smooth near 0
		const m = this.opts.maxOverscroll
		return (m * d) / (m + d)
	}

	private clamp(y: number) {
		return Math.min(this.bounds.maxY, Math.max(this.bounds.minY, y))
	}

	private applyTransform(y: number) {
		// y is scrollTop-like, move content up
		this.el.style.transform = `translate3d(0, ${-y}px, 0)`
	}

	private lerp(a: number, b: number, t: number) {
		return a + (b - a) * t
	}
}
