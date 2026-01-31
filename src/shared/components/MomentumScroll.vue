<template>
	<div
		ref="containerRef"
		class="momentum-scroll"
		:class="{
			'momentum-scroll--dragging': isDragging,
			'momentum-scroll--pressing': isPressing,
		}"
		@pointerdown="onPointerDown"
		@pointermove="onPointerMove"
		@pointerup="onPointerUp"
		@pointercancel="onPointerUp"
	>
		<div ref="contentRef" class="momentum-scroll__content">
			<slot />
		</div>
	</div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, nextTick, watch } from 'vue'
import { gsap } from 'gsap'
import {
	ElasticScroll,
	type ElasticScrollOptions,
	type ElasticScrollState,
} from '@/utils/elasticScrollGSAP'

export interface MomentumScrollProps {
	dragMult?: number
	wheelMult?: number
	maxOverscroll?: number
	momentumResistance?: number
	springK?: number
	springDamping?: number
	stopVelocity?: number
	snapDistance?: number
	smooth?: number

	/** сколько удерживать, чтобы начался drag-scroll (ms) */
	pressDelay?: number
	/** порог движения до старта (px). Если сдвинул сильнее — можно стартовать раньше */
	pressMoveTolerance?: number

	clickThreshold?: number
	autoUpdateBounds?: boolean
	initialScroll?: number
	enableWheel?: boolean
	autoScrollToBottomOnMount?: boolean
	autoScrollDuration?: number
}

const props = withDefaults(defineProps<MomentumScrollProps>(), {
	dragMult: 1.25,
	wheelMult: 1.4,
	maxOverscroll: 60,
	momentumResistance: 0.94,
	springK: 1400,
	springDamping: 0.9,
	stopVelocity: 10,
	snapDistance: 0.8,
	smooth: 0.12,

	pressDelay: 140,
	pressMoveTolerance: 6,

	clickThreshold: 10,
	autoUpdateBounds: true,
	initialScroll: 0,
	enableWheel: true,
	autoScrollToBottomOnMount: true,
	autoScrollDuration: 0.8,
})

const emit = defineEmits<{
	scroll: [scrollTop: number]
	scrollStart: []
	scrollEnd: []
	click: [event: PointerEvent]
	state: [state: ElasticScrollState]
}>()

const containerRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)

const isDragging = ref(false)
const isPressing = ref(false)

const scrollState = ref<ElasticScrollState | null>(null)
const isScrolling = ref(false)

let scroller: ElasticScroll | null = null
let resizeObserver: ResizeObserver | null = null
let canvasResizeObserver: ResizeObserver | null = null
let detachWheel: null | (() => void) = null

let isPointerDown = false
let pointerId: number | null = null
let pointerStartY = 0
let pointerLastY = 0
let pointerStartTime = 0

let pressTimer: number | null = null
let dragActivated = false
let didAutoScrollOnMount = false
/** Чтобы при росте контента (напр. расширение сосуда) проскроллить к низу. */
let lastContentScrollHeight = 0

function buildOptions(): ElasticScrollOptions {
	return {
		dragMult: props.dragMult,
		wheelMult: props.wheelMult,
		maxOverscroll: props.maxOverscroll,
		momentumResistance: props.momentumResistance,
		springK: props.springK,
		springDamping: props.springDamping,
		stopVelocity: props.stopVelocity,
		snapDistance: props.snapDistance,
		smooth: props.smooth,
	}
}

function init() {
	const container = containerRef.value
	const content = contentRef.value
	if (!container || !content) return

	scroller?.destroy()
	scroller = new ElasticScroll(content, buildOptions())
	scroller.setOnState((s) => {
		scrollState.value = s
		isDragging.value = s.isDragging
		isScrolling.value = !s.isSettled

		emit('state', s)
		emit('scroll', s.y)
	})

	updateBounds()

	if (props.initialScroll) {
		scroller.setY(props.initialScroll)
	}
}

function updateBounds() {
	const container = containerRef.value
	const content = contentRef.value
	if (!container || !content || !scroller) return

	// Принудительно пересчитываем layout для получения актуальных размеров
	// Это важно, когда размеры canvas изменяются динамически
	void container.offsetHeight
	void content.offsetHeight

	const minY = 0
	const newMaxY = Math.max(0, content.scrollHeight - container.clientHeight)
	scroller.setBounds(minY, newMaxY)
}

/** Реакция на изменение размера контента: обновить bounds и при росте — проскроллить к низу. */
function onResize() {
	const content = contentRef.value
	if (!content || !scroller) return

	// Принудительно пересчитываем layout для получения актуальных размеров
	// Это важно, когда размеры canvas изменяются динамически
	void content.offsetHeight

	const newHeight = content.scrollHeight

	// Если пользователь активно взаимодействует, откладываем обновление границ
	if (isDragging.value || isScrolling.value || isPointerDown || dragActivated) {
		return
	}

	// Если пользователь не взаимодействует, обновляем сразу
	updateBounds()
	// Не скроллим вниз, если пользователь активно взаимодействует со скроллом
	if (
		lastContentScrollHeight > 0 &&
		newHeight > lastContentScrollHeight &&
		!isDragging.value &&
		!isScrolling.value &&
		!isPointerDown
	) {
		scrollToBottom()
	}
	lastContentScrollHeight = newHeight
}

function clearPressTimer() {
	if (pressTimer !== null) {
		window.clearTimeout(pressTimer)
		pressTimer = null
	}
}

function activateDrag() {
	if (!scroller || dragActivated) return
	dragActivated = true
	isPressing.value = false
	scroller.onDragStart(performance.now())
	emit('scrollStart')
}

function onPointerDown(e: PointerEvent) {
	const container = containerRef.value
	if (!container || !scroller) return
	if (e.button !== 0 && e.pointerType === 'mouse') return

	// Проверяем, является ли целевой элемент интерактивным (canvas, button и т.д.)
	const target = e.target as HTMLElement
	const isInteractiveElement =
		target.tagName === 'CANVAS' ||
		target.tagName === 'BUTTON' ||
		target.closest('button') !== null ||
		target.closest('canvas') !== null

	// Если это интерактивный элемент, не перехватываем событие и не запускаем таймер
	// Позволяем событиям проходить к элементу
	if (isInteractiveElement) {
		return
	}

	// Для неинтерактивных элементов перехватываем событие
	container.setPointerCapture(e.pointerId)

	isPointerDown = true
	pointerId = e.pointerId
	pointerStartY = e.clientY
	pointerLastY = e.clientY
	pointerStartTime = performance.now()

	dragActivated = false
	isPressing.value = true

	clearPressTimer()
	pressTimer = window.setTimeout(() => {
		activateDrag()
	}, props.pressDelay)
}

function onPointerMove(e: PointerEvent) {
	if (!scroller || !isPointerDown || pointerId !== e.pointerId) return

	const container = containerRef.value
	if (!container) return

	const deltaY = pointerLastY - e.clientY
	const moved = Math.abs(e.clientY - pointerStartY)
	const elapsedTime = performance.now() - pointerStartTime

	// Если drag не активирован, проверяем условия активации
	if (!dragActivated) {
		// Активируем drag если движение превысило tolerance ИЛИ прошло достаточно времени
		if (moved > props.pressMoveTolerance || elapsedTime >= props.pressDelay) {
			clearPressTimer()
			activateDrag()
			// Важно: обновляем pointerLastY после активации, чтобы не потерять движение
			pointerLastY = e.clientY
			// Применяем движение, которое привело к активации
			if (e.cancelable) {
				e.preventDefault()
			}
			scroller.onDrag(deltaY, performance.now())
		} else {
			// Недостаточно движения и времени - ждем, не preventDefault
			// НЕ обновляем pointerLastY, чтобы не потерять движение при следующей активации
			return
		}
	} else {
		// Если drag уже активен, обрабатываем движение
		pointerLastY = e.clientY
		if (e.cancelable) {
			e.preventDefault()
		}
		scroller.onDrag(deltaY, performance.now())
	}
}

function onPointerUp(e: PointerEvent) {
	const container = containerRef.value
	if (!container || !scroller || !isPointerDown || pointerId !== e.pointerId)
		return

	clearPressTimer()

	if (container.hasPointerCapture(e.pointerId)) {
		container.releasePointerCapture(e.pointerId)
	}

	const moved = Math.abs(e.clientY - pointerStartY)
	isPointerDown = false
	pointerId = null
	pointerStartTime = 0

	// Если drag так и не активировался и движения не было — это клик
	if (!dragActivated && moved <= props.clickThreshold) {
		isPressing.value = false
		emit('click', e)
		return
	}

	// Если drag был активирован, завершаем его
	if (dragActivated) {
		isPressing.value = false
		scroller.onDragEnd()
		emit('scrollEnd')
		dragActivated = false
	}
}


function attachWheel() {
	const el = containerRef.value
	if (!el || !scroller || !props.enableWheel) return

	// Сохраняем ссылку на scroller в замыкании
	const currentScroller = scroller

	const onWheel = (ev: WheelEvent) => {
		// Предотвращаем стандартное поведение скролла только если есть что скроллить
		if (!currentScroller) return
		
		const state = currentScroller.getState()
		const canScroll = state.maxY > 0
		
		if (canScroll) {
			ev.preventDefault()
			currentScroller.onWheel(ev.deltaY, ev.deltaMode, el.clientHeight)
		}
	}

	el.addEventListener('wheel', onWheel, { passive: false })
	return () => el.removeEventListener('wheel', onWheel)
}


// Public API
function scrollTo(y: number) {
	scroller?.setY(y)
}
function scrollToAnimated(y: number, duration = 0.3) {
	if (!scroller) return Promise.resolve()

	const currentY = scroller.getY()
	const targetY = y

	if (Math.abs(targetY - currentY) < 1) {
		return Promise.resolve()
	}

	return new Promise<void>((resolve) => {
		const obj = { y: currentY }
		gsap.to(obj, {
			y: targetY,
			duration,
			ease: 'power2.out',
			onUpdate: () => {
				scroller?.setY(obj.y)
			},
			onComplete: () => {
				scroller?.setY(targetY)
				resolve()
			},
		})
	})
}
function scrollToTop() {
	scrollTo(0)
}
function scrollToBottom() {
	const container = containerRef.value
	const content = contentRef.value
	if (!container || !content) return
	scrollTo(Math.max(0, content.scrollHeight - container.clientHeight))
}
function scrollToBottomAnimated(duration = 1.2, maxWaitTime = 2000) {
	const container = containerRef.value
	const content = contentRef.value
	if (!container || !content || !scroller) return Promise.resolve()

	// Ждать, пока высота контента будет вычислена
	return new Promise<void>((resolve) => {
		const startTime = Date.now()
		let lastHeight = 0

		const checkAndScroll = () => {
			// Обновить границы перед вычислением целевой позиции
			updateBounds()

			const currentHeight = content.scrollHeight
			const containerHeight = container.clientHeight
			const targetY = Math.max(0, currentHeight - containerHeight)

			// Если высота изменилась, продолжаем ждать
			if (currentHeight !== lastHeight && currentHeight > containerHeight) {
				lastHeight = currentHeight
			}

			// Если прошло слишком много времени или высота стабильна и есть что скроллить
			const elapsed = Date.now() - startTime
			if (
				elapsed > maxWaitTime ||
				(currentHeight === lastHeight && targetY > 10)
			) {
				const currentY = scroller?.getY() ?? 0

				if (targetY <= 0 || Math.abs(targetY - currentY) < 1) {
					resolve()
					return
				}

				// Запустить анимацию
				const obj = { y: currentY }
				gsap.to(obj, {
					y: targetY,
					duration,
					ease: 'power2.out',
					onUpdate: () => {
						scroller?.setY(obj.y)
					},
					onComplete: () => {
						scroller?.setY(targetY)
						resolve()
					},
				})
			} else {
				// Продолжить проверку
				requestAnimationFrame(checkAndScroll)
			}
		}

		checkAndScroll()
	})
}
function getScrollTop() {
	return scroller?.getY() ?? 0
}
function getScrollState() {
	return scroller?.getState() ?? scrollState.value
}

// Методы для внешнего drag scrolling (например, через level-indicator)
function startDrag(now = performance.now()) {
	if (!scroller) return
	scroller.onDragStart(now)
}

function drag(deltaY: number, now = performance.now()) {
	if (!scroller) return
	scroller.onDrag(deltaY, now)
}

function endDrag() {
	if (!scroller) return
	scroller.onDragEnd()
}

defineExpose({
	scrollTo,
	scrollToAnimated,
	scrollToTop,
	scrollToBottom,
	scrollToBottomAnimated,
	getScrollTop,
	updateBounds,

	// ✅ requested: expose current scrolling state
	getScrollState,
	scrollState, // ref
	isScrolling, // ref
	isDragging, // ref

	// Методы для внешнего drag scrolling
	startDrag,
	drag,
	endDrag,
})

onMounted(() => {
	nextTick(() => {
		init()

		// Убеждаемся, что scroller инициализирован перед прикреплением wheel handler
		if (scroller) {
			detachWheel?.()
			detachWheel = attachWheel() ?? null
		}

		if (props.autoUpdateBounds && containerRef.value && contentRef.value) {
			lastContentScrollHeight = contentRef.value.scrollHeight
			resizeObserver = new ResizeObserver(onResize)
			resizeObserver.observe(containerRef.value)
			resizeObserver.observe(contentRef.value)

			// Также отслеживаем изменения размера canvas внутри content
			// Это важно, когда canvas меняет размер динамически (например, при расширении сосуда)
			const canvas = contentRef.value.querySelector('canvas')
			if (canvas) {
				canvasResizeObserver = new ResizeObserver(() => {
					// При изменении размера canvas принудительно обновляем bounds
					requestAnimationFrame(() => {
						updateBounds()
					})
				})
				canvasResizeObserver.observe(canvas)
			}
		}

		// ✅ Автоскролл вниз при первом открытии
		if (props.autoScrollToBottomOnMount && !didAutoScrollOnMount) {
			didAutoScrollOnMount = true

			// 1) дать DOM/слоту прорендериться (2 animation frames)
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					// 2) пересчитать bounds
					updateBounds()
					
					// Убеждаемся, что wheel handler прикреплен после обновления bounds
					if (scroller && !detachWheel) {
						detachWheel = attachWheel() ?? null
					}

					// 3) проверить, есть ли что скроллить
					const state = scroller?.getState()
					if (state && state.maxY > 0) {
						// 4) прокрутить вниз
						scrollToBottomAnimated(props.autoScrollDuration, 2500)
					}
				})
			})
		}
	})
})

onBeforeUnmount(() => {
	clearPressTimer()

	// Сброс pointer состояния
	isPointerDown = false
	pointerId = null
	pointerStartTime = 0

	detachWheel?.()
	detachWheel = null

	resizeObserver?.disconnect()
	resizeObserver = null

	canvasResizeObserver?.disconnect()
	canvasResizeObserver = null

	scroller?.destroy()
	scroller = null
})

watch(
	() => [
		props.dragMult,
		props.wheelMult,
		props.maxOverscroll,
		props.momentumResistance,
		props.springK,
		props.springDamping,
		props.stopVelocity,
		props.snapDistance,
		props.smooth,
		props.enableWheel,
	],
	() => {
		nextTick(() => {
			init()
			// Убеждаемся, что scroller инициализирован перед прикреплением wheel handler
			if (scroller) {
				detachWheel?.()
				detachWheel = attachWheel() ?? null
			}
		})
	},
)
</script>

<style scoped lang="scss">
.momentum-scroll {
	position: relative;
	width: 100%;
	height: 100%;
	overflow: hidden;
	box-sizing: border-box;

	touch-action: none;
	user-select: none;
	-webkit-user-select: none;

	// Позволяем абсолютно позиционированным элементам внутри (например, level-indicator)
	// быть видимыми и обрабатывать события
	contain: layout style;

	&--dragging {
		cursor: grabbing;
		* {
			cursor: grabbing !important;
		}
	}

	&--pressing {
		cursor: grab;
	}

	&__content {
		width: 100%;
		height: max-content;
		min-height: fit-content;
		box-sizing: border-box;
		will-change: transform;
		transform: translate3d(0, 0, 0);
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		touch-action: none;
	}
}
</style>
