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
let detachWheel: null | (() => void) = null

let isPointerDown = false
let pointerId: number | null = null
let pointerStartY = 0
let pointerLastY = 0

let pressTimer: number | null = null
let dragActivated = false
let didAutoScrollOnMount = false
/** Чтобы при росте контента (напр. расширение сосуда) проскроллить к низу. */
let lastContentScrollHeight = 0
let pendingBoundsUpdate: (() => void) | null = null
let boundsUpdateTimer: number | null = null

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

	const minY = 0
	const state = scroller.getState()
	const oldMaxY = state?.maxY ?? 0
	const newMaxY = Math.max(0, content.scrollHeight - container.clientHeight)
	
	// Если пользователь активно взаимодействует, откладываем обновление границ
	if (isDragging.value || isScrolling.value || isPointerDown || dragActivated) {
		// Обновляем только границы без изменения позиции (setBounds не будет clamp во время dragging)
		scroller.setBounds(minY, newMaxY)
		return
	}
	
	// Сохраняем относительную позицию скролла (расстояние от низа)
	// чтобы избежать неожиданного сдвига при изменении высоты контента
	if (oldMaxY > 0 && newMaxY !== oldMaxY) {
		const currentY = scroller.getY()
		const distanceFromBottom = Math.max(0, oldMaxY - currentY)
		
		// Обновляем границы (это может изменить позицию из-за clamp)
		scroller.setBounds(minY, newMaxY)
		
		// Восстанавливаем относительную позицию (расстояние от низа)
		if (newMaxY > 0) {
			const newY = Math.max(0, Math.min(newMaxY, newMaxY - distanceFromBottom))
			scroller.setY(newY)
		}
	} else {
		// Если высота не изменилась, просто обновляем границы
		scroller.setBounds(minY, newMaxY)
	}
}

/** Реакция на изменение размера контента: обновить bounds и при росте — проскроллить к низу. */
function onResize() {
	const content = contentRef.value
	if (!content || !scroller) return

	const newHeight = content.scrollHeight
	
	// Если пользователь активно взаимодействует, откладываем обновление границ
	if (isDragging.value || isScrolling.value || isPointerDown || dragActivated) {
		// Сохраняем функцию обновления для вызова после завершения взаимодействия
		pendingBoundsUpdate = () => {
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
		}
		
		// Отменяем предыдущий таймер
		if (boundsUpdateTimer !== null) {
			clearTimeout(boundsUpdateTimer)
		}
		
		// Устанавливаем таймер для отложенного обновления
		boundsUpdateTimer = window.setTimeout(() => {
			if (pendingBoundsUpdate && !isDragging.value && !isScrolling.value && !isPointerDown && !dragActivated) {
				pendingBoundsUpdate()
				pendingBoundsUpdate = null
			}
			boundsUpdateTimer = null
		}, 100)
		
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
	pointerLastY = e.clientY

	const moved = Math.abs(e.clientY - pointerStartY)

	// Если пользователь сдвинулся чуть-чуть — ждём long-press
	if (!dragActivated) {
		// если сильно потащил — можно активировать раньше, чем pressDelay
		if (moved > props.pressMoveTolerance) {
			// Теперь перехватываем событие, если пользователь начал скроллить
			if (!container.hasPointerCapture(e.pointerId)) {
				container.setPointerCapture(e.pointerId)
			}
			activateDrag()
		} else {
			return
		}
	}

	// drag активирован => скроллим
	e.preventDefault()
	scroller.onDrag(deltaY, performance.now())
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

	// Если drag так и не активировался и движения не было — это клик
	// Позволяем событию клика пройти дальше к интерактивным элементам
	if (!dragActivated && moved <= props.clickThreshold) {
		isPressing.value = false
		emit('click', e)
		// Не вызываем preventDefault, чтобы клик прошел к canvas
		return
	}

	isPressing.value = false
	scroller.onDragEnd()
	emit('scrollEnd')
	dragActivated = false
	
	// После завершения взаимодействия выполняем отложенное обновление границ
	if (pendingBoundsUpdate) {
		// Небольшая задержка, чтобы убедиться, что взаимодействие полностью завершено
		setTimeout(() => {
			if (pendingBoundsUpdate && !isDragging.value && !isScrolling.value && !isPointerDown && !dragActivated) {
				pendingBoundsUpdate()
				pendingBoundsUpdate = null
			}
		}, 50)
	}
}

function attachWheel() {
	const el = containerRef.value
	if (!el || !scroller || !props.enableWheel) return

	const onWheel = (ev: WheelEvent) => {
		ev.preventDefault()
		scroller?.onWheel(ev.deltaY, ev.deltaMode, el.clientHeight)
	}

	el.addEventListener('wheel', onWheel, { passive: false })
	return () => el.removeEventListener('wheel', onWheel)
}

// Public API
function scrollTo(y: number) {
	scroller?.setY(y)
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

defineExpose({
	scrollTo,
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
})

onMounted(() => {
	nextTick(() => {
		init()

		detachWheel?.()
		detachWheel = attachWheel() ?? null

		if (props.autoUpdateBounds && containerRef.value && contentRef.value) {
			lastContentScrollHeight = contentRef.value.scrollHeight
			resizeObserver = new ResizeObserver(onResize)
			resizeObserver.observe(containerRef.value)
			resizeObserver.observe(contentRef.value)
		}

		// ✅ Автоскролл вниз при первом открытии
		if (props.autoScrollToBottomOnMount && !didAutoScrollOnMount) {
			didAutoScrollOnMount = true

			// 1) дать DOM/слоту прорендериться
			requestAnimationFrame(() => {
				// 2) пересчитать bounds
				updateBounds()

				// 3) прокрутить вниз (можно без анимации, но лучше плавно)
				scrollToBottomAnimated(props.autoScrollDuration, 2500)
			})
		}
	})
})

onBeforeUnmount(() => {
	clearPressTimer()
	
	if (boundsUpdateTimer !== null) {
		clearTimeout(boundsUpdateTimer)
		boundsUpdateTimer = null
	}
	pendingBoundsUpdate = null

	detachWheel?.()
	detachWheel = null

	resizeObserver?.disconnect()
	resizeObserver = null

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
			detachWheel?.()
			detachWheel = attachWheel() ?? null
		})
	}
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
		min-height: 100%;
		box-sizing: border-box;
		will-change: transform;
		transform: translate3d(0, 0, 0);
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
	}
}
</style>
