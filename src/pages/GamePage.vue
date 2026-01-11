<template>
	<AppLayout>
		<template #title>
			<div class="game-header">
				<div class="game-header__time">{{ formattedTime }}</div>
				<div class="game-header__score">Score: {{ score }}</div>
			</div>
		</template>

		<div class="game-page">
			<div class="game-page__canvas-container">
				<canvas ref="canvas" class="game-canvas"></canvas>
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
		</div>
	</AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, useTemplateRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '@/shared/components/AppLayout.vue'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import { GameControl } from '@/game'
import { useAudio } from '@/composables/useAudio'
import { createGame } from '@/features/game/core/game'
import type {
	GameConfig,
	GameState,
	Difficulty,
	GameMode,
} from '@/features/game/core/types'
import { getLevelConfig } from '@/entities/level/levelConfig'

const route = useRoute()
const router = useRouter()
const { playAudio } = useAudio()

const mode = (route.query.mode as GameMode) || 'endless'
const level = route.query.level
	? parseInt(route.query.level as string)
	: undefined
const difficulty = (route.query.difficulty as Difficulty) || 'normal'

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
let gameControl: InstanceType<typeof GameControl> | null = null
let resizeHandler: (() => void) | null = null
let gameState: GameState | null = null

const score = ref(0)
const elapsedSeconds = ref(0)
const isExitDialogOpen = ref(false)
let timeInterval: number | null = null

/**
 * Получить количество цветов на основе сложности
 */
function getNumColors(difficulty: Difficulty): number {
	switch (difficulty) {
		case 'easy':
			// Easy: 4-5 цветов, выбираем случайно
			return Math.random() < 0.5 ? 4 : 5
		case 'normal':
			return 6
		case 'hard':
			// Hard: 7-8 цветов, выбираем случайно
			return Math.random() < 0.5 ? 7 : 8
		default:
			return 6
	}
}

/**
 * Создать конфигурацию игры на основе режима и уровня
 */
function createGameConfig(): GameConfig {
	if (mode === 'level' && level) {
		// Level Mode
		const levelConfig = getLevelConfig(level)
		if (!levelConfig) {
			throw new Error(`Level ${level} not found`)
		}

		return {
			width: 8, // Фиксированная ширина для Level Mode
			height: levelConfig.rows,
			mode: 'level',
			difficulty,
			numColors: getNumColors(difficulty),
		}
	} else {
		// Endless Mode
		const height = 40 + Math.floor(Math.random() * 21) // 40-60 рядов
		return {
			width: 10, // Рекомендуемая ширина для Endless Mode
			height,
			mode: 'endless',
			difficulty,
			numColors: getNumColors(difficulty),
		}
	}
}

const formattedTime = computed(() => {
	const minutes = Math.floor(elapsedSeconds.value / 60)
	const seconds = elapsedSeconds.value % 60
	return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
		2,
		'0'
	)}`
})

onMounted(() => {
	// Start time timer
	timeInterval = window.setInterval(() => {
		elapsedSeconds.value++
	}, 1000)

	// Initialize canvas size
	const initCanvas = () => {
		if (!canvas.value) return

		const container = canvas.value.parentElement
		if (!container) return

		const containerRect = container.getBoundingClientRect()
		const maxWidth = Math.min(containerRect.width - 32, 800)
		const maxHeight = Math.min(containerRect.height - 32, 1200)

		canvas.value.width = maxWidth
		canvas.value.height = maxHeight
	}

	// Wait for next tick to ensure DOM is ready
	setTimeout(() => {
		if (canvas.value) {
			initCanvas()
			playAudio('start')

			try {
				// Создать конфигурацию игры
				const gameConfig = createGameConfig()

				// Инициализировать игру
				gameState = createGame(gameConfig)

				// Обновить начальный счет
				score.value = gameState.score

				gameControl = new GameControl({
					canvas: canvas.value,
					controls: {
						gameStart: () => {
							playAudio('again')
						},
						setScore: (
							_tilesCount: number,
							_overlapArea?: number,
							_tileArea?: number
						) => {
							// Update score from game state
							if (gameState) {
								score.value = gameState.score
							}
						},
						end: () => {
							handleExit()
						},
					},
				})

				gameControl.start()
				gameControl.adaptive()

				// Handle resize
				resizeHandler = () => {
					initCanvas()
					gameControl?.adaptive()
				}
				window.addEventListener('resize', resizeHandler, { passive: true })
			} catch (error) {
				console.error('Failed to initialize game:', error)
				// Fallback: still create GameControl even if game init fails
				gameControl = new GameControl({
					canvas: canvas.value,
					controls: {
						gameStart: () => {
							playAudio('again')
						},
						setScore: () => {},
						end: () => {
							handleExit()
						},
					},
				})
				gameControl.start()
				gameControl.adaptive()
			}
		}
	}, 100)
})

onBeforeUnmount(() => {
	if (timeInterval) {
		window.clearInterval(timeInterval)
		timeInterval = null
	}
	if (resizeHandler) {
		window.removeEventListener('resize', resizeHandler)
		resizeHandler = null
	}
	if (gameControl) {
		gameControl.destroy()
		gameControl = null
	}
	gameState = null
})

function showExitDialog() {
	isExitDialogOpen.value = true
}

function handleExit() {
	router.push('/')
}
</script>

<style lang="scss" scoped>
// Override AppLayout background for game page
:deep(.app-layout) {
	background: transparent;
}

.game-page {
	flex: 1;
	display: flex;
	flex-direction: column;
	padding: 1rem;
	gap: 1rem;
	position: relative;
	overflow: hidden;

	&__canvas-container {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 400px;
		max-height: calc(100dvh - 200px);
		border-radius: 20px;
		overflow: hidden;
		backdrop-filter: blur(20px);
		box-shadow: inset 0 4px 32px rgba(0, 0, 0, 0.5),
			0 8px 32px rgba(0, 0, 0, 0.3);
		border: 2px solid rgba(255, 255, 255, 0.3);
		padding: 1rem;
		position: relative;
		z-index: 1;

		@media (max-width: 640px) {
			min-height: 300px;
			max-height: calc(100dvh - 180px);
			border-radius: 16px;
			padding: 0.75rem;
		}
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
	&__score {
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
	height: 100%;
	max-width: 100%;
	max-height: 100%;
	display: block;
	background: rgba(0, 0, 0, 0.3);
	border-radius: 16px;
	image-rendering: pixelated;
	image-rendering: -moz-crisp-edges;
	image-rendering: crisp-edges;
	touch-action: none;

	@media (max-width: 640px) {
		border-radius: 12px;
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
	overflow: hidden;

	&::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(
			135deg,
			rgba(239, 68, 68, 0.3) 0%,
			rgba(220, 38, 38, 0.3) 100%
		);
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	&:hover {
		transform: translateY(-4px) scale(1.02);
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
		border-color: rgba(255, 255, 255, 0.5);

		&::before {
			opacity: 1;
		}
	}

	&:active {
		transform: translateY(-2px) scale(1);
	}

	&--game {
		max-width: 200px;
		margin: 0 auto;
		width: 100%;
		position: relative;
		z-index: 1;
	}

	@media (max-width: 640px) {
		padding: clamp(0.875rem, 2vw, 1rem) 1.25rem;
		border-radius: 12px;
	}
}
</style>
