<template>
	<div
		ref="containerRef"
		class="momentum-scroll"
		:class="{ 'momentum-scroll--dragging': isDragging }"
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

	clickThreshold?: number
	autoUpdateBounds?: boolean
	initialScroll?: number
	enableWheel?: boolean
}

const props = withDefaults(defineProps<MomentumScrollProps>(), {
	dragMult: 1.25,
	wheelMult: 1.4,
	maxOverscroll: 40,
	momentumResistance: 0.54,
	springK: 90,
	springDamping: 0.88,
	stopVelocity: 8,
	snapDistance: 0.8,

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
}>()

const containerRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)

const isDragging = ref(false)

let scroller: ElasticScroll | null = null
let resizeObserver: ResizeObserver | null = null
let detachWheel: null | (() => void) = null

let isPointerDown = false
let pointerId: number | null = null
let pointerStartY = 0
let pointerLastY = 0
let pointerStartScroll = 0

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
	}
}

function init() {
	const container = containerRef.value
	const content = contentRef.value
	if (!container || !content) return

	scroller?.destroy()
	scroller = new ElasticScroll(content, buildOptions())

	updateBounds()

	if (props.initialScroll) {
		scroller.setY(props.initialScroll)
		emit('scroll', scroller.getY())
	}
}

function updateBounds() {
	const container = containerRef.value
	const content = contentRef.value
	if (!container || !content || !scroller) return

	const minY = 0
	const maxY = Math.max(0, content.scrollHeight - container.clientHeight)

	scroller.setBounds(minY, maxY)
	emit('scroll', scroller.getY())
}

function onPointerDown(e: PointerEvent) {
	const container = containerRef.value
	if (!container || !scroller) return
	if (e.button !== 0 && e.pointerType === 'mouse') return

	// Если внутри canvas — не перехватываем (Pixi)
	const target = e.target as HTMLElement
	if (target.tagName === 'CANVAS' || target.closest('canvas')) return

	container.setPointerCapture(e.pointerId)

	isPointerDown = true
	pointerId = e.pointerId

	pointerStartY = e.clientY
	pointerLastY = e.clientY
	pointerStartScroll = scroller.getY()

	isDragging.value = true
	scroller.onDragStart(performance.now())
	emit('scrollStart')
}

function onPointerMove(e: PointerEvent) {
	if (!scroller || !isPointerDown || pointerId !== e.pointerId) return

	const deltaY = pointerLastY - e.clientY
	pointerLastY = e.clientY

	const total = Math.abs(e.clientY - pointerStartY)
	if (total > props.clickThreshold || scroller.getY() !== pointerStartScroll) {
		e.preventDefault()
		scroller.onDrag(deltaY, performance.now())
		emit('scroll', scroller.getY())
	}
}

function onPointerUp(e: PointerEvent) {
	const container = containerRef.value
	if (!container || !scroller || !isPointerDown || pointerId !== e.pointerId)
		return

	if (container.hasPointerCapture(e.pointerId)) {
		container.releasePointerCapture(e.pointerId)
	}

	const wasClick =
		Math.abs(e.clientY - pointerStartY) <= props.clickThreshold &&
		Math.abs(scroller.getY() - pointerStartScroll) < props.clickThreshold

	scroller.onDragEnd()

	isPointerDown = false
	pointerId = null
	isDragging.value = false

	emit('scrollEnd')
	if (wasClick) emit('click', e)
}

function attachWheel() {
	const el = containerRef.value
	if (!el || !scroller || !props.enableWheel) return

	const onWheel = (ev: WheelEvent) => {
		ev.preventDefault()
		scroller?.onWheel(ev.deltaY, ev.deltaMode, el.clientHeight)
		if (scroller) emit('scroll', scroller.getY())
	}

	el.addEventListener('wheel', onWheel, { passive: false })
	return () => el.removeEventListener('wheel', onWheel)
}

// Public API
function scrollTo(y: number) {
	if (!scroller) return
	scroller.setY(y)
	emit('scroll', scroller.getY())
}
function scrollToTop() {
	scrollTo(0)
}
function scrollToBottom() {
	const container = containerRef.value
	const content = contentRef.value
	if (!container || !content) return
	const maxY = Math.max(0, content.scrollHeight - container.clientHeight)
	scrollTo(maxY)
}
function getScrollTop() {
	return scroller?.getY() ?? 0
}

defineExpose({
	scrollTo,
	scrollToTop,
	scrollToBottom,
	getScrollTop,
	updateBounds,
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

	/* важно для кастомного скролла */
	touch-action: none;
	user-select: none;
	-webkit-user-select: none;

	&--dragging {
		cursor: grabbing;
		* {
			cursor: grabbing !important;
		}
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
