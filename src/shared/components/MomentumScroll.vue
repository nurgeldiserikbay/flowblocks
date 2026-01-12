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
let pointerStartScroll = 0

let pressTimer: number | null = null
let dragActivated = false

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
	const maxY = Math.max(0, content.scrollHeight - container.clientHeight)
	scroller.setBounds(minY, maxY)
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

	// Canvas не должен обрабатывать drag-скролл
	const target = e.target as HTMLElement
	if (target.tagName === 'CANVAS' || target.closest('canvas')) return

	container.setPointerCapture(e.pointerId)

	isPointerDown = true
	pointerId = e.pointerId
	pointerStartY = e.clientY
	pointerLastY = e.clientY
	pointerStartScroll = scroller.getY()

	dragActivated = false
	isPressing.value = true

	clearPressTimer()
	pressTimer = window.setTimeout(() => {
		activateDrag()
	}, props.pressDelay)
}

function onPointerMove(e: PointerEvent) {
	if (!scroller || !isPointerDown || pointerId !== e.pointerId) return

	const deltaY = pointerLastY - e.clientY
	pointerLastY = e.clientY

	const moved = Math.abs(e.clientY - pointerStartY)

	// Если пользователь сдвинулся чуть-чуть — ждём long-press
	if (!dragActivated) {
		// если сильно потащил — можно активировать раньше, чем pressDelay
		if (moved > props.pressMoveTolerance) {
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

	isPointerDown = false
	pointerId = null

	// Если drag так и не активировался — это клик
	if (!dragActivated) {
		isPressing.value = false
		emit('click', e)
		return
	}

	isPressing.value = false
	scroller.onDragEnd()
	emit('scrollEnd')
	dragActivated = false
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
			resizeObserver = new ResizeObserver(() => updateBounds())
			resizeObserver.observe(containerRef.value)
			resizeObserver.observe(contentRef.value)
		}
	})
})

onBeforeUnmount(() => {
	clearPressTimer()

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
		min-height: 100%;
		height: max-content;
		box-sizing: border-box;
		will-change: transform;
		transform: translate3d(0, 0, 0);
	}
}
</style>
