<template>
	<AppLayout>
		<template #title>
			<div class="game-header">
				<button
					class="game-header__exit"
					@click="showExitDialog"
					aria-label="Exit"
				>
					<svg
						class="game-header__exit-icon"
						viewBox="0 0 20 20"
						xmlns="http://www.w3.org/2000/svg"
					>
						<rect x="0" fill="none" width="20" height="20" />
						<g>
							<path
								d="M13 3v2h2v10h-2v2h4V3h-4zm0 8V9H5.4l4.3-4.3-1.4-1.4L1.6 10l6.7 6.7 1.4-1.4L5.4 11H13z"
								fill="currentColor"
							/>
						</g>
					</svg>
				</button>
				<div class="game-header__time">{{ formattedTime }}</div>
				<div class="game-header__score">
					<span class="game-header__icon">⭐</span>
					{{ gameStore.score }}
				</div>
				<div class="game-header__wave">
					<span class="game-header__icon">🌊</span>
					{{ gameStore.waveIndex }}
				</div>
			</div>
		</template>

		<div
			class="game-page"
			:class="{
				'game-page--danger': isDangerState,
				'game-page--android': isAndroidPlatform,
			}"
		>
		<div
			ref="playAreaRef"
			class="game-page__play-area"
		>
			<div class="game-page__scroll-container">
				<div class="game-page__canvas-container">
					<!-- Canvas будет заменен на canvas из PixiService при attachToHost -->
					<!-- Но нужен ref для получения контейнера -->
					<canvas ref="canvas" class="game-canvas"></canvas>
				</div>
			</div>

			<div
				v-if="!gameStore.isGameOver"
				ref="levelIndicatorRef"
				class="level-indicator"
				:title="`Rows to top: ${rowsToTop}`"
			>
				<div class="level-indicator__bar">
						<div
							class="level-indicator__fill"
							:style="{
								height: levelFillPercent + '%',
								backgroundColor: levelBarColor,
							}"
						/>
					</div>
				</div>

				<div
					v-if="!gameStore.isGameOver"
					class="column-danger-indicator"
					aria-live="polite"
				>
					<div class="column-danger-indicator__track">
						<div
							v-for="(heightPercent, colIndex) in columnHeightPercents"
							:key="colIndex"
							class="column-danger-indicator__col"
							:class="{
								'column-danger-indicator__col--active':
									colIndex === primaryPriorityColumn,
								'column-danger-indicator__col--tied':
									priorityColumnIndexes.includes(colIndex),
							}"
						>
							<div
								class="column-danger-indicator__fill"
								:style="{ height: `${heightPercent}%` }"
							/>
						</div>
					</div>
				</div>
			</div>

			<div class="game-page__bottom-section"></div>

			<ConfirmDialog
				v-model="isExitDialogOpen"
				title="Exit Game"
				message="Are you sure you want to exit? Progress will be lost."
				confirm-text="Exit"
				cancel-text="Cancel"
				@confirm="handleExit"
			/>

			<Transition name="toast-fade">
				<div
					v-if="gameStore.gameMessageToast"
					class="game-message-toast"
				>
					<div class="game-message-toast__panel">
						<div class="game-message-toast__text">
							{{ gameStore.gameMessageToast.text }}
						</div>
						<div class="game-message-toast__bonus">
							+{{ gameStore.gameMessageToast.bonus }}
						</div>
					</div>
				</div>
			</Transition>

			<div v-if="gameStore.isGameOver" class="game-overlay">
				<div class="game-overlay__content">
					<div class="game-overlay__icon">✕</div>
					<h2 class="game-overlay__title">Game Over</h2>
					<p class="game-overlay__score">
						Final Score: <strong>{{ gameStore.score }}</strong>
					</p>
					<button class="btn btn--restart" @click="restart">
						<span class="btn--restart__icon">↻</span>
						Restart
					</button>
				</div>
			</div>

			<div v-if="isGenerating" class="generation-loading">
				<div class="generation-loading__spinner"></div>
			</div>
		</div>
	</AppLayout>
</template>

<script setup lang="ts">
import {
	ref,
	computed,
	watch,
	onMounted,
	onBeforeUnmount,
	useTemplateRef,
	nextTick,
} from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ScreenOrientation } from '@capacitor/screen-orientation'
import { Capacitor } from '@capacitor/core'
import AppLayout from '@/shared/components/AppLayout.vue'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import { GameRenderer } from '@/game/render'
import { GameController } from '@/game/GameController'
import { useGameStore } from '@/shared/stores/gameStore'
import { WIDTH } from '@/game/logic'
import { AudioManager } from '@/game/audio/AudioManager'
import { PixiService } from '@/pixi/PixiService'
import admob from '@/utils/admob'

const router = useRouter()
const route = useRoute()
const gameStore = useGameStore()
const isAndroidPlatform = Capacitor.getPlatform() === 'android'

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const levelIndicatorRef = useTemplateRef<HTMLElement>('levelIndicator')
const playAreaRef = useTemplateRef<HTMLElement>('playArea')
const isExitDialogOpen = ref(false)
const isGenerating = ref(true)
let shouldUseHardResetOnUnmount = false
const INTERSTITIAL_CLOSE_TIMEOUT_MS = 8000
const CONTAINER_VISIBILITY_TIMEOUT_MS = 2000
const BANNER_HIDE_TIMEOUT_MS = 1500

// Хелпер для получения canvas из PixiService или fallback на ref
function getPixiCanvas(): HTMLCanvasElement | null {
	return PixiService.isReady() ? PixiService.getCanvas() : canvas.value
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

// Stub retained for onBeforeUnmount compatibility after MomentumScroll removal
function clearPlayAreaPressTimer() {}

// Drag state for input handling
let dragStart: { r: number; c: number } | null = null
let dragStartClient: { x: number; y: number } | null = null
// First block selected by click (for swap on second click)
let selectedForSwap: { r: number; c: number } | null = null
let isDragging = false
// Защита от двойной обработки событий на мобильных устройствах
let lastEventTime = 0
let lastEventType: string | null = null

const USER_ACTION_COOLDOWN_MS = 140 // Ограничение частоты действий, чтобы избежать спама ввода

type PendingUserAction = {
	action: 'swap' | 'slide'
	fromCubeId: number
	targetCubeId?: number
	dr: number
	dc: number
}

let lastUserActionAt = 0
let pendingUserAction: PendingUserAction | null = null
let pendingUserActionTimer: ReturnType<typeof setTimeout> | null = null

function clearPendingUserActionFlushTimer() {
	if (pendingUserActionTimer !== null) {
		clearTimeout(pendingUserActionTimer)
		pendingUserActionTimer = null
	}
}

function schedulePendingUserActionFlush(delayMs = 0) {
	clearPendingUserActionFlushTimer()
	pendingUserActionTimer = setTimeout(() => {
		pendingUserActionTimer = null
		flushPendingUserAction()
	}, Math.max(0, delayMs))
}

function getCubePositionById(
	cubeId: number,
): { r: number; c: number } | null {
	const grid = gameStore.grid
	if (!grid?.length) return null

	for (let r = 0; r < grid.length; r++) {
		for (let c = 0; c < WIDTH; c++) {
			if (grid[r]?.[c]?.id === cubeId) return { r, c }
		}
	}
	return null
}

function buildPendingUserAction(
	action: 'swap' | 'slide',
	from: { r: number; c: number },
	to: { r: number; c: number },
): PendingUserAction | null {
	const fromCube = gameStore.grid[from.r]?.[from.c]
	if (!fromCube) return null

	const dr = to.r - from.r
	const dc = to.c - from.c

	if (action === 'swap') {
		const targetCube = gameStore.grid[to.r]?.[to.c]
		if (!targetCube) return null
		return {
			action,
			fromCubeId: fromCube.id,
			targetCubeId: targetCube.id,
			dr,
			dc,
		}
	}

	return {
		action,
		fromCubeId: fromCube.id,
		dr,
		dc,
	}
}

function flushPendingUserAction() {
	if (!pendingUserAction || !gameController || gameStore.isGameOver) return
	if (gameStore.isLocked) return

	const now = Date.now()
	const elapsed = now - lastUserActionAt
	if (elapsed < USER_ACTION_COOLDOWN_MS) {
		schedulePendingUserActionFlush(USER_ACTION_COOLDOWN_MS - elapsed)
		return
	}

	const action = pendingUserAction
	pendingUserAction = null

	const from = getCubePositionById(action.fromCubeId)
	if (!from) return

	let to: { r: number; c: number } | null = null
	if (action.action === 'swap') {
		if (action.targetCubeId === undefined) return
		const target = getCubePositionById(action.targetCubeId)
		if (!target) return
		to = target
	} else {
		to = { r: from.r + action.dr, c: from.c + action.dc }
	}

	const height = gameStore.grid?.length ?? 0
	if (!to || to.r < 0 || to.r >= height || to.c < 0 || to.c >= WIDTH) return

	lastUserActionAt = now
	void gameController.applyUserAction(action.action, from, to)
}

function submitUserAction(
	action: 'swap' | 'slide',
	from: { r: number; c: number },
	to: { r: number; c: number },
) {
	if (!gameController || gameStore.isGameOver) return

	const now = Date.now()
	const nextAction = buildPendingUserAction(action, from, to)
	if (!nextAction) return

	// Если игра в анимации (locked), сохраняем последнее действие игрока и применим его сразу после unlock.
	if (gameStore.isLocked) {
		pendingUserAction = nextAction
		return
	}

	const elapsed = now - lastUserActionAt
	if (elapsed < USER_ACTION_COOLDOWN_MS) {
		pendingUserAction = nextAction
		schedulePendingUserActionFlush(USER_ACTION_COOLDOWN_MS - elapsed)
		return
	}

	lastUserActionAt = now
	void gameController.applyUserAction(action, from, to)
}

watch(
	() => gameStore.isLocked,
	(isLocked) => {
		if (!isLocked) {
			schedulePendingUserActionFlush()
		}
	},
)

const formattedTime = computed(() => {
	const time = Math.max(0, Math.floor(gameStore.remainingTime))
	const seconds = time % 100 // Показываем только последние 2 цифры
	return String(seconds).padStart(2, '0')
})

const gridHeight = computed(
	() => gameStore.grid?.length ?? gameStore.getHeight(),
)
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

const columnHeights = computed(() => {
	const g = gameStore.grid
	const h = gridHeight.value
	if (!g?.length || h <= 0) return Array.from({ length: WIDTH }, () => 0)

	return Array.from({ length: WIDTH }, (_, c) => {
		for (let r = 0; r < h; r++) {
			if (g[r]?.[c]) {
				return h - r
			}
		}
		return 0
	})
})

const maxColumnHeight = computed(() => {
	const heights = columnHeights.value
	if (!heights.length) return 0
	return Math.max(...heights)
})

const priorityColumnIndexes = computed(() => {
	const maxHeight = maxColumnHeight.value
	if (maxHeight <= 0) return [] as number[]
	return columnHeights.value.reduce<number[]>((acc, height, index) => {
		if (height === maxHeight) acc.push(index)
		return acc
	}, [])
})

const primaryPriorityColumn = computed(() => {
	const priorities = priorityColumnIndexes.value
	return priorities.length > 0 ? priorities[0] : -1
})

const columnHeightPercents = computed(() => {
	const h = gridHeight.value
	if (h <= 0) return Array.from({ length: WIDTH }, () => 0)
	return columnHeights.value.map((value) => {
		if (value <= 0) return 6
		const pct = (value / h) * 100
		return Math.max(12, Math.min(100, pct))
	})
})

// Danger state: tiles are near the top (less than 20% remaining)
const isDangerState = computed(() => levelFillPercent.value >= 80)

/** При расширении сосуда: переразмер канваса и Pixi. */
async function handleVesselExpanded(): Promise<void> {
	if (!renderer) return

	// КРИТИЧНО: Получаем canvas из PixiService
	const pixiCanvas = getPixiCanvas()
	if (!pixiCanvas) return

	initCanvas()

	// Получаем актуальную высоту grid для правильного расчета позиций
	const gridHeight = gameStore.grid?.length ?? gameStore.getHeight()

	// Обновляем размер плитки в renderer (на случай если ширина контейнера изменилась)
	const container = pixiCanvas.parentElement
	// Инвалидируем кэш перед получением новых размеров
	cachedContainerRect = null
	const containerWidth =
		(container?.getBoundingClientRect().width ??
			parseInt(pixiCanvas.style.width)) ||
		320
	const newTileSize = Math.max(containerWidth, 320) / WIDTH

	// Получаем логические размеры из CSS стилей (не внутренние размеры canvas!)
	const logicalWidth = parseInt(pixiCanvas.style.width) || containerWidth
	const logicalHeight =
		parseInt(pixiCanvas.style.height) || gridHeight * newTileSize

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
	// КРИТИЧНО: Получаем контейнер из canvas ref или из DOM
	const container =
		canvas.value?.parentElement ||
		document.querySelector('.game-page__canvas-container')
	if (!container) {
		console.warn('[GamePage] initCanvas: container not found')
		return
	}

	// КРИТИЧНО: Получаем canvas из PixiService
	const pixiCanvas = getPixiCanvas()
	if (!pixiCanvas) {
		console.warn('[GamePage] initCanvas: canvas not available')
		return
	}

	// Принудительно используем полную ширину контейнера для 8 кубиков
	// Получаем актуальные размеры контейнера
	let containerRect = container.getBoundingClientRect()

	// Если размеры нулевые, пытаемся получить их из computed styles или используем кэш
	if (containerRect.width === 0 || containerRect.height === 0) {
		const computedStyle = window.getComputedStyle(container)
		const parentRect = container.parentElement?.getBoundingClientRect()

		// Пытаемся использовать ширину родителя или computed width
		if (parentRect && parentRect.width > 0) {
			containerRect = {
				...containerRect,
				width: parentRect.width,
			} as DOMRect
		} else if (
			computedStyle.width &&
			computedStyle.width !== 'auto' &&
			computedStyle.width !== '0px'
		) {
			const width = parseFloat(computedStyle.width)
			if (width > 0) {
				containerRect = {
					...containerRect,
					width: width,
				} as DOMRect
			}
		}

		// Если все еще нулевые, используем кэш или минимальные значения
		if (containerRect.width === 0) {
			if (cachedContainerRect && cachedContainerRect.width > 0) {
				containerRect = cachedContainerRect
			} else {
				containerRect = {
					...containerRect,
					width: 320, // Минимальная ширина для мобильных
				} as DOMRect
			}
		}
	}

	cachedContainerRect = containerRect
	const maxWidth = Math.max(containerRect.width, 320) // Минимум 320px для мобильных
	// Используем фактическую высоту grid, а не gameStore.getHeight()
	// Это важно, чтобы высота канваса всегда соответствовала фактической высоте grid
	const h = gameStore.grid?.length ?? gameStore.getHeight()

	// Всегда делим на WIDTH (6) для получения размера плитки
	const tileSize = maxWidth / WIDTH
	const canvasHeight = h * tileSize

	// Устанавливаем CSS размеры (логические пиксели)
	// Это важно для правильного отображения на мобильных устройствах
	pixiCanvas.style.width = `${maxWidth}px`
	pixiCanvas.style.height = `${canvasHeight}px`
	pixiCanvas.style.display = 'block'

	// НЕ устанавливаем внутренние размеры canvas вручную!
	// PixiJS с autoDensity: true сам управляет внутренними размерами
	// на основе CSS размеров и devicePixelRatio
	// Установка внутренних размеров вручную может вызвать проблемы на Android
}

function getPositionFromEvent(
	e: MouseEvent | TouchEvent | PointerEvent,
): { r: number; c: number } | null {
	// КРИТИЧНО: Используем canvas из PixiService
	const pixiCanvas = getPixiCanvas()
	if (!pixiCanvas || !renderer) return null

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
	const rect = pixiCanvas.getBoundingClientRect()

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
	// For touch events: claim the gesture immediately so the browser never decides
	// this is a scroll — prevents subsequent touchmove from having cancelable=false.
	if (e instanceof TouchEvent && e.cancelable) {
		e.preventDefault()
	}

	// КРИТИЧНО: Блокируем ввод до тех пор, пока игра не запущена
	if (!gameStore.isGameStarted) {
		return
	}
	if (gameStore.isGameOver) return

	// Защита от двойной обработки событий на мобильных устройствах
	// На мобильных устройствах pointerdown и touchstart могут срабатывать одновременно
	const eventType =
		e instanceof TouchEvent
			? 'touch'
			: e instanceof PointerEvent
				? 'pointer'
				: 'mouse'
	const now = Date.now()
	if (now - lastEventTime < 50 && lastEventType !== eventType) {
		// Игнорируем событие, если недавно было обработано событие другого типа
		return
	}
	lastEventTime = now
	lastEventType = eventType

	// Unlock audio context on first interaction (iOS/Android)
	AudioManager.unlock()

	const pixiCanvas = getPixiCanvas()

	// Захватываем pointer для отслеживания движения (но не блокируем события)
	if (e instanceof PointerEvent && pixiCanvas && e.pointerId !== undefined) {
		pixiCanvas.setPointerCapture(e.pointerId)
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

	const pos = getPositionFromEvent(e)
	if (pos) {
		dragStart = pos
		const cube = gameStore.grid[pos.r]?.[pos.c]
		// Highlight selected tile (only if it has moves > 0)
		if (cube && cube.moves > 0) {
			renderer?.setSelectedPosition(pos.r, pos.c)
		} else {
			renderer?.setSelectedPosition(null, null)
		}
	}
}

function handlePointerUp(e: MouseEvent | TouchEvent | PointerEvent): void {

	// Освобождаем pointer, если был захвачен
	// КРИТИЧНО: Используем canvas из PixiService
	const pixiCanvas = getPixiCanvas()

	if (e instanceof PointerEvent && pixiCanvas && e.pointerId !== undefined) {
		if (pixiCanvas.hasPointerCapture(e.pointerId)) {
			pixiCanvas.releasePointerCapture(e.pointerId)
		}
	}

	if (!dragStart || gameStore.isGameOver) {
		dragStart = null
		dragStartClient = null
		isDragging = false
		return
	}

	if (e instanceof PointerEvent) {
		e.preventDefault()
		e.stopPropagation()
	} else if (e instanceof TouchEvent) {
		e.preventDefault()
		e.stopPropagation()
	} else if (e instanceof MouseEvent) {
		e.stopPropagation()
	}

	const pos = getPositionFromEvent(e)
	if (!pos) {
		dragStart = null
		dragStartClient = null
		selectedForSwap = null
		isDragging = false
		renderer?.setSelectedPosition(null, null)
		return
	}

	// Determine action
	const dr = pos.r - dragStart.r
	const dc = pos.c - dragStart.c

	// Если был свайп (isDragging = true), обрабатываем его
	if (isDragging) {
		// Check if adjacent
		const isAdjacent =
			(Math.abs(dr) === 1 && dc === 0) || (dr === 0 && Math.abs(dc) === 1)

		if (isAdjacent) {
			// Check if target has cube for swap, or empty for slide
			const targetCube = gameStore.grid[pos.r]?.[pos.c]
			const fromCube = gameStore.grid[dragStart.r]?.[dragStart.c]

			// IMPORTANT: Check that starting cube has moves > 0
			if (targetCube && fromCube && fromCube.moves > 0) {
				// Both have cubes - swap
				submitUserAction('swap', dragStart, pos)
			} else if (
				!targetCube &&
				fromCube &&
				fromCube.moves > 0 &&
				Math.abs(dc) === 1 &&
				dr === 0
			) {
				// Target empty and horizontal move - slide
				submitUserAction('slide', dragStart, pos)
			}
		}

		// Clear selection after move (swipe)
		selectedForSwap = null
		renderer?.setSelectedPosition(null, null)
		dragStart = null
		dragStartClient = null
		isDragging = false
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
			// First click: select this block (only if it has moves > 0)
			if (fromCube && fromCube.moves > 0) {
				selectedForSwap = { r: pos.r, c: pos.c }
				renderer?.setSelectedPosition(pos.r, pos.c)
			} else {
				// Block has no moves, clear selection
				selectedForSwap = null
				renderer?.setSelectedPosition(null, null)
			}
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
		const adjR =
			Math.abs(pos.r - selectedForSwap.r) === 1 && pos.c === selectedForSwap.c
		const adjC =
			pos.r === selectedForSwap.r && Math.abs(pos.c - selectedForSwap.c) === 1
		const isAdjacentClick = adjR || adjC
		const targetCube = gameStore.grid[pos.r]?.[pos.c]
		const fromCubeSel = gameStore.grid[selectedForSwap.r]?.[selectedForSwap.c]
		// IMPORTANT: Check that starting cube has moves > 0
		if (isAdjacentClick && targetCube && fromCubeSel && fromCubeSel.moves > 0) {
			submitUserAction('swap', selectedForSwap, pos)
			selectedForSwap = null
			renderer?.setSelectedPosition(null, null)
			dragStart = null
			return
		}
		if (
			isAdjacentClick &&
			!targetCube &&
			fromCubeSel &&
			fromCubeSel.moves > 0 &&
			Math.abs(pos.c - selectedForSwap.c) === 1 &&
			pos.r === selectedForSwap.r
		) {
			// Horizontal slide into empty
			submitUserAction('slide', selectedForSwap, pos)
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

}

// Функция для запуска игры с проверкой рекламы
async function startGameWithAds(): Promise<void> {
	if (!gameController || !renderer) return

	// КРИТИЧНО: Убеждаемся, что canvas имеет правильные размеры перед запуском игры
	// Это особенно важно при возврате на страницу, когда canvas может быть инициализирован с нулевой высотой
	const pixiCanvas = getPixiCanvas()
	if (pixiCanvas) {
		// Получаем актуальную высоту grid (будет использована при создании grid в startGame)
		const expectedHeight = gameStore.getHeight()
		const containerWidth =
			cachedContainerRect?.width ??
			pixiCanvas.getBoundingClientRect().width ??
			320
		const tileSize = Math.max(containerWidth, 320) / WIDTH
		const expectedCanvasHeight = expectedHeight * tileSize

		// Обновляем размеры canvas, если они неправильные
		const currentHeight = parseInt(pixiCanvas.style.height) || 0
		if (currentHeight !== expectedCanvasHeight) {
			pixiCanvas.style.height = `${expectedCanvasHeight}px`
			// Обновляем размеры через renderer
			renderer.resizeCanvas(
				parseInt(pixiCanvas.style.width) || containerWidth,
				expectedCanvasHeight,
				expectedHeight,
			)
		}

		// Ждем, пока canvas получит правильные размеры
		let attempts = 0
		const maxAttempts = 10
		while (attempts < maxAttempts) {
			const rect = pixiCanvas.getBoundingClientRect()
			if (rect.height > 0 && rect.width > 0) {
				break
			}
			attempts++
			await nextTick()
			await new Promise((resolve) => requestAnimationFrame(resolve))
			await new Promise((resolve) => setTimeout(resolve, 50))
		}
	}

	// Увеличиваем счетчик игр
	gameStore.incrementGamesPlayed()

	// Проверяем, нужно ли показать interstitial рекламу
	const shouldShowAd = gameStore.shouldShowInterstitial()

	if (shouldShowAd) {
		isGenerating.value = true

		// Показываем interstitial рекламу и ждем её закрытия
		await new Promise<void>((resolve) => {
			let isResolved = false
			const finish = () => {
				if (isResolved) return
				isResolved = true
				resolve()
			}

			const timeoutId = setTimeout(() => {
				console.warn(
					`[GamePage] Interstitial close timeout after ${INTERSTITIAL_CLOSE_TIMEOUT_MS}ms, continuing game startup`,
				)
				finish()
			}, INTERSTITIAL_CLOSE_TIMEOUT_MS)

			void admob
				.interstitial({
					isFirst: false,
					onInterstitialAdClosed: () => {
						clearTimeout(timeoutId)
						finish()
					},
				})
				.catch((error) => {
					console.warn(
						'[GamePage] Interstitial failed, continuing game startup:',
						error,
					)
					clearTimeout(timeoutId)
					finish()
				})
		})
	}

	// Запускаем игру после закрытия рекламы (или если реклама не нужна)
	// Повторная проверка: компонент мог размонтироваться пока шли await выше
	if (!gameController || !renderer) return
	await gameController.startGame()

	const tilesAddedTime = performance.now()
	gameStore.setDiagnostic('tilesAdded', tilesAddedTime)

	// Запускаем boot-цепочку
	if (!gameController) return
	await gameController.bootGame()
}

onMounted(async () => {
	const gamePageStartTime = performance.now()

	// КРИТИЧНО: Сбрасываем состояние игры при монтировании компонента
	// Это гарантирует, что игра всегда запускается с чистого состояния
	// даже если пользователь вернулся на страницу после выхода
	shouldUseHardResetOnUnmount = false
	gameStore.reset()
	isGenerating.value = true

	try {
		// Initialize AudioManager
		await AudioManager.init()

	// КРИТИЧНО: Получаем контейнер для canvas
	// Используем canvas ref для получения контейнера, но сам canvas будет заменен на canvas из PixiService
	// Ждем, пока DOM полностью отрендерится
	await nextTick()
	await new Promise((resolve) => requestAnimationFrame(resolve))

	let container =
		canvas.value?.parentElement ||
		(document.querySelector('.game-page__canvas-container') as HTMLElement)

	// Если контейнер не найден, пытаемся найти его через playAreaRef
	if (!container && playAreaRef.value) {
		container = playAreaRef.value.querySelector(
			'.game-page__canvas-container',
		) as HTMLElement
	}

	// Если все еще не найден, ждем еще немного и ищем снова
	if (!container) {
		await new Promise((resolve) => setTimeout(resolve, 100))
		container =
			canvas.value?.parentElement ||
			(document.querySelector('.game-page__canvas-container') as HTMLElement)
	}

	if (!container) {
		console.error(
			'[GamePage] onMounted: Canvas container not found after waiting',
		)
		return
	}

	// КРИТИЧНО: Проверяем, что контейнер не скрыт (display: none)
	const containerStyle = window.getComputedStyle(container)
	if (
		containerStyle.display === 'none' ||
		containerStyle.visibility === 'hidden'
	) {
		console.warn(
			'[GamePage] onMounted: Canvas container is hidden, waiting for visibility...',
		)
		// Ждем, пока контейнер станет видимым
		await new Promise((resolve) => {
			const startedAt = performance.now()
			const checkVisibility = () => {
				const style = window.getComputedStyle(container)
				if (style.display !== 'none' && style.visibility !== 'hidden') {
					resolve(undefined)
				} else if (
					performance.now() - startedAt >=
					CONTAINER_VISIBILITY_TIMEOUT_MS
				) {
					console.warn(
						`[GamePage] onMounted: container visibility wait timeout after ${CONTAINER_VISIBILITY_TIMEOUT_MS}ms, continuing startup`,
					)
					resolve(undefined)
				} else {
					requestAnimationFrame(checkVisibility)
				}
			}
			checkVisibility()
		})
	}

	// КРИТИЧНО: Проверяем, что PixiService инициализирован
	if (!PixiService.isReady()) {
		console.warn(
			'[GamePage] onMounted: PixiService not initialized. Initializing fallback...',
		)
		// Попытка инициализировать в экстренном случае (fallback для прямого перехода на GamePage)
		try {
			await PixiService.init(container, { width: 320, height: 400 })
			if (!PixiService.isReady()) {
				console.error('[GamePage] onMounted: PixiService initialization failed')
				return
			}
		} catch (error) {
			console.error(
				'[GamePage] onMounted: Failed to initialize PixiService:',
				error,
			)
			return
		}
	}

	// КРИТИЧНО: Удаляем временный canvas из template (если есть)
	if (canvas.value && canvas.value.parentElement === container) {
		container.removeChild(canvas.value)
	}

	// КРИТИЧНО: Прикрепляем canvas из PixiService к нашему контейнеру
	try {
		PixiService.attachToHost(container)
	} catch (error) {
		console.error(
			'[GamePage] onMounted: Failed to attach canvas to host:',
			error,
		)
		return
	}

	// Получаем canvas из PixiService
	const pixiCanvas = getPixiCanvas()
	if (!pixiCanvas) {
		console.error('[GamePage] onMounted: Failed to get canvas from PixiService')
		return
	}

	// КРИТИЧНО: Убеждаемся, что canvas видим после прикрепления
	pixiCanvas.style.display = 'block'
	pixiCanvas.style.visibility = 'visible'
	pixiCanvas.style.opacity = '1'

	// КРИТИЧНО: Ждем, пока контейнер получит размеры от flexbox layout
	// После изменений в layout нужно дать время браузеру рассчитать размеры
	let containerRect = container.getBoundingClientRect()
	let attempts = 0
	const maxAttempts = 20 // Максимум 20 попыток (примерно 1 секунда при 50ms задержке)

	while (
		(containerRect.width === 0 || containerRect.height === 0) &&
		attempts < maxAttempts
	) {
		attempts++

		// Ждем несколько кадров для расчета layout
		await nextTick()
		await new Promise((resolve) => requestAnimationFrame(resolve))
		await new Promise((resolve) => requestAnimationFrame(resolve))
		await new Promise((resolve) => setTimeout(resolve, 50)) // Дополнительная задержка для flexbox

		containerRect = container.getBoundingClientRect()
	}

	if (containerRect.width === 0 || containerRect.height === 0) {
		console.error(
			'[GamePage] onMounted: Canvas container has zero dimensions after waiting:',
			{
				width: containerRect.width,
				height: containerRect.height,
				styleWidth: container.style.width,
				styleHeight: container.style.height,
				computedWidth: window.getComputedStyle(container).width,
				computedHeight: window.getComputedStyle(container).height,
				parentWidth: container.parentElement?.getBoundingClientRect().width,
				parentHeight: container.parentElement?.getBoundingClientRect().height,
			},
		)
		// Продолжаем с минимальными размерами вместо ошибки
		console.warn('[GamePage] onMounted: Using fallback dimensions (320x400)')
		containerRect = { width: 320, height: 400 } as DOMRect
	}

	// Инициализируем canvas с правильными размерами
	initCanvas()

	// Ждем еще один кадр после initCanvas для гарантии, что размеры установлены
	await nextTick()
	await new Promise((resolve) => requestAnimationFrame(resolve))

	// КРИТИЧНО: Проверяем видимость canvas после инициализации
	const pixiCanvasAfterInit = getPixiCanvas()
	if (pixiCanvasAfterInit) {
		const canvasRect = pixiCanvasAfterInit.getBoundingClientRect()
		const canvasStyle = window.getComputedStyle(pixiCanvasAfterInit)

		// Принудительно устанавливаем видимость если нужно
		if (canvasStyle.display === 'none' || canvasRect.width === 0) {
			console.warn(
				'[GamePage] onMounted: Canvas is hidden or has zero width, forcing visibility',
			)
			pixiCanvasAfterInit.style.display = 'block'
			pixiCanvasAfterInit.style.visibility = 'visible'
			pixiCanvasAfterInit.style.opacity = '1'
		}
	}

	// Create renderer с правильным tileSize (всегда ширина / 8)
	// Используем кэшированное значение из initCanvas
	const containerWidth =
		cachedContainerRect?.width ?? containerRect.width ?? pixiCanvas.width
	const tileSize = Math.max(containerWidth, 320) / WIDTH // Минимум 320px для мобильных

	const rendererInitStartTime = performance.now()

	renderer = new GameRenderer({
		canvas: pixiCanvas, // Используем canvas из PixiService
		tileSize,
	})

	await renderer.init()

	// КРИТИЧНО: Проверяем видимость canvas после инициализации renderer
	const pixiCanvasAfterRenderer = getPixiCanvas()
	if (pixiCanvasAfterRenderer) {
		pixiCanvasAfterRenderer.style.display = 'block'
		pixiCanvasAfterRenderer.style.visibility = 'visible'
		pixiCanvasAfterRenderer.style.opacity = '1'
	}

	// После инициализации PixiJS нужно убедиться, что размеры canvas правильные
	// Получаем актуальные размеры из CSS (они уже установлены в initCanvas)
	const gridHeight = gameStore.grid?.length ?? gameStore.getHeight()

	const finalPixiCanvas = getPixiCanvas()
	const canvasWidth = finalPixiCanvas
		? parseInt(finalPixiCanvas.style.width) || containerWidth
		: containerWidth
	const canvasHeight = finalPixiCanvas
		? parseInt(finalPixiCanvas.style.height) || gridHeight * tileSize
		: gridHeight * tileSize
	// Обновляем размеры через renderer, чтобы PixiJS правильно их обработал
	renderer.resizeCanvas(canvasWidth, canvasHeight, gridHeight)

	const controllerInitStartTime = performance.now()

	// Create game controller с callback'ами для boot-цепочки
	gameController = new GameController(renderer, {
		onVesselExpanded: handleVesselExpanded,
		onHideLoading: () => {
			// Callback для скрытия loading overlay
			const hideLoadingTime = performance.now()
			gameStore.setDiagnostic('loaderHidden', hideLoadingTime)
			isGenerating.value = false
		},
		onStartScrollAnimation: async () => {
			gameStore.setDiagnostic('scrollStarted', performance.now())
		},
	})

	// Initialize controller - текстуры уже загружены в PixiService
	await gameController.init()

	// Читаем уровень из URL query параметров (для level mode)
	const levelParam = route.query.level
	const level = levelParam ? parseInt(String(levelParam), 10) : 1
	if (isNaN(level) || level < 1) {
		console.warn(
			`[GamePage] Invalid level parameter: ${levelParam}, using default level 1`,
		)
		gameStore.setCurrentLevel(1)
	} else {
		gameStore.setCurrentLevel(level)
	}

	// Показываем баннерную рекламу снизу экрана (не блокируем запуск игры)
	// showBannerIfNeeded: при первом заходе — showBanner, при повторном — resumeBanner
	const BANNER_SHOW_TIMEOUT_MS = 5000
	void Promise.race([
		admob.showBannerIfNeeded(),
		new Promise<void>((resolve) => setTimeout(resolve, BANNER_SHOW_TIMEOUT_MS)),
	]).catch((error) => {
		console.warn('[GamePage] Failed to show banner ad:', error)
	})

	const gameStartTime = performance.now()

	// Используем функцию с проверкой рекламы для запуска игры
	await startGameWithAds()

	// Setup input handlers
	// КРИТИЧНО: Используем canvas из PixiService
	const pixiCanvasForHandlers = getPixiCanvas()
	if (!pixiCanvasForHandlers) {
		console.error(
			'[GamePage] onMounted: Failed to get canvas for event handlers',
		)
		return
	}

	// Используем pointer events с preventDefault для предотвращения скролла
	pixiCanvasForHandlers.addEventListener('pointerdown', handlePointerDown, {
		passive: false,
	})
	pixiCanvasForHandlers.addEventListener('pointerup', handlePointerUp, {
		passive: false,
	})
	pixiCanvasForHandlers.addEventListener('pointercancel', handlePointerUp, {
		passive: false,
	})

	// Обработчик для pointermove - отслеживаем свайп
	pointerMoveHandler = (e: PointerEvent) => {
		if (
			!dragStart ||
			!dragStartClient ||
			gameStore.isGameOver
		) {
			return
		}

		const dx = Math.abs(e.clientX - dragStartClient.x)
		const dy = Math.abs(e.clientY - dragStartClient.y)
		const threshold = 10
		const moved = Math.sqrt(dx * dx + dy * dy)

		if (moved > threshold) {
			isDragging = true
			e.preventDefault()
			e.stopPropagation()

			const pos = getPositionFromEvent(e)
			if (pos) {
				const cube = gameStore.grid[pos.r]?.[pos.c]
				if (cube && cube.moves > 0) {
					renderer?.setSelectedPosition(pos.r, pos.c)
				} else {
					const startCube = gameStore.grid[dragStart.r]?.[dragStart.c]
					if (startCube && startCube.moves > 0) {
						renderer?.setSelectedPosition(dragStart.r, dragStart.c)
					} else {
						renderer?.setSelectedPosition(null, null)
					}
				}
			}
		}
	}
	pixiCanvasForHandlers.addEventListener('pointermove', pointerMoveHandler, {
		passive: false,
	})

	// Touch events для мобильных устройств
	pixiCanvasForHandlers.addEventListener('touchstart', handlePointerDown, {
		passive: false,
	})
	pixiCanvasForHandlers.addEventListener('touchend', handlePointerUp, {
		passive: false,
	})
	pixiCanvasForHandlers.addEventListener('touchcancel', handlePointerUp, {
		passive: false,
	})

	// Обработчик для touchmove - отслеживаем свайп
	touchMoveHandler = (e: TouchEvent) => {
		if (
			!dragStart ||
			!dragStartClient ||
			gameStore.isGameOver
		) {
			return
		}

		if (e.touches.length > 0) {
			const touch = e.touches[0]
			const dx = Math.abs(touch.clientX - dragStartClient!.x)
			const dy = Math.abs(touch.clientY - dragStartClient!.y)
			const threshold = 10
			const moved = Math.sqrt(dx * dx + dy * dy)

			if (moved > threshold) {
				isDragging = true
				// Guard: touchstart now calls preventDefault() so the browser never
				// sets cancelable=false on touchmove, but defend on edge-case paths.
				if (e.cancelable) {
					e.preventDefault()
					e.stopPropagation()
				}

				const pos = getPositionFromEvent(e)
				if (pos) {
					const cube = gameStore.grid[pos.r]?.[pos.c]
					if (cube && cube.moves > 0) {
						renderer?.setSelectedPosition(pos.r, pos.c)
					} else {
						const startCube = gameStore.grid[dragStart.r]?.[dragStart.c]
						if (startCube && startCube.moves > 0) {
							renderer?.setSelectedPosition(dragStart.r, dragStart.c)
						} else {
							renderer?.setSelectedPosition(null, null)
						}
					}
				}
			}
		}
	}
	pixiCanvasForHandlers.addEventListener('touchmove', touchMoveHandler, {
		passive: false,
	})

	// Скролл теперь запускается через bootGame() в правильном порядке

	// Handle resize - функция для обновления размера с debounce
	const handleResize = async () => {
		// КРИТИЧНО: Получаем canvas из PixiService
		const pixiCanvas = getPixiCanvas()
		if (!pixiCanvas) return

		// Debounce: отменяем предыдущий вызов, если он еще не выполнился
		if (resizeTimeout) {
			clearTimeout(resizeTimeout)
		}

		resizeTimeout = setTimeout(async () => {
			if (!pixiCanvas) return

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
			const logicalWidth =
				parseInt(pixiCanvas.style.width) ||
				pixiCanvas.getBoundingClientRect().width
			const logicalHeight =
				parseInt(pixiCanvas.style.height) ||
				pixiCanvas.getBoundingClientRect().height
			const gridHeight = gameStore.grid?.length ?? gameStore.getHeight()

			// Всегда используем логическую ширину / WIDTH для размера плитки
			const newTileSize = logicalWidth / WIDTH
			if (renderer && newTileSize > 0) {
				renderer.updateTileSize(newTileSize)
				renderer.resizeCanvas(logicalWidth, logicalHeight, gridHeight)
				// Синхронизировать позиции после изменения размера
				await renderer.syncGridPositions(gameStore.grid)
			}
		}, 150)
	}

	// Обработчик для window resize
	resizeHandler = handleResize
	window.addEventListener('resize', resizeHandler, { passive: true })

	// Обработчик для изменения ориентации (важно для мобильных)
	orientationHandler = handleResize
	window.addEventListener('orientationchange', orientationHandler, {
		passive: true,
	})

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
	const pixiCanvasForResize = getPixiCanvas()
	const canvasContainer =
		pixiCanvasForResize?.parentElement ||
		document.querySelector('.game-page__canvas-container')
	if (canvasContainer) {
		resizeObserver = new ResizeObserver(() => {
			handleResize()
		})
		resizeObserver.observe(canvasContainer)
	}
	} catch (error) {
		console.error('[GamePage] onMounted failed:', error)
	} finally {
		// КРИТИЧНО: Всегда сбрасываем loading при ошибке или раннем выходе
		// При успешном запуске onHideLoading уже установит false
		isGenerating.value = false
	}
})

onBeforeUnmount(() => {
	// Очищаем таймеры play-area
	clearPlayAreaPressTimer()
	clearPendingUserActionFlushTimer()
	pendingUserAction = null

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

	// КРИТИЧНО: Получаем canvas из PixiService для удаления обработчиков
	const pixiCanvas = getPixiCanvas()

	if (pixiCanvas) {
		pixiCanvas.removeEventListener('pointerdown', handlePointerDown)
		pixiCanvas.removeEventListener('pointerup', handlePointerUp)
		pixiCanvas.removeEventListener('pointercancel', handlePointerUp)
		if (pointerMoveHandler) {
			pixiCanvas.removeEventListener('pointermove', pointerMoveHandler)
		}
		pixiCanvas.removeEventListener('touchstart', handlePointerDown)
		pixiCanvas.removeEventListener('touchend', handlePointerUp)
		pixiCanvas.removeEventListener('touchcancel', handlePointerUp)
		if (touchMoveHandler) {
			pixiCanvas.removeEventListener('touchmove', touchMoveHandler)
		}
	}

	// КРИТИЧНО: Открепляем canvas от хоста (возвращаем в скрытое состояние)
	PixiService.detach()

	// Переключаемся обратно на стартовую сцену
	PixiService.switchToStartScene()

	// КРИТИЧНО: Останавливаем игру перед уничтожением контроллера
	if (gameController) {
		gameController.stop()
		gameController.destroy()
	}
	gameController = null
	renderer = null

	// КРИТИЧНО: Сбрасываем состояние игры при размонтировании компонента
	// Это гарантирует, что при возврате игра запустится с чистого состояния
	if (shouldUseHardResetOnUnmount) {
		gameStore.resetHard()
	} else {
		gameStore.reset()
	}
	isGenerating.value = false

	// Скрываем баннер после основной очистки и не блокируем unmount
	void Promise.race([
		admob.hideBanner(),
		new Promise<void>((resolve) => setTimeout(resolve, BANNER_HIDE_TIMEOUT_MS)),
	]).catch((error) => {
		console.warn('[GamePage] Failed to hide banner ad:', error)
	})
})

function showExitDialog(): void {
	isExitDialogOpen.value = true
}

function handleExit(): void {
	// Сбрасываем состояние игры при выходе
	shouldUseHardResetOnUnmount = true
	if (gameController) {
		gameController.stop()
	}
	gameStore.resetHard()
	isGenerating.value = false
	router.push('/')
}

async function restart(): Promise<void> {
	selectedForSwap = null
	dragStart = null
	dragStartClient = null
	isDragging = false
	clearPendingUserActionFlushTimer()
	pendingUserAction = null
	lastUserActionAt = 0
	renderer?.setSelectedPosition(null, null)
	if (gameController) {
		gameController.stop()
		isGenerating.value = true

		// Используем функцию с проверкой рекламы
		await startGameWithAds()
	}
}
</script>

<style lang="scss" scoped>
:deep(.app-layout) {
	background: transparent;
}

:deep(.top-bar) {
	/* Дополнительный отступ сверху для защиты от камеры телефона */
	padding-top: max(1rem, calc(env(safe-area-inset-top, 0px) + 0.5rem));

	@media (max-width: 640px) {
		padding-top: max(0.75rem, calc(env(safe-area-inset-top, 0px) + 0.5rem));
	}

	@media (max-width: 360px) {
		padding-top: max(0.5rem, calc(env(safe-area-inset-top, 0px) + 0.5rem));
	}
}

.game-page {
	--ad-reserve-height: calc(
		44px + 0.5rem + max(0.5rem, env(safe-area-inset-bottom, 0px))
	);
	--level-indicator-width: 0.4rem;
	--play-area-gap: 0.375rem;
	flex: 1;
	display: flex;
	flex-direction: column;
	padding: 1rem clamp(0.5rem, 2vw, 1rem) 0 clamp(0.5rem, 2vw, 2rem);
	padding-top: max(1rem, env(safe-area-inset-top, 0px));
	padding-bottom: 0;
	gap: 0.75rem;
	position: relative;
	overflow: hidden;
	min-height: 0; // Важно для flex-контейнеров, чтобы они правильно ограничивали высоту
	// Используем calc для учета высоты нижней секции и safe-area
	max-height: 100%;
	height: 100%;
	max-width: 475px;
	width: 100%;
	margin: 0 auto;
	box-sizing: border-box;
	transition: all 0.3s ease;

	// Danger state: tiles near top
	&--danger {
		// Red vignette from top
		&::before {
			content: '';
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background: radial-gradient(
				ellipse at 50% 0%,
				rgba(239, 68, 68, 0.22) 0%,
				transparent 65%
			);
			pointer-events: none;
			z-index: 0;
			animation: danger-pulse 1.8s ease-in-out infinite;
		}

		.game-header {
			&__time {
				background: linear-gradient(
					135deg,
					rgba(239, 68, 68, 0.75) 0%,
					rgba(220, 38, 38, 0.75) 100%
				);
				border-color: rgba(248, 113, 113, 0.6);
				box-shadow:
					0 4px 20px rgba(239, 68, 68, 0.5),
					inset 0 1px 0 rgba(255, 255, 255, 0.25);
				animation: danger-glow 1.2s ease-in-out infinite;
			}
		}
	}

	@media (max-width: 640px) {
		--level-indicator-width: 0.5rem;
		padding-left: clamp(0.5rem, 1.5vw, 0.75rem);
		padding-right: clamp(0.5rem, 1.5vw, 0.75rem);
		gap: 0.5rem;
	}

	@media (max-width: 480px) {
		--level-indicator-width: 0.6rem;
	}

	@media (max-width: 360px) {
		--level-indicator-width: 0.7rem;
	}

	&--android {
		--ad-reserve-height: calc(
			8px + max(0.05rem, env(safe-area-inset-bottom, 0px))
		);
		gap: 0.125rem;

		.game-page__bottom-section {
			// На Android уменьшаем резерв под баннер до компактного фиксированного значения.
			gap: 0;
			// Небольшой зазор между игровой областью и рекламным блоком.
			padding-top: 0.1rem;
			padding-bottom: max(0.05rem, env(safe-area-inset-bottom, 0px));
			min-height: calc(8px + max(0.05rem, env(safe-area-inset-bottom, 0px)));
		}
	}

	&__play-area {
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--level-indicator-width);
		grid-template-rows: minmax(0, 1fr) auto;
		column-gap: var(--play-area-gap);
		row-gap: 0.35rem;
		align-items: stretch;
		flex: 1;
		min-height: 0; // Важно для flex-контейнеров, чтобы они правильно ограничивали высоту
		overflow: hidden; // Предотвращаем выход контента за пределы
		// Используем flex для автоматического расчета высоты
		// Высота будет автоматически ограничена родительским контейнером
	}

	&__bottom-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		flex-shrink: 0;
		padding: 0.5rem 0 1rem;
		padding-bottom: max(0.5rem, env(safe-area-inset-bottom, 0px));
		// Резервируем место под нижний баннер, но на мобильных уменьшаем запас,
		// чтобы не съедать игровую область.
		min-height: calc(
			44px + 0.5rem + max(0.5rem, env(safe-area-inset-bottom, 0px))
		);

		@media (max-width: 640px) {
			gap: 0.4rem;
			padding: 0.4rem 0 1rem;
			padding-bottom: max(0.4rem, env(safe-area-inset-bottom, 0px));
			min-height: calc(
				40px + 0.4rem + max(0.4rem, env(safe-area-inset-bottom, 0px))
			);
		}

		@media (max-width: 480px) {
			min-height: calc(
				36px + 0.35rem + max(0.35rem, env(safe-area-inset-bottom, 0px))
			);
		}
	}

	&__scroll-container {
		grid-column: 1;
		grid-row: 1;
		flex: 1;
		min-height: 0;
		background:
			linear-gradient(
				180deg,
				rgba(255, 255, 255, 0.06) 0%,
				transparent 30%,
				transparent 100%
			),
			linear-gradient(180deg, #3b5fb8 0%, #2a3e87 100%);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.08),
			0 8px 32px rgba(0, 0, 0, 0.35);
		border: 1px solid rgba(0, 0, 0, 0.15);
		border-radius: 20px;
		position: relative;
		z-index: 1;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		visibility: visible;
		opacity: 1;
		overflow: hidden;
		justify-content: flex-end;
	}

	&__canvas-container {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		width: 100%;
		/* Предотвращаем растяжение canvas */
		min-width: 0;
		// Контейнер должен расти по содержимому (canvas)
		min-height: fit-content;
		position: relative;
		// Гарантируем, что canvas виден
		visibility: visible;
		opacity: 1;
	}
}

.level-indicator {
	grid-column: 2;
	grid-row: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	width: 0.4rem;
	min-width: 0.4rem; // Минимальная ширина для гарантии видимости
	flex-shrink: 0;
	gap: 0.25rem;
	// Позволяем скроллить через индикатор
	cursor: grab;
	position: relative;
	z-index: 2;
	visibility: visible !important;
	opacity: 1 !important;
	pointer-events: auto !important;

	// Увеличиваем ширину на мобильных устройствах для лучшей видимости
	@media (max-width: 640px) {
		width: 0.5rem;
		min-width: 0.5rem;
	}

	@media (max-width: 480px) {
		width: 0.6rem;
		min-width: 0.6rem;
	}

	@media (max-width: 360px) {
		width: 0.7rem;
		min-width: 0.7rem;
	}

	&:active {
		cursor: grabbing;
	}

	&__label {
		font-size: 0.65rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.95);
		background: linear-gradient(
			135deg,
			rgba(102, 126, 234, 0.5) 0%,
			rgba(118, 75, 162, 0.5) 100%
		);
		backdrop-filter: blur(8px);
		border-radius: 5px;
		padding: 0.125rem 0.25rem;
		line-height: 1;
		border: 1px solid rgba(255, 255, 255, 0.25);
	}

	&__bar {
		flex: 1;
		width: 100%;
		min-width: 100%; // Гарантируем полную ширину
		min-height: 60px;
		background: rgba(0, 0, 0, 0.4);
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		position: relative;
		overflow: visible; // Изменено с hidden на visible для видимости на мобильных
		box-shadow: 0 0 4px rgba(255, 255, 255, 0.1); // Добавляем тень для лучшей видимости
		visibility: visible !important;
		opacity: 1 !important;

		// Улучшаем видимость на мобильных устройствах
		@media (max-width: 640px) {
			border-width: 1.5px;
			background: rgba(0, 0, 0, 0.5);
			box-shadow: 0 0 6px rgba(255, 255, 255, 0.15);
		}

		@media (max-width: 480px) {
			border-width: 2px;
			background: rgba(0, 0, 0, 0.6);
			box-shadow: 0 0 8px rgba(255, 255, 255, 0.2);
		}
	}

	&__fill {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		width: 100%;
		border-radius: 0 0 5px 5px;
		transition:
			height 0.25s ease,
			background-color 0.2s ease;
		// Улучшаем видимость заполнения на мобильных устройствах
		box-shadow: 0 -2px 4px rgba(0, 0, 0, 0.3);
		visibility: visible !important;
		opacity: 1 !important;
		// Минимальная высота для видимости даже при малом заполнении
		min-height: 2px;

		@media (max-width: 640px) {
			box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.4);
			min-height: 3px;
		}

		@media (max-width: 480px) {
			box-shadow: 0 -3px 8px rgba(0, 0, 0, 0.5);
			min-height: 4px;
		}
	}
}

.game-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	width: 100%;
	max-width: 475px;
	margin: 0 auto;
	gap: 5px;
	/* Убираем flex-wrap, чтобы элементы не переносились на новую строку */
	flex-wrap: nowrap;
	/* Оптимизация для предотвращения пересчета layout при изменении размеров canvas */
	will-change: contents;
	contain: layout style;
	/* Минимальная ширина для предотвращения сжатия */
	min-width: 0;

	@media (max-width: 360px) {
		gap: 3px;
	}

	@media (max-width: 320px) {
		gap: 2px;
	}

	&__exit {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		background: linear-gradient(
			135deg,
			rgba(255, 255, 255, 0.2) 0%,
			rgba(255, 255, 255, 0.1) 100%
		);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		touch-action: manipulation;
		flex-shrink: 0;
		box-shadow:
			0 4px 12px rgba(0, 0, 0, 0.25),
			0 0 0 1px rgba(255, 255, 255, 0.1),
			inset 0 1px 2px rgba(255, 255, 255, 0.2);
		padding: 0;

		&:hover {
			background: linear-gradient(
				135deg,
				rgba(255, 255, 255, 0.3) 0%,
				rgba(255, 255, 255, 0.2) 100%
			);
			transform: scale(1.1);
			box-shadow:
				0 6px 20px rgba(0, 0, 0, 0.35),
				0 0 0 1px rgba(255, 255, 255, 0.15),
				inset 0 1px 3px rgba(255, 255, 255, 0.3);
			border-color: rgba(255, 255, 255, 0.5);
		}

		&:active {
			transform: scale(0.95);
			box-shadow:
				0 2px 8px rgba(0, 0, 0, 0.25),
				inset 0 1px 2px rgba(255, 255, 255, 0.2);
		}

		@media (max-width: 640px) {
			width: 40px;
			height: 40px;
		}

		@media (max-width: 360px) {
			width: 36px;
			height: 36px;
			border-radius: 10px;
		}

		@media (max-width: 320px) {
			width: 32px;
			height: 32px;
			border-radius: 8px;
		}
	}

	&__exit-icon {
		width: 24px;
		height: 24px;
		color: white;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));

		@media (max-width: 640px) {
			width: 20px;
			height: 20px;
		}

		@media (max-width: 360px) {
			width: 18px;
			height: 18px;
		}

		@media (max-width: 320px) {
			width: 16px;
			height: 16px;
		}
	}

	&__time,
	&__score,
	&__wave {
		font-size: clamp(0.875rem, 3vw, 1rem);
		font-weight: 800;
		color: #ffffff;
		padding: 0.45rem 0.9rem;
		background: rgba(255, 255, 255, 0.15);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border-radius: 18px;
		border: 1.5px solid rgba(255, 255, 255, 0.25);
		box-shadow:
			0 4px 16px rgba(0, 0, 0, 0.3),
			inset 0 1px 0 rgba(255, 255, 255, 0.25);
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
		white-space: nowrap;
		flex-shrink: 0;
		flex-grow: 0;
		min-width: fit-content;
		will-change: transform;
		contain: layout style paint;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		transition: all 0.2s ease;

		@media (max-width: 360px) {
			font-size: clamp(0.75rem, 2.5vw, 0.875rem);
			padding: 0.35rem 0.65rem;
			border-radius: 14px;
			gap: 0.25rem;
		}

		@media (max-width: 320px) {
			font-size: clamp(0.7rem, 2vw, 0.8rem);
			padding: 0.3rem 0.5rem;
			border-radius: 12px;
			gap: 0.2rem;
		}
	}

	&__icon {
		font-size: 1.1em;
		line-height: 1;
		display: inline-block;
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));

		@media (max-width: 360px) {
			font-size: 1em;
		}

		@media (max-width: 320px) {
			font-size: 0.95em;
		}
	}
}

.game-canvas {
	/* Размеры устанавливаются через JavaScript для точного контроля */
	width: 100% !important;
	height: auto !important;
	max-width: 100%;
	display: block !important;
	visibility: visible !important;
	opacity: 1 !important;
	background: transparent;
	image-rendering: -webkit-optimize-contrast;
	image-rendering: crisp-edges;
	touch-action: manipulation;
	-webkit-tap-highlight-color: transparent;
	/* Предотвращаем изменение размера при изменении ориентации */
	box-sizing: border-box;
	/* Предотвращаем растяжение на мобильных устройствах */
	object-fit: contain;
	flex-shrink: 0;
	position: relative;
	z-index: 1;
}

.game-message-toast {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 9;
	pointer-events: none;

	&__panel {
		background: linear-gradient(
			135deg,
			rgba(249, 115, 22, 0.95) 0%,
			rgba(234, 88, 12, 0.95) 100%
		);
		border: 2px solid rgba(255, 255, 255, 0.4);
		border-radius: 12px;
		padding: 1rem 1.5rem;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
		text-align: center;
	}

	&__text {
		font-size: clamp(1.1rem, 4vw, 1.35rem);
		font-weight: 700;
		color: white;
		text-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
		margin-bottom: 0.35rem;
	}

	&__bonus {
		font-size: clamp(1.25rem, 4.5vw, 1.5rem);
		font-weight: 800;
		color: #fde047;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
	}
}

.toast-fade-enter-active,
.toast-fade-leave-active {
	transition: opacity 0.25s ease;
}
.toast-fade-enter-from,
.toast-fade-leave-to {
	opacity: 0;
}

.game-overlay {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.75);
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 10;
	animation: game-overlay-fade 0.35s ease-out;

	&__content {
		background: linear-gradient(
			160deg,
			rgba(30, 27, 75, 0.97) 0%,
			rgba(49, 46, 129, 0.95) 50%,
			rgba(30, 27, 75, 0.97) 100%
		);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		padding: clamp(2rem, 5vw, 2.75rem) clamp(2rem, 5vw, 3rem);
		border-radius: 28px;
		max-width: min(500px, 80vw);
		width: 70%;
		text-align: center;
		color: white;
		border: 2px solid rgba(255, 255, 255, 0.18);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.2),
			0 24px 60px rgba(0, 0, 0, 0.7),
			0 0 0 1px rgba(255, 255, 255, 0.06);
		animation: game-overlay-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) 0.05s both;
	}

	&__icon {
		width: 68px;
		height: 68px;
		margin: 0 auto 1.15rem;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.8rem;
		font-weight: 700;
		color: #ffffff;
		background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
		border-radius: 50%;
		border: 3px solid rgba(255, 255, 255, 0.3);
		box-shadow:
			0 0 28px rgba(239, 68, 68, 0.5),
			inset 0 1px 0 rgba(255, 255, 255, 0.3);
	}

	&__title {
		margin: 0 0 0.9rem;
		font-size: clamp(1.9rem, 5.5vw, 2.5rem);
		font-weight: 900;
		letter-spacing: -0.02em;
		color: #ffffff;
		text-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
	}

	&__score {
		margin: 0 0 2rem;
		font-size: 1.2rem;
		color: rgba(255, 255, 255, 0.8);
		line-height: 1.5;

		strong {
			font-size: 1.8rem;
			font-weight: 900;
			color: #fde047;
			text-shadow: 0 0 20px rgba(253, 224, 71, 0.5);
		}
	}
}

.column-danger-indicator {
	grid-column: 1;
	grid-row: 2;
	width: 100%;
	box-sizing: border-box;
	pointer-events: none;
	display: flex;
	flex-direction: column;
	gap: 0.3rem;
	padding: 0.35rem 1px 0.3rem;
	border-radius: 12px;
	background: linear-gradient(
		135deg,
		rgba(10, 12, 28, 0.78) 0%,
		rgba(35, 21, 62, 0.74) 100%
	);
	border: 1px solid rgba(255, 255, 255, 0.14);
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
}

.column-danger-indicator__track {
	display: grid;
	grid-template-columns: repeat(6, minmax(0, 1fr));
	gap: 0;
	align-items: end;
	width: 100%;
}

.column-danger-indicator__col {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: flex-end;
	gap: 0;
}

.column-danger-indicator__fill {
	width: calc(100% - 4px);
	margin: 0 auto;
	min-height: 4px;
	border-radius: 4px;
	background: linear-gradient(
		180deg,
		rgba(74, 222, 128, 0.98) 0%,
		rgba(34, 197, 94, 0.82) 100%
	);
	transition:
		height 0.2s ease,
		background-color 0.2s ease,
		transform 0.2s ease;
}

.column-danger-indicator__col--tied .column-danger-indicator__fill {
	background: linear-gradient(
		180deg,
		rgba(250, 204, 21, 0.98) 0%,
		rgba(245, 158, 11, 0.88) 100%
	);
}

.column-danger-indicator__col--active .column-danger-indicator__fill {
	background: linear-gradient(
		180deg,
		rgba(248, 113, 113, 1) 0%,
		rgba(239, 68, 68, 0.95) 100%
	);
	transform: translateY(-1px);
	box-shadow: 0 0 10px rgba(239, 68, 68, 0.45);
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
		transform: scale(0.95) translateY(10px);
	}
	to {
		opacity: 1;
		transform: scale(1) translateY(0);
	}
}

.btn--back {
	padding: clamp(0.75rem, 2vw, 0.875rem) clamp(1rem, 3.5vw, 1.5rem);
	border-radius: clamp(12px, 2.5vw, 14px);
	border: 2px solid rgba(255, 255, 255, 0.3);
	background: linear-gradient(
		135deg,
		rgba(255, 255, 255, 0.2) 0%,
		rgba(255, 255, 255, 0.1) 100%
	);
	backdrop-filter: blur(20px);
	color: white;
	font-size: clamp(0.875rem, 2.5vw, 1rem);
	font-weight: 600;
	cursor: pointer;
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	touch-action: manipulation;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
	position: relative;
	z-index: 1;
	flex-shrink: 0; // Предотвращаем сжатие кнопки
	width: 100%;
	max-width: 200px;
	margin: 0 auto;

	@media (max-width: 640px) {
		padding: clamp(0.65rem, 1.8vw, 0.75rem) clamp(0.9rem, 3vw, 1.25rem);
		font-size: clamp(0.8125rem, 2.2vw, 0.9375rem);
	}

	&:hover {
		transform: translateY(-2px) scale(1.01);
		box-shadow: 0 10px 36px rgba(0, 0, 0, 0.35);
		border-color: rgba(255, 255, 255, 0.5);
	}

	&:active {
		transform: translateY(-1px) scale(1);
	}
}

.btn--restart {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	cursor: pointer;
	transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
	touch-action: manipulation;
	-webkit-tap-highlight-color: transparent;
	background: linear-gradient(135deg, #ff7ad9 0%, #ff4fb0 100%);
	border: 2px solid rgba(255, 255, 255, 0.3);
	padding: 1.1rem 2.5rem;
	font-size: 1.2rem;
	font-weight: 800;
	border-radius: 20px;
	box-shadow:
		0 6px 24px rgba(236, 72, 153, 0.5),
		inset 0 1px 0 rgba(255, 255, 255, 0.35);
	color: #fff;
	text-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);

	&:hover {
		background: linear-gradient(135deg, #ff92e3 0%, #ff6cc4 100%);
		box-shadow:
			0 8px 32px rgba(236, 72, 153, 0.65),
			inset 0 1px 0 rgba(255, 255, 255, 0.4);
		transform: translateY(-3px) scale(1.02);
	}

	&:active {
		transform: scale(0.95);
		box-shadow: 0 2px 12px rgba(236, 72, 153, 0.4);
	}

	&__icon {
		font-size: 1.45rem;
		line-height: 1;
	}
}

.generation-loading {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.75);
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 1.5rem;
	z-index: 100;
	animation: generation-loading-fade 0.3s ease-out;

	&__spinner {
		width: 56px;
		height: 56px;
		border: 5px solid rgba(255, 255, 255, 0.2);
		border-top-color: #ff7ad9;
		border-radius: 50%;
		animation: generation-loading-spin 0.8s linear infinite;
	}

	&__text {
		font-size: 1.1rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.9);
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
	}
}

@keyframes generation-loading-fade {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

@keyframes generation-loading-spin {
	to {
		transform: rotate(360deg);
	}
}

@keyframes danger-pulse {
	0%,
	100% {
		opacity: 0.15;
	}
	50% {
		opacity: 0.25;
	}
}

@keyframes danger-glow {
	0%,
	100% {
		box-shadow:
			0 4px 16px rgba(239, 68, 68, 0.4),
			0 0 0 1px rgba(255, 255, 255, 0.1),
			inset 0 1px 2px rgba(255, 255, 255, 0.2);
	}
	50% {
		box-shadow:
			0 6px 24px rgba(239, 68, 68, 0.6),
			0 0 0 1px rgba(255, 255, 255, 0.15),
			inset 0 1px 3px rgba(255, 255, 255, 0.3);
	}
}
</style>
