<template>
	<AppLayout>
		<template #title>
			<div class="game-header">
				<div class="game-header__time">{{ formattedTime }}</div>
				<div class="game-header__score">Score: {{ gameStore.score }}</div>
				<div class="game-header__wave">Wave: {{ gameStore.waveIndex }}</div>
			</div>
		</template>

		<div class="game-page">
			<div 
				ref="playAreaRef"
				class="game-page__play-area"
				@pointerdown="handlePlayAreaPointerDown"
				@pointermove="handlePlayAreaPointerMove"
				@pointerup="handlePlayAreaPointerUp"
				@pointercancel="handlePlayAreaPointerUp"
				@touchstart="handlePlayAreaTouchStart"
				@touchmove="handlePlayAreaTouchMove"
				@touchend="handlePlayAreaTouchEnd"
				@touchcancel="handlePlayAreaTouchEnd"
			>
				<MomentumScroll
					ref="momentumScroll"
					:drag-mult="1.55"
					:wheel-mult="2.2"
					:max-overscroll="80"
					:momentum-resistance="0.9"
					:spring-k="90"
					:spring-damping="0.88"
					class="game-page__scroll-container"
				>
					<div class="game-page__canvas-container">
						<canvas ref="canvas" class="game-canvas"></canvas>
					</div>
				</MomentumScroll>

				<div 
					v-if="!gameStore.isGameOver" 
					ref="levelIndicatorRef"
					class="level-indicator" 
					:title="`До верха: ${rowsToTop} ряд.`"
					@pointerdown="handleLevelIndicatorPointerDown"
					@pointermove="handleLevelIndicatorPointerMove"
					@pointerup="handleLevelIndicatorPointerUp"
					@pointercancel="handleLevelIndicatorPointerUp"
					@click="handleLevelIndicatorClick"
					@touchstart="handleLevelIndicatorTouchStart"
					@touchmove="handleLevelIndicatorTouchMove"
					@touchend="handleLevelIndicatorTouchEnd"
					@touchcancel="handleLevelIndicatorTouchEnd"
				>
					<div class="level-indicator__label">{{ rowsToTop }}</div>
					<div 
						class="level-indicator__bar"
						@pointerdown.stop="handleLevelIndicatorBarPointerDown"
						@pointermove.stop="handleLevelIndicatorBarPointerMove"
						@pointerup.stop="handleLevelIndicatorBarPointerUp"
						@pointercancel.stop="handleLevelIndicatorBarPointerUp"
						@touchstart.stop="handleLevelIndicatorBarTouchStart"
						@touchmove.stop="handleLevelIndicatorBarTouchMove"
						@touchend.stop="handleLevelIndicatorBarTouchEnd"
					>
						<div
							class="level-indicator__fill"
							:style="{
								height: levelFillPercent + '%',
								backgroundColor: levelBarColor,
							}"
						/>
					</div>
				</div>
			</div>

			<button class="btn btn--back btn--game" @click="showExitDialog">
				← Exit
			</button>

			<ConfirmDialog
				v-model="isExitDialogOpen"
				title="Exit Game"
				message="Are you sure you want to exit? Progress will be lost."
				confirm-text="Exit"
				cancel-text="Cancel"
				@confirm="handleExit"
			/>

			<div v-if="gameStore.isGameOver" class="game-overlay">
				<div class="game-overlay__content">
					<div class="game-overlay__icon">✕</div>
					<h2 class="game-overlay__title">Game Over</h2>
					<p class="game-overlay__score">Final Score: <strong>{{ gameStore.score }}</strong></p>
					<button class="btn btn--restart" @click="restart">
						<span class="btn--restart__icon">↻</span>
						Restart
					</button>
				</div>
			</div>
		</div>
	</AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, useTemplateRef, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ScreenOrientation } from '@capacitor/screen-orientation'
import { Capacitor } from '@capacitor/core'
import AppLayout from '@/shared/components/AppLayout.vue'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import MomentumScroll from '@/shared/components/MomentumScroll.vue'
import { GameRenderer } from '@/game/render'
import { GameController } from '@/game/GameController'
import { useGameStore } from '@/shared/stores/gameStore'
import { WIDTH } from '@/game/logic'
import { AudioManager } from '@/game/audio/AudioManager'

const router = useRouter()
const gameStore = useGameStore()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const momentumScrollRef = useTemplateRef<InstanceType<typeof MomentumScroll>>('momentumScroll')
const levelIndicatorRef = useTemplateRef<HTMLElement>('levelIndicator')
const playAreaRef = useTemplateRef<HTMLElement>('playArea')
const isExitDialogOpen = ref(false)

// Состояние для обработки событий на level-indicator
let levelIndicatorPointerId: number | null = null
let levelIndicatorTouchId: number | null = null
let levelIndicatorStartY = 0
let levelIndicatorLastY = 0
let levelIndicatorStartClientY = 0
let levelIndicatorHasMoved = false // Флаг для определения, было ли движение (чтобы отличить клик от свайпа)
let levelIndicatorDragStarted = false // Флаг для отслеживания начала drag через ElasticScroll
let levelIndicatorScrollRatio = 1 // Коэффициент масштабирования для преобразования движения мыши в скролл

// Состояние для обработки событий на level-indicator__bar
let levelIndicatorBarPointerId: number | null = null
let levelIndicatorBarTouchId: number | null = null
let levelIndicatorBarStartY = 0
let levelIndicatorBarLastY = 0
let levelIndicatorBarStartClientY = 0
let levelIndicatorBarElement: HTMLElement | null = null
let levelIndicatorBarHasMoved = false
let levelIndicatorBarDragStarted = false // Флаг для отслеживания начала drag через ElasticScroll
let levelIndicatorBarScrollRatio = 1 // Коэффициент масштабирования для преобразования движения мыши в скролл

// Состояние для обработки событий на play-area (dragging scroll на всем компоненте)
let playAreaPointerId: number | null = null
let playAreaTouchId: number | null = null
let playAreaStartY = 0
let playAreaLastY = 0
let playAreaStartX = 0
let playAreaLastX = 0
let playAreaDragStarted = false
let playAreaPressTimer: ReturnType<typeof setTimeout> | null = null
const PLAY_AREA_PRESS_DELAY = 140 // ms
const PLAY_AREA_PRESS_MOVE_TOLERANCE = 6 // px
const PLAY_AREA_CLICK_THRESHOLD = 10 // px

// Вспомогательная функция для проверки, является ли элемент интерактивным
function isInteractiveElement(target: HTMLElement | null): boolean {
	if (!target) return false
	return (
		target.tagName === 'CANVAS' ||
		target.tagName === 'BUTTON' ||
		target.closest('button') !== null ||
		target.closest('canvas') !== null ||
		target.closest('.level-indicator') !== null
	)
}

// Вспомогательная функция для проверки, находится ли элемент внутри MomentumScroll
function isInsideMomentumScroll(target: HTMLElement | null): boolean {
	if (!target) return false
	const momentumScrollElement = target.closest('.momentum-scroll')
	if (!momentumScrollElement) return false
	// Проверяем, что это не интерактивный элемент внутри MomentumScroll
	return !isInteractiveElement(target)
}

// Вспомогательная функция для определения мобильных устройств
function isMobileDevice(): boolean {
	return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
		('ontouchstart' in window) ||
		(navigator.maxTouchPoints > 0)
}

// Обработчики событий для play-area - dragging scroll на всем компоненте
function clearPlayAreaPressTimer() {
	if (playAreaPressTimer !== null) {
		clearTimeout(playAreaPressTimer)
		playAreaPressTimer = null
	}
}

function activatePlayAreaDrag() {
	if (!momentumScrollRef.value || playAreaDragStarted) return
	playAreaDragStarted = true
	momentumScrollRef.value.updateBounds()
	momentumScrollRef.value.startDrag(performance.now())
}

function handlePlayAreaPointerDown(e: PointerEvent) {
	if (e.button !== 0 && e.pointerType === 'mouse') return
	
	// На мобильных устройствах игнорируем pointer события типа touch
	if (isMobileDevice() && e.pointerType === 'touch') {
		return
	}
	
	// Проверяем, является ли целевой элемент интерактивным
	const target = e.target as HTMLElement
	if (isInteractiveElement(target)) {
		return // Позволяем интерактивным элементам обработать событие
	}
	
	// Если событие происходит на MomentumScroll (не на интерактивных элементах),
	// полностью пропускаем его - MomentumScroll обработает его сам
	if (isInsideMomentumScroll(target)) {
		return
	}
	
	// Обрабатываем только события вне MomentumScroll (например, на play-area вокруг него)
	if (!playAreaRef.value || !momentumScrollRef.value) return
	
	// Завершаем предыдущий drag, если он был активен
	if (playAreaDragStarted && momentumScrollRef.value) {
		momentumScrollRef.value.endDrag()
	}
	
	// Захватываем pointer для отслеживания движения даже вне элемента
	playAreaRef.value.setPointerCapture(e.pointerId)
	
	playAreaPointerId = e.pointerId
	playAreaStartY = e.clientY
	playAreaLastY = e.clientY
	playAreaDragStarted = false
	
	clearPlayAreaPressTimer()
	playAreaPressTimer = setTimeout(() => {
		activatePlayAreaDrag()
	}, PLAY_AREA_PRESS_DELAY)
}

function handlePlayAreaPointerMove(e: PointerEvent) {
	if (!momentumScrollRef.value || !playAreaRef.value || playAreaPointerId !== e.pointerId) return
	
	// На мобильных устройствах игнорируем pointer события типа touch
	if (isMobileDevice() && e.pointerType === 'touch') {
		return
	}
	
	// Проверяем, находится ли pointer на MomentumScroll (не на интерактивных элементах)
	const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement
	if (isInsideMomentumScroll(target)) {
		// Если drag еще не активирован, прекращаем обработку
		if (!playAreaDragStarted) {
			playAreaPointerId = null
			clearPlayAreaPressTimer()
			if (playAreaRef.value.hasPointerCapture(e.pointerId)) {
				playAreaRef.value.releasePointerCapture(e.pointerId)
			}
			return
		} else {
			// Если drag уже активирован, прекращаем скролл
			handlePlayAreaPointerUp(e)
			return
		}
	}
	
	const deltaY = playAreaLastY - e.clientY
	playAreaLastY = e.clientY
	
	const moved = Math.abs(e.clientY - playAreaStartY)
	
	// Если пользователь сдвинулся чуть-чуть — ждём long-press
	if (!playAreaDragStarted) {
		// если сильно потащил — можно активировать раньше, чем pressDelay
		if (moved > PLAY_AREA_PRESS_MOVE_TOLERANCE) {
			if (!playAreaRef.value.hasPointerCapture(e.pointerId)) {
				playAreaRef.value.setPointerCapture(e.pointerId)
			}
			activatePlayAreaDrag()
		} else {
			return
		}
	}
	
	// drag активирован => скроллим
	e.preventDefault()
	e.stopPropagation()
	momentumScrollRef.value.drag(deltaY, performance.now())
}

function handlePlayAreaPointerUp(e: PointerEvent) {
	if (!playAreaRef.value || playAreaPointerId !== e.pointerId) return
	
	// Освобождаем захват pointer
	if (playAreaRef.value.hasPointerCapture(e.pointerId)) {
		playAreaRef.value.releasePointerCapture(e.pointerId)
	}
	
	clearPlayAreaPressTimer()
	
	const moved = Math.abs(e.clientY - playAreaStartY)
	const dragStarted = playAreaDragStarted
	
	// Завершаем drag через MomentumScroll, если он был начат
	if (dragStarted && momentumScrollRef.value) {
		momentumScrollRef.value.endDrag()
	}
	
	// Очищаем состояние
	playAreaPointerId = null
	playAreaDragStarted = false
	
	// Если движения не было, это клик - не обрабатываем здесь
	if (!dragStarted && moved <= PLAY_AREA_CLICK_THRESHOLD) {
		// Позволяем событию клика пройти дальше
		return
	}
}

// Touch event handlers для play-area
function handlePlayAreaTouchStart(e: TouchEvent) {
	if (!playAreaRef.value || !momentumScrollRef.value) return
	
	const touch = e.touches[0]
	if (!touch) return
	
	// Проверяем, является ли целевой элемент интерактивным
	const target = e.target as HTMLElement
	if (isInteractiveElement(target)) {
		return // Позволяем интерактивным элементам обработать событие
	}
	
	// Если событие происходит на MomentumScroll (не на интерактивных элементах),
	// позволяем MomentumScroll обработать его самому
	if (isInsideMomentumScroll(target)) {
		return
	}
	
	// Завершаем предыдущий drag, если он был активен
	if (playAreaDragStarted && momentumScrollRef.value) {
		momentumScrollRef.value.endDrag()
	}
	
	playAreaTouchId = touch.identifier
	playAreaStartY = touch.clientY
	playAreaLastY = touch.clientY
	playAreaStartX = touch.clientX
	playAreaLastX = touch.clientX
	playAreaDragStarted = false
	
	clearPlayAreaPressTimer()
	playAreaPressTimer = setTimeout(() => {
		activatePlayAreaDrag()
	}, PLAY_AREA_PRESS_DELAY)
}

function handlePlayAreaTouchMove(e: TouchEvent) {
	if (!momentumScrollRef.value || !playAreaRef.value || !playAreaTouchId) return
	
	const touch = Array.from(e.touches).find(t => t.identifier === playAreaTouchId)
	if (!touch) {
		if (e.touches.length === 0) {
			handlePlayAreaTouchEnd(e)
		}
		return
	}
	
	// Проверяем, не находится ли текущее касание на интерактивном элементе
	const target = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement
	if (isInteractiveElement(target)) {
		// Если касание переместилось на интерактивный элемент и скролл еще не активирован
		if (!playAreaDragStarted) {
			playAreaTouchId = null
			clearPlayAreaPressTimer()
			return
		} else {
			// Если drag уже активирован, прекращаем скролл
			handlePlayAreaTouchEnd(e)
			return
		}
	}
	
	// Если касание находится на MomentumScroll (не на интерактивных элементах),
	// позволяем MomentumScroll обработать его самому
	if (isInsideMomentumScroll(target)) {
		if (!playAreaDragStarted) {
			playAreaTouchId = null
			clearPlayAreaPressTimer()
			return
		} else {
			// Если drag уже активирован, прекращаем скролл
			handlePlayAreaTouchEnd(e)
			return
		}
	}
	
	const deltaY = playAreaLastY - touch.clientY
	playAreaLastY = touch.clientY
	playAreaLastX = touch.clientX // Обновляем для вычисления movedX
	
	const movedY = Math.abs(touch.clientY - playAreaStartY)
	const movedX = Math.abs(touch.clientX - playAreaStartX)
	
	// Определяем направление движения
	const isVerticalSwipe = movedY > movedX
	const minSwipeDistance = 8 // Минимальное расстояние для активации скролла
	
	// Активируем скролл только при вертикальном свайпе
	if (!playAreaDragStarted) {
		if (isVerticalSwipe && movedY > minSwipeDistance) {
			clearPlayAreaPressTimer()
			activatePlayAreaDrag()
			e.preventDefault()
			e.stopPropagation()
		} else if (movedX > minSwipeDistance && !isVerticalSwipe) {
			// Горизонтальный свайп - отменяем обработку скролла
			playAreaTouchId = null
			clearPlayAreaPressTimer()
			return
		} else {
			return
		}
	}
	
	// drag активирован => скроллим только по вертикали
	e.preventDefault()
	e.stopPropagation()
	momentumScrollRef.value.drag(deltaY, performance.now())
}

function handlePlayAreaTouchEnd(e: TouchEvent) {
	if (!playAreaRef.value || !momentumScrollRef.value || !playAreaTouchId) return
	
	clearPlayAreaPressTimer()
	
	const touch = e.changedTouches[0]
	if (!touch || touch.identifier !== playAreaTouchId) return
	
	const movedY = Math.abs(playAreaLastY - playAreaStartY)
	const movedX = Math.abs(playAreaLastX - playAreaStartX)
	const totalMoved = Math.sqrt(movedY * movedY + movedX * movedX)
	const dragStarted = playAreaDragStarted
	
	// Завершаем drag через MomentumScroll, если он был начат
	if (dragStarted && momentumScrollRef.value) {
		momentumScrollRef.value.endDrag()
	}
	
	// Очищаем состояние
	playAreaTouchId = null
	playAreaStartX = 0
	playAreaLastX = 0
	playAreaDragStarted = false
	
	// Если движения не было, это клик - не обрабатываем здесь
	if (!dragStarted && totalMoved <= PLAY_AREA_CLICK_THRESHOLD) {
		return
	}
}

// Обработчики событий для level-indicator - drag-scrolling через весь индикатор
function handleLevelIndicatorPointerDown(e: PointerEvent) {
	if (e.button !== 0 && e.pointerType === 'mouse') return
	
	// Проверяем, что клик не на баре (бар обрабатывает свои события отдельно)
	const target = e.target as HTMLElement
	if (target.closest('.level-indicator__bar')) {
		return // Бар обрабатывает свои события отдельно
	}
	
	if (!levelIndicatorRef.value || !momentumScrollRef.value) return
	
	// Завершаем предыдущий drag, если он был активен (на случай если предыдущий drag не завершился)
	if (levelIndicatorDragStarted && momentumScrollRef.value) {
		momentumScrollRef.value.endDrag()
	}
	
	const indicatorElement = levelIndicatorRef.value
	
	// Захватываем pointer для отслеживания движения даже вне элемента
	indicatorElement.setPointerCapture(e.pointerId)
	
	levelIndicatorPointerId = e.pointerId
	levelIndicatorStartY = e.clientY
	levelIndicatorLastY = e.clientY
	levelIndicatorStartClientY = e.clientY
	levelIndicatorHasMoved = false
	levelIndicatorDragStarted = false
	
	// Вычисляем коэффициент масштабирования для преобразования движения мыши в скролл
	const scrollState = momentumScrollRef.value.getScrollState()
	const maxScroll = scrollState?.maxY ?? 0
	const indicatorHeight = indicatorElement.getBoundingClientRect().height
	
	if (indicatorHeight > 0 && maxScroll > 0) {
		// Коэффициент показывает, сколько пикселей скролла соответствует одному пикселю движения мыши
		levelIndicatorScrollRatio = maxScroll / indicatorHeight
	} else {
		levelIndicatorScrollRatio = 1
	}
	
	// Не вызываем preventDefault здесь, чтобы клик мог пройти дальше
}

function handleLevelIndicatorPointerMove(e: PointerEvent) {
	if (!momentumScrollRef.value || !levelIndicatorRef.value || levelIndicatorPointerId !== e.pointerId) return
	
	// Всегда обновляем lastY для правильного расчета дельты
	const deltaY = levelIndicatorLastY - e.clientY
	levelIndicatorLastY = e.clientY
	
	const moved = Math.abs(e.clientY - levelIndicatorStartY)
	if (moved > 3) {
		// Если движение больше 3px, это drag - выполняем скролл
		levelIndicatorHasMoved = true
		e.preventDefault()
		e.stopPropagation()
		
		// Начинаем drag через ElasticScroll при первом движении
		if (!levelIndicatorDragStarted) {
			levelIndicatorDragStarted = true
			momentumScrollRef.value.updateBounds()
			momentumScrollRef.value.startDrag(performance.now())
		}
		
		// Преобразуем дельту движения мыши в дельту скролла
		const scrollDelta = deltaY * levelIndicatorScrollRatio
		
		// Используем метод drag для плавного скролла с инерцией
		momentumScrollRef.value.drag(scrollDelta, performance.now())
	}
}

function handleLevelIndicatorPointerUp(e: PointerEvent) {
	if (!levelIndicatorRef.value || levelIndicatorPointerId !== e.pointerId) return
	
	// Освобождаем захват pointer
	if (levelIndicatorRef.value.hasPointerCapture(e.pointerId)) {
		levelIndicatorRef.value.releasePointerCapture(e.pointerId)
	}
	
	// Сохраняем значения в локальные переменные перед nextTick
	const indicatorElement = levelIndicatorRef.value
	const startClientY = levelIndicatorStartClientY
	const hasMoved = levelIndicatorHasMoved
	const dragStarted = levelIndicatorDragStarted
	
	// Завершаем drag через ElasticScroll, если он был начат
	if (dragStarted && momentumScrollRef.value) {
		momentumScrollRef.value.endDrag()
	}
	
	// Очищаем состояние сразу
	levelIndicatorPointerId = null
	levelIndicatorHasMoved = false
	levelIndicatorDragStarted = false
	
	// Если движения не было, это клик - выполняем скролл
	if (!hasMoved) {
		e.preventDefault()
		e.stopPropagation()
		
		// Используем nextTick для гарантии, что ref инициализирован
		nextTick(() => {
			if (!momentumScrollRef.value) {
				console.warn('momentumScrollRef is still null after nextTick')
				return
			}
			
			// Обновляем границы скролла перед вычислением позиции
			momentumScrollRef.value.updateBounds()
			
			// Получаем позицию клика относительно индикатора
			const rect = indicatorElement.getBoundingClientRect()
			const clickY = startClientY - rect.top
			const indicatorHeight = rect.height
			
			// Вычисляем процент от верха индикатора (0 = верх, 1 = низ)
			const clickPercent = Math.max(0, Math.min(1, clickY / indicatorHeight))
			
			// Получаем состояние скролла
			const scrollState = momentumScrollRef.value.getScrollState()
			const maxScroll = scrollState?.maxY ?? 0
			
			// Вычисляем целевую позицию скролла на основе процента клика
			const targetScroll = clickPercent * maxScroll
			
			// Выполняем плавный скролл с анимацией
			momentumScrollRef.value.scrollToAnimated(targetScroll, 0.3)
		})
	}
}

// Обработчик клика на level-indicator для скролла
function handleLevelIndicatorClick(e: MouseEvent) {
	if (!momentumScrollRef.value || !levelIndicatorRef.value) return
	if (levelIndicatorHasMoved) return // Если было движение, это не клик
	
	e.preventDefault()
	e.stopPropagation()
	
	// При клике на level-indicator__bar скроллим к низу сосуда,
	// чтобы пользователь мог увидеть место, где появляются новые блоки
	momentumScrollRef.value.scrollToBottomAnimated(1.0, 2000)
}

// Обработчики pointer событий для level-indicator__bar
function handleLevelIndicatorBarPointerDown(e: PointerEvent) {
	if (e.button !== 0 && e.pointerType === 'mouse') return
	
	const barElement = e.currentTarget as HTMLElement
	
	if (!momentumScrollRef.value) return
	
	// Завершаем предыдущий drag, если он был активен (на случай если предыдущий drag не завершился)
	if (levelIndicatorBarDragStarted && momentumScrollRef.value) {
		momentumScrollRef.value.endDrag()
	}
	
	// Захватываем pointer для отслеживания движения даже вне элемента
	barElement.setPointerCapture(e.pointerId)
	
	levelIndicatorBarPointerId = e.pointerId
	levelIndicatorBarStartY = e.clientY
	levelIndicatorBarLastY = e.clientY
	levelIndicatorBarStartClientY = e.clientY
	levelIndicatorBarElement = barElement
	levelIndicatorBarHasMoved = false
	levelIndicatorBarDragStarted = false
	
	// Вычисляем коэффициент масштабирования для преобразования движения мыши в скролл
	const scrollState = momentumScrollRef.value.getScrollState()
	const maxScroll = scrollState?.maxY ?? 0
	const barHeight = barElement.getBoundingClientRect().height
	
	if (barHeight > 0 && maxScroll > 0) {
		// Коэффициент показывает, сколько пикселей скролла соответствует одному пикселю движения мыши
		levelIndicatorBarScrollRatio = maxScroll / barHeight
	} else {
		levelIndicatorBarScrollRatio = 1
	}
	
	// Не вызываем preventDefault здесь, чтобы клик мог пройти дальше
}

function handleLevelIndicatorBarPointerMove(e: PointerEvent) {
	if (!momentumScrollRef.value || !levelIndicatorBarPointerId || levelIndicatorBarPointerId !== e.pointerId || !levelIndicatorBarElement) return
	
	// Всегда обновляем lastY для правильного расчета дельты
	const deltaY = levelIndicatorBarLastY - e.clientY
	levelIndicatorBarLastY = e.clientY
	
	const moved = Math.abs(e.clientY - levelIndicatorBarStartY)
	if (moved > 3) {
		// Если движение больше 3px, это drag - выполняем скролл
		levelIndicatorBarHasMoved = true
		e.preventDefault()
		e.stopPropagation()
		
		// Начинаем drag через ElasticScroll при первом движении
		if (!levelIndicatorBarDragStarted) {
			levelIndicatorBarDragStarted = true
			momentumScrollRef.value.updateBounds()
			momentumScrollRef.value.startDrag(performance.now())
		}
		
		// Преобразуем дельту движения мыши в дельту скролла
		const scrollDelta = deltaY * levelIndicatorBarScrollRatio
		
		// Используем метод drag для плавного скролла с инерцией
		momentumScrollRef.value.drag(scrollDelta, performance.now())
	}
}

function handleLevelIndicatorBarPointerUp(e: PointerEvent) {
	if (levelIndicatorBarPointerId !== e.pointerId || !levelIndicatorBarElement) return
	
	// Освобождаем захват pointer
	if (levelIndicatorBarElement.hasPointerCapture(e.pointerId)) {
		levelIndicatorBarElement.releasePointerCapture(e.pointerId)
	}
	
	// Сохраняем значения в локальные переменные перед nextTick
	const barElement = levelIndicatorBarElement
	const startClientY = levelIndicatorBarStartClientY
	const hasMoved = levelIndicatorBarHasMoved
	const dragStarted = levelIndicatorBarDragStarted
	
	// Завершаем drag через ElasticScroll, если он был начат
	if (dragStarted && momentumScrollRef.value) {
		momentumScrollRef.value.endDrag()
	}
	
	// Очищаем состояние сразу
	levelIndicatorBarPointerId = null
	levelIndicatorBarElement = null
	levelIndicatorBarHasMoved = false
	levelIndicatorBarDragStarted = false
	
	// Если движения не было, это клик - выполняем скролл
	if (!hasMoved) {
		e.preventDefault()
		e.stopPropagation()
		
		// Используем nextTick для гарантии, что ref инициализирован
		nextTick(() => {
			if (!momentumScrollRef.value) {
				console.warn('momentumScrollRef is still null after nextTick')
				return
			}
			
			// Обновляем границы скролла перед вычислением позиции
			momentumScrollRef.value.updateBounds()
			
			// Получаем позицию клика относительно бара (используем сохраненные координаты из pointerdown)
			const rect = barElement.getBoundingClientRect()
			const clickY = startClientY - rect.top
			const barHeight = rect.height
			
			// Вычисляем процент от верха бара (0 = верх, 1 = низ)
			const clickPercent = Math.max(0, Math.min(1, clickY / barHeight))
			
			// Получаем состояние скролла
			const scrollState = momentumScrollRef.value.getScrollState()
			const maxScroll = scrollState?.maxY ?? 0
			
			// Вычисляем целевую позицию скролла на основе процента клика
			const targetScroll = clickPercent * maxScroll
			
			// Выполняем плавный скролл с анимацией
			momentumScrollRef.value.scrollToAnimated(targetScroll, 0.3)
		})
	}
}

// Обработчики touch событий для level-indicator__bar
function handleLevelIndicatorBarTouchStart(e: TouchEvent) {
	if (!momentumScrollRef.value) return
	
	const touch = e.touches[0]
	if (!touch) return
	
	// Завершаем предыдущий drag, если он был активен (на случай если предыдущий drag не завершился)
	if (levelIndicatorBarDragStarted && momentumScrollRef.value) {
		momentumScrollRef.value.endDrag()
	}
	
	const barElement = e.currentTarget as HTMLElement
	
	levelIndicatorBarTouchId = touch.identifier
	levelIndicatorBarStartY = touch.clientY
	levelIndicatorBarLastY = touch.clientY
	levelIndicatorBarElement = barElement
	levelIndicatorBarHasMoved = false
	levelIndicatorBarDragStarted = false
	
	// Вычисляем коэффициент масштабирования для преобразования движения касания в скролл
	const scrollState = momentumScrollRef.value.getScrollState()
	const maxScroll = scrollState?.maxY ?? 0
	const barHeight = barElement.getBoundingClientRect().height
	
	if (barHeight > 0 && maxScroll > 0) {
		// Коэффициент показывает, сколько пикселей скролла соответствует одному пикселю движения касания
		levelIndicatorBarScrollRatio = maxScroll / barHeight
	} else {
		levelIndicatorBarScrollRatio = 1
	}
}

function handleLevelIndicatorBarTouchMove(e: TouchEvent) {
	if (!momentumScrollRef.value || !levelIndicatorBarTouchId || !levelIndicatorBarElement) return
	
	const touch = Array.from(e.touches).find(t => t.identifier === levelIndicatorBarTouchId)
	if (!touch) return
	
	// Всегда обновляем lastY для правильного расчета дельты
	const deltaY = levelIndicatorBarLastY - touch.clientY
	levelIndicatorBarLastY = touch.clientY
	
	const moved = Math.abs(touch.clientY - levelIndicatorBarStartY)
	if (moved > 3) {
		// Если движение больше 3px, это drag - выполняем скролл
		levelIndicatorBarHasMoved = true
		e.preventDefault()
		e.stopPropagation()
		
		// Начинаем drag через ElasticScroll при первом движении
		if (!levelIndicatorBarDragStarted) {
			levelIndicatorBarDragStarted = true
			momentumScrollRef.value.updateBounds()
			momentumScrollRef.value.startDrag(performance.now())
		}
		
		// Преобразуем дельту движения касания в дельту скролла
		const scrollDelta = deltaY * levelIndicatorBarScrollRatio
		
		// Используем метод drag для плавного скролла с инерцией
		momentumScrollRef.value.drag(scrollDelta, performance.now())
	}
}

function handleLevelIndicatorBarTouchEnd(e: TouchEvent) {
	if (!levelIndicatorBarElement) return
	
	const touch = e.changedTouches[0]
	if (!touch || touch.identifier !== levelIndicatorBarTouchId) return
	
	const moved = Math.abs(touch.clientY - levelIndicatorBarStartY)
	
	// Сохраняем значения в локальные переменные перед nextTick
	const barElement = levelIndicatorBarElement
	const startY = levelIndicatorBarStartY
	const hasMoved = levelIndicatorBarHasMoved
	const dragStarted = levelIndicatorBarDragStarted
	
	// Завершаем drag через ElasticScroll, если он был начат
	if (dragStarted && momentumScrollRef.value) {
		momentumScrollRef.value.endDrag()
	}
	
	// Очищаем состояние сразу
	levelIndicatorBarTouchId = null
	levelIndicatorBarElement = null
	levelIndicatorBarHasMoved = false
	levelIndicatorBarDragStarted = false
	
	// Если движения не было, это клик - вычисляем позицию скролла
	if (!hasMoved && moved <= 10) {
		e.preventDefault()
		e.stopPropagation()
		
		// Используем nextTick для гарантии, что ref инициализирован
		nextTick(() => {
			if (!momentumScrollRef.value) {
				console.warn('momentumScrollRef is still null after nextTick')
				return
			}
			
			// Обновляем границы скролла перед вычислением позиции
			momentumScrollRef.value.updateBounds()
			
			// Получаем позицию касания относительно бара (используем сохраненные координаты из touchstart)
			const rect = barElement.getBoundingClientRect()
			const touchY = startY - rect.top
			const barHeight = rect.height
			
			// Вычисляем процент от верха бара (0 = верх, 1 = низ)
			const touchPercent = Math.max(0, Math.min(1, touchY / barHeight))
			
			// Получаем состояние скролла
			const scrollState = momentumScrollRef.value.getScrollState()
			const maxScroll = scrollState?.maxY ?? 0
			
			// Вычисляем целевую позицию скролла на основе процента касания
			const targetScroll = touchPercent * maxScroll
			
			// Выполняем плавный скролл с анимацией
			momentumScrollRef.value.scrollToAnimated(targetScroll, 0.3)
		})
	}
}

function handleLevelIndicatorTouchStart(e: TouchEvent) {
	// Проверяем, что касание не на баре (бар обрабатывает свои события отдельно)
	const target = e.target as HTMLElement
	if (target.closest('.level-indicator__bar')) {
		return // Бар обрабатывает свои события отдельно
	}
	
	if (!levelIndicatorRef.value || !momentumScrollRef.value) return
	
	const touch = e.touches[0]
	if (!touch) return
	
	// Завершаем предыдущий drag, если он был активен (на случай если предыдущий drag не завершился)
	if (levelIndicatorDragStarted && momentumScrollRef.value) {
		momentumScrollRef.value.endDrag()
	}
	
	const indicatorElement = levelIndicatorRef.value
	
	levelIndicatorTouchId = touch.identifier
	levelIndicatorStartY = touch.clientY
	levelIndicatorLastY = touch.clientY
	levelIndicatorHasMoved = false
	levelIndicatorDragStarted = false
	
	// Вычисляем коэффициент масштабирования для преобразования движения касания в скролл
	const scrollState = momentumScrollRef.value.getScrollState()
	const maxScroll = scrollState?.maxY ?? 0
	const indicatorHeight = indicatorElement.getBoundingClientRect().height
	
	if (indicatorHeight > 0 && maxScroll > 0) {
		// Коэффициент показывает, сколько пикселей скролла соответствует одному пикселю движения касания
		levelIndicatorScrollRatio = maxScroll / indicatorHeight
	} else {
		levelIndicatorScrollRatio = 1
	}
	
	// Не вызываем preventDefault здесь, чтобы клик мог пройти дальше
}

function handleLevelIndicatorTouchMove(e: TouchEvent) {
	if (!momentumScrollRef.value || !levelIndicatorRef.value) return
	
	const touch = Array.from(e.touches).find(t => t.identifier === levelIndicatorTouchId)
	if (!touch) return
	
	// Всегда обновляем lastY для правильного расчета дельты
	const deltaY = levelIndicatorLastY - touch.clientY
	levelIndicatorLastY = touch.clientY
	
	const moved = Math.abs(touch.clientY - levelIndicatorStartY)
	if (moved > 3) {
		// Если движение больше 3px, это drag - выполняем скролл
		levelIndicatorHasMoved = true
		e.preventDefault()
		e.stopPropagation()
		
		// Начинаем drag через ElasticScroll при первом движении
		if (!levelIndicatorDragStarted) {
			levelIndicatorDragStarted = true
			momentumScrollRef.value.updateBounds()
			momentumScrollRef.value.startDrag(performance.now())
		}
		
		// Преобразуем дельту движения касания в дельту скролла
		const scrollDelta = deltaY * levelIndicatorScrollRatio
		
		// Используем метод drag для плавного скролла с инерцией
		momentumScrollRef.value.drag(scrollDelta, performance.now())
	}
}

function handleLevelIndicatorTouchEnd(e: TouchEvent) {
	if (!levelIndicatorRef.value) return
	
	const touch = e.changedTouches[0]
	if (!touch || touch.identifier !== levelIndicatorTouchId) return
	
	const moved = Math.abs(touch.clientY - levelIndicatorStartY)
	
	// Сохраняем значения в локальные переменные перед nextTick
	const indicatorElement = levelIndicatorRef.value
	const startY = levelIndicatorStartY
	const hasMoved = levelIndicatorHasMoved
	const dragStarted = levelIndicatorDragStarted
	
	// Завершаем drag через ElasticScroll, если он был начат
	if (dragStarted && momentumScrollRef.value) {
		momentumScrollRef.value.endDrag()
	}
	
	// Очищаем состояние сразу
	levelIndicatorTouchId = null
	levelIndicatorHasMoved = false
	levelIndicatorDragStarted = false
	
	// Если движения не было, это клик - вычисляем позицию скролла
	if (!hasMoved && moved <= 10) {
		e.preventDefault()
		e.stopPropagation()
		
		// Используем nextTick для гарантии, что ref инициализирован
		nextTick(() => {
			if (!momentumScrollRef.value) {
				console.warn('momentumScrollRef is still null after nextTick')
				return
			}
			
			// Обновляем границы скролла перед вычислением позиции
			momentumScrollRef.value.updateBounds()
			
			// Получаем позицию касания относительно индикатора
			const rect = indicatorElement.getBoundingClientRect()
			const touchY = startY - rect.top
			const indicatorHeight = rect.height
			
			// Вычисляем процент от верха индикатора (0 = верх, 1 = низ)
			const touchPercent = Math.max(0, Math.min(1, touchY / indicatorHeight))
			
			// Получаем состояние скролла
			const scrollState = momentumScrollRef.value.getScrollState()
			const maxScroll = scrollState?.maxY ?? 0
			
			// Вычисляем целевую позицию скролла на основе процента касания
			const targetScroll = touchPercent * maxScroll
			
			// Выполняем плавный скролл с анимацией
			momentumScrollRef.value.scrollToAnimated(targetScroll, 0.3)
		})
	}
}

let gameController: GameController | null = null
let renderer: GameRenderer | null = null
let resizeHandler: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null
let orientationHandler: (() => void) | null = null
let orientationListener: { remove: () => void } | null = null
let resizeTimeout: ReturnType<typeof setTimeout> | null = null
let pointerMoveHandler: ((e: PointerEvent) => void) | null = null
let touchMoveHandler: ((e: TouchEvent) => void) | null = null
// Кэш для getBoundingClientRect контейнера (используется только в initCanvas)
let cachedContainerRect: DOMRect | null = null

// Drag state for input handling
let dragStart: { r: number; c: number } | null = null
let dragStartClient: { x: number; y: number } | null = null
// First block selected by click (for swap on second click)
let selectedForSwap: { r: number; c: number } | null = null
let isDragging = false
// Защита от двойной обработки событий на мобильных устройствах
let lastEventTime = 0
let lastEventType: string | null = null

// Состояние для drag scrolling на canvas
let canvasDragStartTime = 0 // Время начала касания на canvas
let canvasDragScrolling = false // Флаг активации drag scrolling вместо обработки игры
let canvasDragStartedOnBlock = false // Флаг: было ли начальное касание на плитке (блоке)
const CANVAS_PRESS_DELAY_EMPTY = 140 // ms - время удержания для активации drag scrolling на пустом месте
const CANVAS_PRESS_DELAY_BLOCK = 300 // ms - время удержания для активации drag scrolling на плитке (больше, чтобы дать время для быстрого свайпа)
const CANVAS_PRESS_MOVE_TOLERANCE = 6 // px - порог движения для ранней активации

const formattedTime = computed(() => {
	const time = Math.max(0, Math.floor(gameStore.remainingTime))
	const seconds = time % 60
	return `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})

const gridHeight = computed(() => gameStore.grid?.length ?? gameStore.getHeight())
// Индикатор «сколько рядов до верха сосуда»: верхняя занятая строка (0 = у края, game over)
const topmostRow = computed(() => {
	const g = gameStore.grid
	const h = gridHeight.value
	if (!g?.length) return h
	for (let r = 0; r < h; r++) {
		for (let c = 0; c < WIDTH; c++) {
			if (g[r]?.[c]) return r
		}
	}
	return h
})
const rowsToTop = computed(() => topmostRow.value)
const levelFillPercent = computed(() => {
	const h = gridHeight.value
	return h > 0 ? Math.round(((h - topmostRow.value) / h) * 100) : 0
})
const levelBarColor = computed(() => {
	const p = levelFillPercent.value
	if (p >= 80) return 'rgb(239, 68, 68)' // red
	if (p >= 50) return 'rgb(250, 204, 21)' // amber
	return 'rgb(74, 222, 128)' // green
})

/** При расширении сосуда: только переразмер канваса и Pixi. Скролл (updateBounds, scrollToBottom) — в MomentumScroll по ResizeObserver. */
async function handleVesselExpanded(): Promise<void> {
	if (!renderer || !canvas.value) return
	initCanvas()
	
	// Получаем актуальную высоту grid для правильного расчета позиций
	const gridHeight = gameStore.grid?.length ?? gameStore.getHeight()
	
	// Обновляем размер плитки в renderer (на случай если ширина контейнера изменилась)
	const container = canvas.value.parentElement
	// Инвалидируем кэш перед получением новых размеров
	cachedContainerRect = null
	const containerWidth = (container?.getBoundingClientRect().width ?? parseInt(canvas.value.style.width)) || 320
	const newTileSize = Math.max(containerWidth, 320) / WIDTH
	
	// Получаем логические размеры из CSS стилей (не внутренние размеры canvas!)
	const logicalWidth = parseInt(canvas.value.style.width) || containerWidth
	const logicalHeight = parseInt(canvas.value.style.height) || (gridHeight * newTileSize)
	
	// forceUpdatePositions = true гарантирует, что все позиции будут пересчитаны даже если tileSize не изменился
	// Передаем gridHeight для правильного расчета позиций снизу
	// Это важно при расширении сосуда, когда canvas становится выше, но tileSize остается тем же
	renderer.updateTileSize(newTileSize, true, gridHeight)
	
	// Передаем логические размеры для правильного расчета позиций при изменении размера canvas
	renderer.resizeCanvas(logicalWidth, logicalHeight, gridHeight)
	// Синхронизируем позиции блоков после изменения размера canvas
	// forceUpdate = true гарантирует, что все позиции будут пересчитаны даже если индексы не изменились
	// Это важно при расширении сосуда, когда canvas становится выше
	await renderer.syncGridPositions(gameStore.grid, true)
}

function initCanvas(): void {
	if (!canvas.value) return

	const container = canvas.value.parentElement
	if (!container) return

	// Принудительно используем полную ширину контейнера для 8 кубиков
	// Получаем актуальные размеры контейнера
	const containerRect = container.getBoundingClientRect()
	cachedContainerRect = containerRect
	const maxWidth = Math.max(containerRect.width, 320) // Минимум 320px для мобильных
	// Используем фактическую высоту grid, а не gameStore.getHeight()
	// Это важно, чтобы высота канваса всегда соответствовала фактической высоте grid
	const h = gameStore.grid?.length ?? gameStore.getHeight()

	// Всегда делим на WIDTH (8) для получения размера плитки
	const tileSize = maxWidth / WIDTH
	const canvasHeight = h * tileSize

	// Устанавливаем CSS размеры (логические пиксели)
	// Это важно для правильного отображения на мобильных устройствах
	canvas.value.style.width = `${maxWidth}px`
	canvas.value.style.height = `${canvasHeight}px`
	canvas.value.style.display = 'block'
	
	// НЕ устанавливаем внутренние размеры canvas вручную!
	// PixiJS с autoDensity: true сам управляет внутренними размерами
	// на основе CSS размеров и devicePixelRatio
	// Установка внутренних размеров вручную может вызвать проблемы на Android
}

function getPositionFromEvent(e: MouseEvent | TouchEvent | PointerEvent): { r: number; c: number } | null {
	if (!canvas.value || !renderer) return null

	// Получаем координаты в зависимости от типа события
	let clientX: number
	let clientY: number
	
	if (e instanceof PointerEvent) {
		clientX = e.clientX
		clientY = e.clientY
	} else if ('touches' in e && e.touches.length > 0) {
		clientX = e.touches[0].clientX
		clientY = e.touches[0].clientY
	} else if ('changedTouches' in e && e.changedTouches.length > 0) {
		// Для touchend используем changedTouches
		clientX = e.changedTouches[0].clientX
		clientY = e.changedTouches[0].clientY
	} else {
		clientX = (e as MouseEvent).clientX
		clientY = (e as MouseEvent).clientY
	}

	// Получаем bounding rect для расчета относительных координат
	const rect = canvas.value.getBoundingClientRect()
	
	// Координаты относительно canvas (getBoundingClientRect учитывает все трансформации и скролл)
	const x = clientX - rect.left
	const y = clientY - rect.top

	// Используем размеры экрана из PixiJS для точного расчета координат
	// Это важно на Android, где могут быть проблемы с devicePixelRatio
	const screenSize = renderer.getScreenSize()
	if (!screenSize) return null
	
	// Масштабируем координаты с учетом реальных размеров canvas на экране
	// и логических размеров в PixiJS
	const scaleX = screenSize.width / rect.width
	const scaleY = screenSize.height / rect.height
	
	const canvasX = x * scaleX
	const canvasY = y * scaleY
	
	// Используем tileSize из renderer для точного расчета позиции
	const tileSize = screenSize.width / WIDTH
	
	const c = Math.floor(canvasX / tileSize)
	const r = Math.floor(canvasY / tileSize)
	
	// Используем фактическую высоту grid для проверки границ
	const h = gameStore.grid?.length ?? gameStore.getHeight()

	if (r >= 0 && r < h && c >= 0 && c < WIDTH) {
		return { r, c }
	}

	return null
}

function handlePointerDown(e: MouseEvent | TouchEvent | PointerEvent): void {
	if (gameStore.isLocked || gameStore.isGameOver) return

	// Защита от двойной обработки событий на мобильных устройствах
	// На мобильных устройствах pointerdown и touchstart могут срабатывать одновременно
	const eventType = e instanceof TouchEvent ? 'touch' : e instanceof PointerEvent ? 'pointer' : 'mouse'
	const now = Date.now()
	if (now - lastEventTime < 50 && lastEventType !== eventType) {
		// Игнорируем событие, если недавно было обработано событие другого типа
		return
	}
	lastEventTime = now
	lastEventType = eventType

	// Unlock audio context on first interaction (iOS/Android)
	AudioManager.unlock()

	// Предотвращаем скролл при взаимодействии с canvas
	if (e instanceof PointerEvent) {
		e.preventDefault()
		e.stopPropagation()
		// Захватываем pointer для отслеживания движения
		if (canvas.value && e.pointerId !== undefined) {
			canvas.value.setPointerCapture(e.pointerId)
		}
	} else if (e instanceof TouchEvent) {
		// Для touch событий также предотвращаем скролл
		e.preventDefault()
		e.stopPropagation()
	} else if (e instanceof MouseEvent) {
		e.stopPropagation()
	}

	// Сохраняем начальные координаты клиента для определения свайпа
	let clientX: number
	let clientY: number
	if (e instanceof PointerEvent) {
		clientX = e.clientX
		clientY = e.clientY
	} else if ('touches' in e && e.touches.length > 0) {
		clientX = e.touches[0].clientX
		clientY = e.touches[0].clientY
	} else {
		clientX = (e as MouseEvent).clientX
		clientY = (e as MouseEvent).clientY
	}
	dragStartClient = { x: clientX, y: clientY }
	isDragging = false
	canvasDragScrolling = false
	canvasDragStartedOnBlock = false // Сбрасываем флаг
	canvasDragStartTime = performance.now() // Запоминаем время начала касания

	const pos = getPositionFromEvent(e)
	if (pos) {
		dragStart = pos
		// Определяем, было ли касание на плитке (блоке) или на пустом месте
		canvasDragStartedOnBlock = !!gameStore.grid[pos.r]?.[pos.c]
		// Highlight selected tile
		if (gameStore.grid[pos.r]?.[pos.c]) {
			renderer?.setSelectedPosition(pos.r, pos.c)
		} else {
			renderer?.setSelectedPosition(null, null)
		}
	} else {
		// Касание вне canvas или вне границ - считаем пустым местом
		canvasDragStartedOnBlock = false
	}
}

function handlePointerUp(e: MouseEvent | TouchEvent | PointerEvent): void {
	// Если был активирован drag scrolling, завершаем его
	const wasDragScrolling = canvasDragScrolling
	if (canvasDragScrolling && momentumScrollRef.value) {
		momentumScrollRef.value.endDrag()
		canvasDragScrolling = false
	}
	
	// Освобождаем pointer, если был захвачен
	if (e instanceof PointerEvent && canvas.value && e.pointerId !== undefined) {
		if (canvas.value.hasPointerCapture(e.pointerId)) {
			canvas.value.releasePointerCapture(e.pointerId)
		}
	}
	
	if (!dragStart || gameStore.isLocked || gameStore.isGameOver) {
		dragStart = null
		dragStartClient = null
		isDragging = false
		canvasDragStartTime = 0
		canvasDragStartedOnBlock = false
		return
	}

	// Предотвращаем скролл при взаимодействии с canvas (только если не был drag scrolling)
	if (!wasDragScrolling) {
		if (e instanceof PointerEvent) {
			e.preventDefault()
			e.stopPropagation()
		} else if (e instanceof TouchEvent) {
			// Для touch событий также предотвращаем скролл
			e.preventDefault()
			e.stopPropagation()
		} else if (e instanceof MouseEvent) {
			e.stopPropagation()
		}
	}

	// Если был активирован drag scrolling, не обрабатываем события игры
	if (canvasDragScrolling) {
		dragStart = null
		dragStartClient = null
		isDragging = false
		canvasDragScrolling = false
		canvasDragStartTime = 0
		canvasDragStartedOnBlock = false
		renderer?.setSelectedPosition(null, null)
		return
	}

	const pos = getPositionFromEvent(e)
	if (!pos) {
		dragStart = null
		dragStartClient = null
		selectedForSwap = null
		isDragging = false
		canvasDragStartTime = 0
		canvasDragStartedOnBlock = false
		renderer?.setSelectedPosition(null, null)
		return
	}

	// Determine action
	const dr = pos.r - dragStart.r
	const dc = pos.c - dragStart.c

	// Если был свайп (isDragging = true), обрабатываем его
	if (isDragging) {
		// Check if adjacent
		const isAdjacent = (Math.abs(dr) === 1 && dc === 0) || (dr === 0 && Math.abs(dc) === 1)

		if (isAdjacent) {
			// Check if target has cube for swap, or empty for slide
			const targetCube = gameStore.grid[pos.r]?.[pos.c]
			const fromCube = gameStore.grid[dragStart.r]?.[dragStart.c]

			if (targetCube && fromCube) {
				// Both have cubes - swap
				gameController?.applyUserAction('swap', dragStart, pos)
			} else if (!targetCube && fromCube && Math.abs(dc) === 1 && dr === 0) {
				// Target empty and horizontal move - slide
				gameController?.applyUserAction('slide', dragStart, pos)
			}
		}

		// Clear selection after move (swipe)
		selectedForSwap = null
		renderer?.setSelectedPosition(null, null)
		dragStart = null
		dragStartClient = null
		isDragging = false
		canvasDragStartTime = 0
		canvasDragStartedOnBlock = false
		return
	}

	if (dr === 0 && dc === 0 && !isDragging) {
		// Click without drag — support swap by two clicks: first select, second click on adjacent to swap
		const fromCube = gameStore.grid[pos.r]?.[pos.c]
		if (!fromCube) {
			selectedForSwap = null
			renderer?.setSelectedPosition(null, null)
			dragStart = null
			return
		}
		if (!selectedForSwap) {
			// First click: select this block
			selectedForSwap = { r: pos.r, c: pos.c }
			renderer?.setSelectedPosition(pos.r, pos.c)
			dragStart = null
			return
		}
		if (selectedForSwap.r === pos.r && selectedForSwap.c === pos.c) {
			// Click same block again — deselect
			selectedForSwap = null
			renderer?.setSelectedPosition(null, null)
			dragStart = null
			return
		}
		// Second click on another block
		const adjR = Math.abs(pos.r - selectedForSwap.r) === 1 && pos.c === selectedForSwap.c
		const adjC = pos.r === selectedForSwap.r && Math.abs(pos.c - selectedForSwap.c) === 1
		const isAdjacentClick = adjR || adjC
		const targetCube = gameStore.grid[pos.r]?.[pos.c]
		const fromCubeSel = gameStore.grid[selectedForSwap.r]?.[selectedForSwap.c]
		if (isAdjacentClick && targetCube && fromCubeSel) {
			gameController?.applyUserAction('swap', selectedForSwap, pos)
			selectedForSwap = null
			renderer?.setSelectedPosition(null, null)
			dragStart = null
			return
		}
		if (isAdjacentClick && !targetCube && fromCubeSel && Math.abs(pos.c - selectedForSwap.c) === 1 && pos.r === selectedForSwap.r) {
			// Horizontal slide into empty
			gameController?.applyUserAction('slide', selectedForSwap, pos)
			selectedForSwap = null
			renderer?.setSelectedPosition(null, null)
			dragStart = null
			return
		}
		// Not adjacent or invalid: select the clicked block as new first selection
		selectedForSwap = { r: pos.r, c: pos.c }
		renderer?.setSelectedPosition(pos.r, pos.c)
		dragStart = null
		dragStartClient = null
		isDragging = false
		return
	}

	// Если это был клик без движения, но не свайп
	if (!isDragging) {
		// Clear selection after click
		selectedForSwap = null
		renderer?.setSelectedPosition(null, null)
		dragStart = null
		dragStartClient = null
	}
	
	// Очищаем состояние drag scrolling
	canvasDragStartTime = 0
	canvasDragScrolling = false
	canvasDragStartedOnBlock = false
}

onMounted(async () => {
	// Удаляем кэширование getBoundingClientRect, так как теперь всегда используем актуальные значения
	// Это гарантирует правильную работу на мобильных устройствах
	
	setTimeout(async () => {
		// Initialize AudioManager
		await AudioManager.init()

		if (!canvas.value) return

		// Инициализируем canvas с правильными размерами
		initCanvas()
		
		// Убеждаемся, что canvas имеет правильную ширину
		await nextTick()
		await new Promise((resolve) => requestAnimationFrame(resolve))

		// Create renderer с правильным tileSize (всегда ширина / 8)
		const container = canvas.value.parentElement
		// Используем кэшированное значение из initCanvas
		const containerWidth = cachedContainerRect?.width ?? container?.getBoundingClientRect().width ?? canvas.value.width
		const tileSize = Math.max(containerWidth, 320) / WIDTH // Минимум 320px для мобильных
		
		renderer = new GameRenderer({
			canvas: canvas.value,
			tileSize,
		})

		await renderer.init()
		
		// После инициализации PixiJS нужно убедиться, что размеры canvas правильные
		// Получаем актуальные размеры из CSS (они уже установлены в initCanvas)
		const gridHeight = gameStore.grid?.length ?? gameStore.getHeight()
		
		const canvasWidth = parseInt(canvas.value.style.width) || containerWidth
		const canvasHeight = parseInt(canvas.value.style.height) || (gridHeight * tileSize)
		// Обновляем размеры через renderer, чтобы PixiJS правильно их обработал
		renderer.resizeCanvas(canvasWidth, canvasHeight, gridHeight)

		// Create game controller
		gameController = new GameController(renderer, { onVesselExpanded: handleVesselExpanded })

		// Set initial scroll position to top
		momentumScrollRef.value?.scrollToTop()

		// Start game
		await gameController.startGame()

		// Setup input handlers
		// Используем pointer events с preventDefault для предотвращения скролла
		canvas.value.addEventListener('pointerdown', handlePointerDown, { passive: false })
		canvas.value.addEventListener('pointerup', handlePointerUp, { passive: false })
		canvas.value.addEventListener('pointercancel', handlePointerUp, { passive: false })
		
		// Обработчик для pointermove - отслеживаем свайп
		pointerMoveHandler = (e: PointerEvent) => {
			if (!dragStart || !dragStartClient || gameStore.isLocked || gameStore.isGameOver) {
				return
			}

			// Проверяем, было ли движение достаточно большим
			const dx = Math.abs(e.clientX - dragStartClient.x)
			const dy = Math.abs(e.clientY - dragStartClient.y)
			const threshold = 10 // Порог в пикселях для определения свайпа
			const moved = Math.sqrt(dx * dx + dy * dy)
			
			// Определяем задержку в зависимости от того, было ли начальное касание на блоке
			const pressDelay = canvasDragStartedOnBlock ? CANVAS_PRESS_DELAY_BLOCK : CANVAS_PRESS_DELAY_EMPTY
			
			// Определяем, было ли движение быстрым (произошло до истечения pressDelay)
			const elapsedTime = performance.now() - canvasDragStartTime
			const isFastSwipe = elapsedTime < pressDelay

			// Если движение достаточно большое
			if (moved > threshold || moved > CANVAS_PRESS_MOVE_TOLERANCE) {
				// Если движение быстрое - обрабатываем как игру (свайп блоков)
				// Но только если касание было на блоке - на пустом месте быстрый свайп тоже может быть скроллом
				if (isFastSwipe && !canvasDragScrolling && canvasDragStartedOnBlock) {
					isDragging = true
					
					// Предотвращаем скролл при движении по canvas
					e.preventDefault()
					e.stopPropagation()
					
					// Обновляем выделение при движении
					const pos = getPositionFromEvent(e)
					if (pos) {
						// Highlight tile under pointer
						if (gameStore.grid[pos.r]?.[pos.c]) {
							renderer?.setSelectedPosition(pos.r, pos.c)
						} else {
							renderer?.setSelectedPosition(dragStart.r, dragStart.c)
						}
					}
				} else {
					// Долгое удержание + движение - активируем drag scrolling
					if (!canvasDragScrolling && momentumScrollRef.value) {
						canvasDragScrolling = true
						momentumScrollRef.value.updateBounds()
						momentumScrollRef.value.startDrag(performance.now())
					}
					
					if (canvasDragScrolling && momentumScrollRef.value) {
						// Предотвращаем скролл и обрабатываем drag scrolling
						e.preventDefault()
						e.stopPropagation()
						
						const deltaY = dragStartClient.y - e.clientY
						momentumScrollRef.value.drag(deltaY, performance.now())
						// Обновляем dragStartClient для следующего движения
						dragStartClient.y = e.clientY
					}
				}
			}
		}
		canvas.value.addEventListener('pointermove', pointerMoveHandler, { passive: false })
		
		// Touch events для мобильных устройств
		canvas.value.addEventListener('touchstart', handlePointerDown, { passive: false })
		canvas.value.addEventListener('touchend', handlePointerUp, { passive: false })
		canvas.value.addEventListener('touchcancel', handlePointerUp, { passive: false })
		
		// Обработчик для touchmove - отслеживаем свайп
		touchMoveHandler = (e: TouchEvent) => {
			if (!dragStart || !dragStartClient || gameStore.isLocked || gameStore.isGameOver) {
				return
			}

			if (e.touches.length > 0) {
				const touch = e.touches[0]
				// Проверяем, было ли движение достаточно большим
				const dx = Math.abs(touch.clientX - dragStartClient!.x)
				const dy = Math.abs(touch.clientY - dragStartClient!.y)
				const threshold = 10 // Порог в пикселях для определения свайпа
				const moved = Math.sqrt(dx * dx + dy * dy)
				
				// Определяем задержку в зависимости от того, было ли начальное касание на блоке
				const pressDelay = canvasDragStartedOnBlock ? CANVAS_PRESS_DELAY_BLOCK : CANVAS_PRESS_DELAY_EMPTY
				
				// Определяем, было ли движение быстрым (произошло до истечения pressDelay)
				const elapsedTime = performance.now() - canvasDragStartTime
				const isFastSwipe = elapsedTime < pressDelay

				// Если движение достаточно большое
				if (moved > threshold || moved > CANVAS_PRESS_MOVE_TOLERANCE) {
					// Если движение быстрое - обрабатываем как игру (свайп блоков)
					// Но только если касание было на блоке - на пустом месте быстрый свайп тоже может быть скроллом
					if (isFastSwipe && !canvasDragScrolling && canvasDragStartedOnBlock) {
						isDragging = true
						
						// Предотвращаем скролл при движении по canvas
						e.preventDefault()
						e.stopPropagation()
						
						// Обновляем выделение при движении
						const pos = getPositionFromEvent(e)
						if (pos) {
							// Highlight tile under pointer
							if (gameStore.grid[pos.r]?.[pos.c]) {
								renderer?.setSelectedPosition(pos.r, pos.c)
							} else {
								renderer?.setSelectedPosition(dragStart.r, dragStart.c)
							}
						}
					} else {
						// Долгое удержание + движение - активируем drag scrolling
						if (!canvasDragScrolling && momentumScrollRef.value) {
							canvasDragScrolling = true
							momentumScrollRef.value.updateBounds()
							momentumScrollRef.value.startDrag(performance.now())
						}
						
						if (canvasDragScrolling && momentumScrollRef.value) {
							// Предотвращаем скролл и обрабатываем drag scrolling
							e.preventDefault()
							e.stopPropagation()
							
							const deltaY = dragStartClient.y - touch.clientY
							momentumScrollRef.value.drag(deltaY, performance.now())
							// Обновляем dragStartClient для следующего движения
							dragStartClient.y = touch.clientY
						}
					}
				}
			}
		}
		canvas.value.addEventListener('touchmove', touchMoveHandler, { passive: false })

		// Wait for canvas to render
		await nextTick()
		await new Promise((resolve) => requestAnimationFrame(resolve))
		await new Promise((resolve) => requestAnimationFrame(resolve))
		await new Promise((resolve) => requestAnimationFrame(resolve))

		// Update scroll bounds
		momentumScrollRef.value?.updateBounds()

		// Animate scroll to bottom
		await momentumScrollRef.value?.scrollToBottomAnimated(1.5, 3000)

		// Handle resize - функция для обновления размера с debounce
		const handleResize = async () => {
			if (!canvas.value) return
			
			// Debounce: отменяем предыдущий вызов, если он еще не выполнился
			if (resizeTimeout) {
				clearTimeout(resizeTimeout)
			}
			
			resizeTimeout = setTimeout(async () => {
				if (!canvas.value) return
				
				// Инвалидируем кэш перед изменением размеров
				cachedContainerRect = null
				
				// Для мобильных устройств нужно дать время браузеру обновить размеры после изменения ориентации
				// Используем requestAnimationFrame для получения актуальных размеров
				await new Promise((resolve) => requestAnimationFrame(resolve))
				await new Promise((resolve) => requestAnimationFrame(resolve))
				await new Promise((resolve) => setTimeout(resolve, 50))
				
				// Пересчитываем canvas с правильной шириной
				initCanvas()
				
				// Получаем логические размеры из CSS стилей (не внутренние размеры canvas!)
				const logicalWidth = parseInt(canvas.value.style.width) || canvas.value.getBoundingClientRect().width
				const logicalHeight = parseInt(canvas.value.style.height) || canvas.value.getBoundingClientRect().height
				const gridHeight = gameStore.grid?.length ?? gameStore.getHeight()
				
				// Всегда используем логическую ширину / WIDTH для размера плитки
				const newTileSize = logicalWidth / WIDTH
				if (renderer && newTileSize > 0) {
					renderer.updateTileSize(newTileSize)
					renderer.resizeCanvas(logicalWidth, logicalHeight, gridHeight)
					// Синхронизировать позиции после изменения размера
					await renderer.syncGridPositions(gameStore.grid)
				}
				momentumScrollRef.value?.updateBounds()
			}, 150)
		}

		// Обработчик для window resize
		resizeHandler = handleResize
		window.addEventListener('resize', resizeHandler, { passive: true })

		// Обработчик для изменения ориентации (важно для мобильных)
		orientationHandler = handleResize
		window.addEventListener('orientationchange', orientationHandler, { passive: true })
		
		// Блокируем альбомный режим на мобильных устройствах
		if (Capacitor.isNativePlatform()) {
			// Блокируем ориентацию в портретном режиме
			ScreenOrientation.lock({ orientation: 'portrait' }).catch((err) => {
				console.warn('Failed to lock orientation:', err)
			})
			
			// Слушаем изменения ориентации
			ScreenOrientation.addListener('screenOrientationChange', () => {
				handleResize()
			}).then((listener) => {
				orientationListener = listener
			})
		}
		
		// Также используем ResizeObserver для контейнера canvas (более надежно на мобильных)
		const canvasContainer = canvas.value.parentElement
		if (canvasContainer) {
			resizeObserver = new ResizeObserver(() => {
				handleResize()
			})
			resizeObserver.observe(canvasContainer)
		}
	}, 100)
})

onBeforeUnmount(() => {
	// Очищаем таймеры play-area
	clearPlayAreaPressTimer()
	
	// Разблокируем ориентацию при размонтировании
	if (Capacitor.isNativePlatform()) {
		ScreenOrientation.unlock().catch((err) => {
			console.warn('Failed to unlock orientation:', err)
		})
	}
	
	if (resizeHandler) {
		window.removeEventListener('resize', resizeHandler)
		resizeHandler = null
	}
	if (orientationHandler) {
		window.removeEventListener('orientationchange', orientationHandler)
		orientationHandler = null
	}
	if (orientationListener) {
		orientationListener.remove()
		orientationListener = null
	}
	if (resizeObserver) {
		resizeObserver.disconnect()
		resizeObserver = null
	}
	if (resizeTimeout) {
		clearTimeout(resizeTimeout)
		resizeTimeout = null
	}

	if (canvas.value) {
		canvas.value.removeEventListener('pointerdown', handlePointerDown)
		canvas.value.removeEventListener('pointerup', handlePointerUp)
		canvas.value.removeEventListener('pointercancel', handlePointerUp)
		if (pointerMoveHandler) {
			canvas.value.removeEventListener('pointermove', pointerMoveHandler)
		}
		canvas.value.removeEventListener('touchstart', handlePointerDown)
		canvas.value.removeEventListener('touchend', handlePointerUp)
		canvas.value.removeEventListener('touchcancel', handlePointerUp)
		if (touchMoveHandler) {
			canvas.value.removeEventListener('touchmove', touchMoveHandler)
		}
	}

	gameController?.destroy()
	gameController = null
	renderer = null
})

function showExitDialog(): void {
	isExitDialogOpen.value = true
}

function handleExit(): void {
	router.push('/')
}

function restart(): void {
	selectedForSwap = null
	dragStart = null
	dragStartClient = null
	isDragging = false
	canvasDragStartTime = 0
	canvasDragScrolling = false
	canvasDragStartedOnBlock = false
	renderer?.setSelectedPosition(null, null)
	if (gameController) {
		gameController.stop()
		gameController.startGame()
	}
}
</script>

<style lang="scss" scoped>
:deep(.app-layout) {
	background: transparent;
}

.game-page {
	flex: 1;
	display: flex;
	flex-direction: column;
	padding: 1rem clamp(0.5rem, 2vw, 1rem) 1rem clamp(0.5rem, 2vw, 2rem);
	padding-top: max(1rem, env(safe-area-inset-top, 0px));
	padding-bottom: max(1rem, env(safe-area-inset-bottom, 0px));
	gap: 1rem;
	position: relative;
	overflow: hidden;
	min-height: 0; // Важно для flex-контейнеров, чтобы они правильно ограничивали высоту

	@media (max-width: 640px) {
		padding-left: clamp(0.5rem, 1.5vw, 0.75rem);
		padding-right: clamp(0.5rem, 1.5vw, 0.75rem);
	}

	&__play-area {
		display: flex;
		align-items: stretch;
		gap: 0.5rem;
		flex: 1;
		min-height: 0; // Важно для flex-контейнеров, чтобы они правильно ограничивали высоту
		overflow: hidden; // Предотвращаем выход контента за пределы
	}

	&__scroll-container {
		flex: 1;
		min-height: 400px;
		backdrop-filter: blur(20px);
		box-shadow: inset 0 4px 32px rgba(0, 0, 0, 0.5),
			0 8px 32px rgba(0, 0, 0, 0.3);
		border: 2px solid rgba(255, 255, 255, 0.3);
		position: relative;
		z-index: 1;
		flex-grow: 1;
	}

	&__canvas-container {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		width: 100%;
		/* Предотвращаем растяжение canvas */
		min-width: 0;
		overflow: hidden;
	}
}

.level-indicator {
	display: flex;
	flex-direction: column;
	align-items: center;
	width: 1.25rem;
	flex-shrink: 0;
	gap: 0.25rem;
	// Позволяем скроллить через индикатор
	cursor: grab;
	
	&:active {
		cursor: grabbing;
	}

	&__label {
		font-size: 0.7rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.95);
		background: linear-gradient(
			135deg,
			rgba(102, 126, 234, 0.5) 0%,
			rgba(118, 75, 162, 0.5) 100%
		);
		backdrop-filter: blur(8px);
		border-radius: 6px;
		padding: 0.15rem 0.35rem;
		line-height: 1;
		border: 1px solid rgba(255, 255, 255, 0.25);
	}

	&__bar {
		flex: 1;
		width: 100%;
		min-height: 60px;
		background: rgba(0, 0, 0, 0.4);
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		position: relative;
		overflow: hidden;
	}

	&__fill {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		border-radius: 0 0 5px 5px;
		transition: height 0.25s ease, background-color 0.2s ease;
	}
}

.game-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	width: 100%;
	gap: 1rem;
	/* Убираем flex-wrap, чтобы элементы не переносились на новую строку */
	flex-wrap: nowrap;
	/* Оптимизация для предотвращения пересчета layout при изменении размеров canvas */
	will-change: contents;
	contain: layout style;
	/* Минимальная ширина для предотвращения сжатия */
	min-width: 0;

	&__time,
	&__score,
	&__wave {
		font-size: clamp(0.875rem, 3vw, 1rem);
		font-weight: 700;
		color: white;
		padding: 0.5rem 1rem;
		background: linear-gradient(
			135deg,
			rgba(102, 126, 234, 0.4) 0%,
			rgba(118, 75, 162, 0.4) 100%
		);
		backdrop-filter: blur(10px);
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.3);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
		white-space: nowrap;
		/* Оптимизация для предотвращения пересчета layout */
		flex-shrink: 0;
		flex-grow: 0;
		/* Минимальная ширина для предотвращения сжатия */
		min-width: fit-content;
		will-change: transform;
		/* Изоляция от изменений layout родителя */
		contain: layout style paint;
	}
}

.game-canvas {
	/* Размеры устанавливаются через JavaScript для точного контроля */
	width: 100% !important;
	height: auto !important;
	max-width: 100%;
	display: block;
	background: rgba(0, 0, 0, 0.3);
	image-rendering: -webkit-optimize-contrast;
	image-rendering: crisp-edges;
	touch-action: manipulation;
	-webkit-tap-highlight-color: transparent;
	/* Предотвращаем изменение размера при изменении ориентации */
	box-sizing: border-box;
	/* Предотвращаем растяжение на мобильных устройствах */
	object-fit: contain;
	flex-shrink: 0;
}

.game-overlay {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.75);
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 10;
	animation: game-overlay-fade 0.35s ease-out;

	&__content {
		background: linear-gradient(
			145deg,
			rgba(30, 31, 58, 0.95) 0%,
			rgba(43, 47, 108, 0.9) 50%,
			rgba(30, 31, 58, 0.95) 100%
		);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		padding: clamp(2rem, 5vw, 2.75rem) clamp(2rem, 5vw, 3rem);
		border-radius: 28px;
		max-width: min(500px, 80vw);
		width: 70%;
		text-align: center;
		color: white;
		border: 2px solid rgba(255, 255, 255, 0.15);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.12),
			0 0 0 1px rgba(139, 92, 246, 0.2),
			0 24px 48px rgba(0, 0, 0, 0.5),
			0 0 80px rgba(139, 92, 246, 0.15);
		animation: game-overlay-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both;
	}

	&__icon {
		width: 64px;
		height: 64px;
		margin: 0 auto 1.15rem;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.65rem;
		font-weight: 700;
		color: rgba(248, 113, 113, 0.95);
		background: rgba(248, 113, 113, 0.15);
		border-radius: 50%;
		border: 2px solid rgba(248, 113, 113, 0.35);
		box-shadow: 0 0 24px rgba(248, 113, 113, 0.2);
	}

	&__title {
		margin: 0 0 0.9rem;
		font-size: clamp(1.9rem, 5.5vw, 2.5rem);
		font-weight: 800;
		letter-spacing: -0.02em;
		background: linear-gradient(135deg, #f8f4ff 0%, #e9e0ff 50%, #c4b5fd 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		text-shadow: none;
	}

	&__score {
		margin: 0 0 2rem;
		font-size: 1.25rem;
		color: rgba(255, 255, 255, 0.85);
		line-height: 1.5;

		strong {
			font-size: 1.65rem;
			font-weight: 800;
			color: #c4b5fd;
			text-shadow: 0 0 20px rgba(196, 181, 253, 0.5);
		}
	}
}

@keyframes game-overlay-fade {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

@keyframes game-overlay-pop {
	from {
		opacity: 0;
		transform: scale(0.85) translateY(10px);
	}
	to {
		opacity: 1;
		transform: scale(1) translateY(0);
	}
}

.btn--back {
	padding: clamp(0.875rem, 2.5vw, 1rem) clamp(1.25rem, 4vw, 1.75rem);
	border-radius: clamp(14px, 3vw, 16px);
	border: 2px solid rgba(255, 255, 255, 0.3);
	background: linear-gradient(
		135deg,
		rgba(255, 255, 255, 0.2) 0%,
		rgba(255, 255, 255, 0.1) 100%
	);
	backdrop-filter: blur(20px);
	color: white;
	font-size: clamp(0.9375rem, 2.75vw, 1.0625rem);
	font-weight: 600;
	cursor: pointer;
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	touch-action: manipulation;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
	position: relative;
	z-index: 1;
	flex-shrink: 0; // Предотвращаем сжатие кнопки

	&:hover {
		transform: translateY(-4px) scale(1.02);
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
		border-color: rgba(255, 255, 255, 0.5);
	}

	&:active {
		transform: translateY(-2px) scale(1);
	}

	&--game {
		max-width: 200px;
		margin: 0 auto;
		width: 100%;
	}
}

.btn--restart {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	cursor: pointer;
	transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
	touch-action: manipulation;
	-webkit-tap-highlight-color: transparent;
	background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 50%, #5b21b6 100%);
	border: 2px solid rgba(196, 181, 253, 0.4);
	padding: 1.1rem 2.25rem;
	font-size: 1.2rem;
	font-weight: 700;
	border-radius: 18px;
	box-shadow:
		0 4px 16px rgba(139, 92, 246, 0.4),
		inset 0 1px 0 rgba(255, 255, 255, 0.2);
	color: #fff;

	&:hover {
		background: linear-gradient(135deg, #a78bfa 0%, #8b5cf6 50%, #7c3aed 100%);
		border-color: rgba(196, 181, 253, 0.6);
		box-shadow:
			0 6px 24px rgba(139, 92, 246, 0.5),
			0 0 32px rgba(139, 92, 246, 0.25),
			inset 0 1px 0 rgba(255, 255, 255, 0.25);
		transform: translateY(-2px);
	}

	&:active {
		transform: translateY(0) scale(0.98);
		box-shadow: 0 2px 12px rgba(139, 92, 246, 0.4);
	}

	&__icon {
		font-size: 1.45rem;
		line-height: 1;
	}
}
</style>
