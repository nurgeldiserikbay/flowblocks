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
					<h2>Game Over</h2>
					<p>Final Score: {{ gameStore.score }}</p>
					<button class="btn btn--restart" @click="restart">Restart</button>
				</div>
			</div>
		</div>
	</AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, useTemplateRef, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import AppLayout from '@/shared/components/AppLayout.vue'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import MomentumScroll from '@/shared/components/MomentumScroll.vue'
import { GameRenderer } from '@/game/render'
import { GameController } from '@/game/GameController'
import { useGameStore } from '@/shared/stores/gameStore'
import { WIDTH, HEIGHT } from '@/game/logic'

const router = useRouter()
const gameStore = useGameStore()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const momentumScrollRef = useTemplateRef<InstanceType<typeof MomentumScroll>>('momentumScroll')
const isExitDialogOpen = ref(false)

let gameController: GameController | null = null
let renderer: GameRenderer | null = null
let resizeHandler: (() => void) | null = null

// Drag state for input handling
let dragStart: { r: number; c: number } | null = null

const formattedTime = computed(() => {
	const time = Math.max(0, Math.floor(gameStore.remainingTime))
	const seconds = time % 60
	return `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})

function initCanvas(): void {
	if (!canvas.value) return

	const container = canvas.value.parentElement
	if (!container) return

	const containerRect = container.getBoundingClientRect()
	const maxWidth = Math.min(containerRect.width, 800)

	const tileSize = maxWidth / WIDTH
	const canvasHeight = HEIGHT * tileSize

	canvas.value.width = maxWidth
	canvas.value.height = canvasHeight
}

function getPositionFromEvent(e: MouseEvent | TouchEvent): { r: number; c: number } | null {
	if (!canvas.value) return null

	const rect = canvas.value.getBoundingClientRect()
	const scrollOffset = momentumScrollRef.value?.getScrollTop() ?? 0
	const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
	const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

	const x = clientX - rect.left
	const y = clientY - rect.top + scrollOffset

	const tileSize = canvas.value.width / WIDTH
	const c = Math.floor(x / tileSize)
	const r = Math.floor(y / tileSize)

	if (r >= 0 && r < HEIGHT && c >= 0 && c < WIDTH) {
		return { r, c }
	}

	return null
}

function handlePointerDown(e: MouseEvent | TouchEvent): void {
	if (gameStore.isLocked || gameStore.isGameOver) return

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

function handlePointerUp(e: MouseEvent | TouchEvent): void {
	if (!dragStart || gameStore.isLocked || gameStore.isGameOver) return

	const pos = getPositionFromEvent(e)
	if (!pos) {
		dragStart = null
		renderer?.setSelectedPosition(null, null)
		return
	}

	// Determine action
	const dr = pos.r - dragStart.r
	const dc = pos.c - dragStart.c

	if (dr === 0 && dc === 0) {
		// Click on same cell - just select it
		if (gameStore.grid[pos.r]?.[pos.c]) {
			renderer?.setSelectedPosition(pos.r, pos.c)
		} else {
			renderer?.setSelectedPosition(null, null)
		}
		dragStart = null
		return
	}

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

	// Clear selection after move
	renderer?.setSelectedPosition(null, null)
	dragStart = null
}

onMounted(async () => {
	setTimeout(async () => {
		if (!canvas.value) return

		initCanvas()

		// Create renderer
		const tileSize = canvas.value.width / WIDTH
		renderer = new GameRenderer({
			canvas: canvas.value,
			tileSize,
		})

		await renderer.init()

		// Create game controller
		gameController = new GameController(renderer)

		// Set initial scroll position to top
		momentumScrollRef.value?.scrollToTop()

		// Start game
		await gameController.startGame()

		// Setup input handlers
		canvas.value.addEventListener('pointerdown', handlePointerDown)
		canvas.value.addEventListener('pointerup', handlePointerUp)
		canvas.value.addEventListener('touchstart', handlePointerDown, { passive: true })
		canvas.value.addEventListener('touchend', handlePointerUp, { passive: true })

		// Wait for canvas to render
		await nextTick()
		await new Promise((resolve) => requestAnimationFrame(resolve))
		await new Promise((resolve) => requestAnimationFrame(resolve))
		await new Promise((resolve) => requestAnimationFrame(resolve))

		// Update scroll bounds
		momentumScrollRef.value?.updateBounds()

		// Animate scroll to bottom
		await momentumScrollRef.value?.scrollToBottomAnimated(1.5, 3000)

		// Handle resize
		resizeHandler = () => {
			initCanvas()
			const newTileSize = canvas.value ? canvas.value.width / WIDTH : 0
			renderer?.updateTileSize(newTileSize)
			renderer?.renderGrid(gameStore.grid, 1)
			momentumScrollRef.value?.updateBounds()
		}
		window.addEventListener('resize', resizeHandler, { passive: true })
	}, 100)
})

onBeforeUnmount(() => {
	if (resizeHandler) {
		window.removeEventListener('resize', resizeHandler)
		resizeHandler = null
	}

	if (canvas.value) {
		canvas.value.removeEventListener('pointerdown', handlePointerDown)
		canvas.value.removeEventListener('pointerup', handlePointerUp)
		canvas.value.removeEventListener('touchstart', handlePointerDown)
		canvas.value.removeEventListener('touchend', handlePointerUp)
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
	padding: 1rem 2rem;
	gap: 1rem;
	position: relative;
	overflow: hidden;

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
	width: 100%;
	height: auto;
	max-width: 100%;
	display: block;
	background: rgba(0, 0, 0, 0.3);
	image-rendering: pixelated;
	image-rendering: -moz-crisp-edges;
	image-rendering: crisp-edges;
	touch-action: manipulation;
	-webkit-tap-highlight-color: transparent;
}

.game-overlay {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.8);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 10;

	&__content {
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(20px);
		padding: 2rem;
		border-radius: 16px;
		text-align: center;
		color: white;

		h2 {
			margin: 0 0 1rem;
			font-size: 2rem;
		}

		p {
			margin: 0 0 1.5rem;
			font-size: 1.25rem;
		}
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

	&--restart {
		background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
		border-color: rgba(147, 197, 253, 0.4);
		padding: 1rem 2rem;
		font-size: 1.125rem;

		&:hover {
			background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
		}
	}
}
</style>
