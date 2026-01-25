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
let detachTouchCapture: null | (() => void) = null

let isPointerDown = false
let pointerId: number | null = null
let pointerStartY = 0
let pointerLastY = 0

// Touch events state (для мобильных устройств)
let touchId: number | null = null
let touchStartY = 0
let touchLastY = 0
let touchStartX = 0
let touchLastX = 0
let isTouchDown = false
let touchStartTime = 0 // Время начала касания для определения быстрого/медленного движения

let pressTimer: number | null = null
let dragActivated = false
let pointerStartTime = 0 // Время начала pointer события
let didAutoScrollOnMount = false
/** Чтобы при росте контента (напр. расширение сосуда) проскроллить к низу. */
let lastContentScrollHeight = 0
let pendingBoundsUpdate: (() => void) | null = null
let boundsUpdateTimer: number | null = null

// Вспомогательная функция для определения мобильных устройств
function isMobileDevice(): boolean {
	return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
		('ontouchstart' in window) ||
		(navigator.maxTouchPoints > 0)
}

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
	if (isDragging.value || isScrolling.value || isPointerDown || isTouchDown || dragActivated) {
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
	if (isDragging.value || isScrolling.value || isPointerDown || isTouchDown || dragActivated) {
		// Сохраняем функцию обновления для вызова после завершения взаимодействия
		pendingBoundsUpdate = () => {
			updateBounds()
			// Не скроллим вниз, если пользователь активно взаимодействует со скроллом
			if (
				lastContentScrollHeight > 0 &&
				newHeight > lastContentScrollHeight &&
				!isDragging.value &&
				!isScrolling.value &&
				!isPointerDown &&
				!isTouchDown
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
			if (pendingBoundsUpdate && !isDragging.value && !isScrolling.value && !isPointerDown && !isTouchDown && !dragActivated) {
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
		!isPointerDown &&
		!isTouchDown
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

	// На мобильных устройствах игнорируем pointer события типа touch, используем только нативные touch события
	if (isMobileDevice() && e.pointerType === 'touch') {
		return
	}

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
	pointerStartTime = performance.now() // Запоминаем время начала pointer события

	dragActivated = false
	isPressing.value = true

	clearPressTimer()
	pressTimer = window.setTimeout(() => {
		activateDrag()
	}, props.pressDelay)
}

function onPointerMove(e: PointerEvent) {
	if (!scroller || !isPointerDown || pointerId !== e.pointerId) return

	// На мобильных устройствах игнорируем pointer события типа touch
	if (isMobileDevice() && e.pointerType === 'touch') {
		return
	}

	const container = containerRef.value
	if (!container) return

	const deltaY = pointerLastY - e.clientY
	pointerLastY = e.clientY

	const moved = Math.abs(e.clientY - pointerStartY)
	
	// Определяем, было ли движение быстрым (произошло до истечения pressDelay)
	const elapsedTime = performance.now() - pointerStartTime
	const isFastSwipe = elapsedTime < props.pressDelay

	// Если пользователь сдвинулся чуть-чуть — ждём long-press
	if (!dragActivated) {
		// если сильно потащил — проверяем, быстрое это движение или медленное
		if (moved > props.pressMoveTolerance) {
			// Если движение быстрое - обрабатываем как быстрый скролл (wheel event)
			if (isFastSwipe) {
				clearPressTimer()
				isPointerDown = false
				pointerId = null
				isPressing.value = false
				if (container.hasPointerCapture(e.pointerId)) {
					container.releasePointerCapture(e.pointerId)
				}
				// Обрабатываем как быстрый скролл через wheel event
				e.preventDefault()
				e.stopPropagation()
				scroller?.onWheel(deltaY * props.wheelMult, 0, container.clientHeight)
				return
			} else {
				// Медленное движение - активируем drag scrolling
				// Теперь перехватываем событие, если пользователь начал скроллить
				if (!container.hasPointerCapture(e.pointerId)) {
					container.setPointerCapture(e.pointerId)
				}
				activateDrag()
			}
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

	// На мобильных устройствах игнорируем pointer события типа touch
	if (isMobileDevice() && e.pointerType === 'touch') {
		return
	}

	clearPressTimer()

	if (container.hasPointerCapture(e.pointerId)) {
		container.releasePointerCapture(e.pointerId)
	}

	const moved = Math.abs(e.clientY - pointerStartY)
	isPointerDown = false
	pointerId = null
	pointerStartTime = 0

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
			if (pendingBoundsUpdate && !isDragging.value && !isScrolling.value && !isPointerDown && !isTouchDown && !dragActivated) {
				pendingBoundsUpdate()
				pendingBoundsUpdate = null
			}
		}, 50)
	}
}

// Touch event handlers для мобильных устройств
function onTouchStart(e: TouchEvent) {
	const container = containerRef.value
	if (!container || !scroller) return
	
	// Используем первый touch
	const touch = e.touches[0]
	if (!touch) return

	// Проверяем, является ли целевой элемент интерактивным
	const target = e.target as HTMLElement
	const isInteractiveElement =
		target.tagName === 'CANVAS' ||
		target.tagName === 'BUTTON' ||
		target.closest('button') !== null ||
		target.closest('canvas') !== null

	// Если это интерактивный элемент (canvas, button), не обрабатываем скролл
	// Позволяем игре обработать событие
	// level-indicator НЕ является интерактивным элементом - через него можно скроллить
	if (isInteractiveElement) {
		return
	}

	isTouchDown = true
	touchId = touch.identifier
	touchStartY = touch.clientY
	touchLastY = touch.clientY
	touchStartX = touch.clientX
	touchLastX = touch.clientX
	touchStartTime = performance.now() // Запоминаем время начала касания

	dragActivated = false
	isPressing.value = true

	clearPressTimer()
	// Не вызываем preventDefault здесь, чтобы не блокировать стандартное поведение
	// preventDefault будет вызван в onTouchMove только после активации drag
}

function onTouchMove(e: TouchEvent) {
	if (!scroller || !isTouchDown) return

	const container = containerRef.value
	if (!container) return

	// Находим нужный touch
	const touch = Array.from(e.touches).find(t => t.identifier === touchId)
	if (!touch) {
		// Если touch не найден, возможно событие было отменено
		if (e.touches.length === 0) {
			onTouchEnd(e)
		}
		return
	}

	// Проверяем, не находится ли текущее касание на интерактивном элементе
	// Это важно, если касание началось вне canvas, но переместилось на canvas
	const target = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement
	const isOnInteractiveElement =
		target &&
		(target.tagName === 'CANVAS' ||
			target.tagName === 'BUTTON' ||
			target.closest('button') !== null ||
			target.closest('canvas') !== null)

	// Если касание переместилось на интерактивный элемент и скролл еще не активирован
	// Отменяем обработку скролла, позволяем игре обработать
	if (!dragActivated && isOnInteractiveElement) {
		isTouchDown = false
		touchId = null
		isPressing.value = false
		touchStartTime = 0
		clearPressTimer()
		return
	}

	const deltaY = touchLastY - touch.clientY
	const deltaX = touchLastX - touch.clientX
	touchLastY = touch.clientY
	touchLastX = touch.clientX

	const movedY = Math.abs(touch.clientY - touchStartY)
	const movedX = Math.abs(touch.clientX - touchStartX)

	// Определяем направление движения
	// Если движение больше по горизонтали, чем по вертикали - это не скролл
	// Это позволяет игре обрабатывать горизонтальные свайпы
	const isVerticalSwipe = movedY > movedX
	const minSwipeDistance = 8 // Минимальное расстояние для активации скролла
	
	// Определяем, было ли движение быстрым (произошло до истечения pressDelay)
	const elapsedTime = performance.now() - touchStartTime
	const isFastSwipe = elapsedTime < props.pressDelay

	// Активируем скролл только при вертикальном свайпе
	if (!dragActivated) {
		if (isVerticalSwipe && movedY > minSwipeDistance) {
			// Если движение быстрое - обрабатываем как быстрый скролл (wheel event)
			if (isFastSwipe) {
				clearPressTimer()
				// Обрабатываем как быстрый скролл через wheel event
				// Используем текущий deltaY для мгновенного скролла
				e.preventDefault()
				e.stopPropagation()
				// Используем wheel mult для быстрого скролла
				scroller?.onWheel(deltaY * props.wheelMult, 0, container.clientHeight)
				// Обновляем touchLastY после обработки
				touchLastY = touch.clientY
				touchLastX = touch.clientX
				// Сбрасываем состояние для следующего движения
				isTouchDown = false
				touchId = null
				isPressing.value = false
				touchStartTime = 0
				return
			} else {
				// Медленное движение - активируем drag scrolling
				clearPressTimer()
				activateDrag()
				// После активации drag предотвращаем стандартное поведение
				e.preventDefault()
				e.stopPropagation()
			}
		} else if (movedX > minSwipeDistance && !isVerticalSwipe) {
			// Горизонтальный свайп - отменяем обработку скролла, позволяем игре обработать
			isTouchDown = false
			touchId = null
			isPressing.value = false
			touchStartTime = 0
			clearPressTimer()
			return
		} else {
			// Если движение еще недостаточное, не блокируем стандартное поведение
			return
		}
	}

	// drag активирован => скроллим только по вертикали
	// Но если касание переместилось на интерактивный элемент, прекращаем скролл
	if (isOnInteractiveElement) {
		onTouchEnd(e)
		return
	}

	e.preventDefault()
	e.stopPropagation()
	scroller.onDrag(deltaY, performance.now())
}

function onTouchEnd(e: TouchEvent) {
	const container = containerRef.value
	if (!container || !scroller || !isTouchDown) return

	clearPressTimer()

	const movedY = Math.abs(touchLastY - touchStartY)
	const movedX = Math.abs(touchLastX - touchStartX)
	const totalMoved = Math.sqrt(movedY * movedY + movedX * movedX)
	
	isTouchDown = false
	touchId = null
	touchStartX = 0
	touchLastX = 0
	touchStartTime = 0

	// Если drag так и не активировался и движения не было — это клик
	if (!dragActivated && totalMoved <= props.clickThreshold) {
		isPressing.value = false
		// Создаем синтетический PointerEvent для совместимости
		const syntheticEvent = new PointerEvent('click', {
			bubbles: true,
			cancelable: true,
			clientX: touchLastX || 0,
			clientY: touchLastY || 0,
		})
		emit('click', syntheticEvent)
		return
	}

	isPressing.value = false
	if (dragActivated) {
		scroller.onDragEnd()
		emit('scrollEnd')
	}
	dragActivated = false
	
	// После завершения взаимодействия выполняем отложенное обновление границ
	if (pendingBoundsUpdate) {
		setTimeout(() => {
			if (pendingBoundsUpdate && !isDragging.value && !isScrolling.value && !isPointerDown && !isTouchDown && !dragActivated) {
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

function attachTouchCapture() {
	const el = containerRef.value
	if (!el) return

	// Всегда добавляем touch обработчики для поддержки мобильных устройств
	// Используем passive: false для возможности вызова preventDefault
	el.addEventListener('touchstart', onTouchStart, { passive: false })
	el.addEventListener('touchmove', onTouchMove, { passive: false })
	el.addEventListener('touchend', onTouchEnd, { passive: false })
	el.addEventListener('touchcancel', onTouchEnd, { passive: false })
	
	return () => {
		el.removeEventListener('touchstart', onTouchStart, { passive: false } as EventListenerOptions)
		el.removeEventListener('touchmove', onTouchMove, { passive: false } as EventListenerOptions)
		el.removeEventListener('touchend', onTouchEnd, { passive: false } as EventListenerOptions)
		el.removeEventListener('touchcancel', onTouchEnd, { passive: false } as EventListenerOptions)
	}
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

		detachWheel?.()
		detachWheel = attachWheel() ?? null

		detachTouchCapture?.()
		detachTouchCapture = attachTouchCapture() ?? null

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
	
	// Сброс touch состояния
	isTouchDown = false
	touchId = null
	touchStartX = 0
	touchLastX = 0
	touchStartTime = 0
	
	// Сброс pointer состояния
	isPointerDown = false
	pointerId = null
	pointerStartTime = 0
	
	if (boundsUpdateTimer !== null) {
		clearTimeout(boundsUpdateTimer)
		boundsUpdateTimer = null
	}
	pendingBoundsUpdate = null

	detachWheel?.()
	detachWheel = null

	detachTouchCapture?.()
	detachTouchCapture = null

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
