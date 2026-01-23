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
			<div class="game-page__play-area">
				<MomentumScroll
					ref="momentumScrollRef"
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

				<div v-if="!gameStore.isGameOver" class="level-indicator" :title="`До верха: ${rowsToTop} ряд.`">
					<div class="level-indicator__label">{{ rowsToTop }}</div>
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
const isExitDialogOpen = ref(false)

let gameController: GameController | null = null
let renderer: GameRenderer | null = null
let resizeHandler: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null
let orientationHandler: (() => void) | null = null
let orientationListener: { remove: () => void } | null = null
let resizeTimeout: ReturnType<typeof setTimeout> | null = null
let pointerMoveHandler: ((e: PointerEvent) => void) | null = null
let touchMoveHandler: ((e: TouchEvent) => void) | null = null

// Drag state for input handling
let dragStart: { r: number; c: number } | null = null
let dragStartClient: { x: number; y: number } | null = null
// First block selected by click (for swap on second click)
let selectedForSwap: { r: number; c: number } | null = null
let isDragging = false

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
	const containerWidth = container?.getBoundingClientRect().width ?? canvas.value.width
	const newTileSize = Math.max(containerWidth, 320) / WIDTH
	// forceUpdatePositions = true гарантирует, что все позиции будут пересчитаны даже если tileSize не изменился
	// Передаем gridHeight для правильного расчета позиций снизу
	// Это важно при расширении сосуда, когда canvas становится выше, но tileSize остается тем же
	renderer.updateTileSize(newTileSize, true, gridHeight)
	
	// Передаем gridHeight для правильного расчета позиций при изменении размера canvas
	renderer.resizeCanvas(canvas.value.width, canvas.value.height, gridHeight)
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
	const containerRect = container.getBoundingClientRect()
	const maxWidth = Math.max(containerRect.width, 320) // Минимум 320px для мобильных
	// Используем фактическую высоту grid, а не gameStore.getHeight()
	// Это важно, чтобы высота канваса всегда соответствовала фактической высоте grid
	const h = gameStore.grid?.length ?? gameStore.getHeight()

	// Всегда делим на WIDTH (8) для получения размера плитки
	const tileSize = maxWidth / WIDTH
	const canvasHeight = h * tileSize

	// Устанавливаем CSS размеры (логические пиксели)
	canvas.value.style.width = `${maxWidth}px`
	canvas.value.style.height = `${canvasHeight}px`
	canvas.value.style.display = 'block'
	
	// Устанавливаем внутренние размеры canvas (физические пиксели)
	// С autoDensity: true PixiJS будет использовать эти размеры и автоматически масштабировать
	const devicePixelRatio = window.devicePixelRatio || 1
	canvas.value.width = maxWidth * devicePixelRatio
	canvas.value.height = canvasHeight * devicePixelRatio
}

function getPositionFromEvent(e: MouseEvent | TouchEvent | PointerEvent): { r: number; c: number } | null {
	if (!canvas.value) return null

	const rect = canvas.value.getBoundingClientRect()
	
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

	// Координаты относительно canvas (getBoundingClientRect учитывает все трансформации и скролл)
	const x = clientX - rect.left
	const y = clientY - rect.top

	// Используем внутренние размеры canvas для точного расчета
	// Это важно для правильного преобразования координат
	const devicePixelRatio = window.devicePixelRatio || 1
	const logicalWidth = canvas.value.width / devicePixelRatio
	const logicalHeight = canvas.value.height / devicePixelRatio
	const tileSize = logicalWidth / WIDTH
	
	// Преобразуем координаты с учетом масштаба между CSS и внутренними размерами
	const scaleX = logicalWidth / rect.width
	const scaleY = logicalHeight / rect.height
	const canvasX = x * scaleX
	const canvasY = y * scaleY
	
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

	const pos = getPositionFromEvent(e)
	if (pos) {
		dragStart = pos
		// Highlight selected tile
		if (gameStore.grid[pos.r]?.[pos.c]) {
			renderer?.setSelectedPosition(pos.r, pos.c)
		} else {
			renderer?.setSelectedPosition(null, null)
		}
	}
}

function handlePointerUp(e: MouseEvent | TouchEvent | PointerEvent): void {
	if (!dragStart || gameStore.isLocked || gameStore.isGameOver) {
		dragStart = null
		dragStartClient = null
		isDragging = false
		return
	}

	// Предотвращаем скролл при взаимодействии с canvas
	if (e instanceof PointerEvent) {
		e.preventDefault()
		e.stopPropagation()
		// Освобождаем pointer
		if (canvas.value && e.pointerId !== undefined) {
			canvas.value.releasePointerCapture(e.pointerId)
		}
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
}

onMounted(async () => {
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
		const containerWidth = container?.getBoundingClientRect().width ?? canvas.value.width
		const tileSize = Math.max(containerWidth, 320) / WIDTH // Минимум 320px для мобильных
		
		renderer = new GameRenderer({
			canvas: canvas.value,
			tileSize,
		})

		await renderer.init()

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

			// Предотвращаем скролл при движении по canvas
			e.preventDefault()
			e.stopPropagation()

			// Проверяем, было ли движение достаточно большим для свайпа
			const dx = Math.abs(e.clientX - dragStartClient.x)
			const dy = Math.abs(e.clientY - dragStartClient.y)
			const threshold = 10 // Порог в пикселях для определения свайпа

			if (dx > threshold || dy > threshold) {
				isDragging = true
				
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

			// Предотвращаем скролл при свайпе по canvas
			e.preventDefault()
			e.stopPropagation()

			if (e.touches.length > 0) {
				const touch = e.touches[0]
				// Проверяем, было ли движение достаточно большим для свайпа
				const dx = Math.abs(touch.clientX - dragStartClient!.x)
				const dy = Math.abs(touch.clientY - dragStartClient!.y)
				const threshold = 10 // Порог в пикселях для определения свайпа

				if (dx > threshold || dy > threshold) {
					isDragging = true
					
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
				
				// Для мобильных устройств нужно дать время браузеру обновить размеры после изменения ориентации
				// Используем requestAnimationFrame для получения актуальных размеров
				await new Promise((resolve) => requestAnimationFrame(resolve))
				await new Promise((resolve) => requestAnimationFrame(resolve))
				await new Promise((resolve) => setTimeout(resolve, 50))
				
				// Пересчитываем canvas с правильной шириной
				initCanvas()
				
				// Всегда используем ширину canvas / WIDTH для размера плитки
				const newTileSize = canvas.value.width / WIDTH
				if (renderer && newTileSize > 0) {
					renderer.updateTileSize(newTileSize)
					renderer.resizeCanvas(canvas.value.width, canvas.value.height)
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
	gap: 1rem;
	position: relative;
	overflow: hidden;

	@media (max-width: 640px) {
		padding-left: clamp(0.5rem, 1.5vw, 0.75rem);
		padding-right: clamp(0.5rem, 1.5vw, 0.75rem);
	}

	&__play-area {
		display: flex;
		align-items: stretch;
		gap: 0.5rem;
		flex: 1;
		min-height: 400px;
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
		align-items: center;
		justify-content: center;
		width: 100%;
	}
}

.level-indicator {
	display: flex;
	flex-direction: column;
	align-items: center;
	width: 1.25rem;
	flex-shrink: 0;
	gap: 0.25rem;

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
	flex-wrap: wrap;

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
