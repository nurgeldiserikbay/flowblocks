/**
 * Game controller - coordinates store, logic, and renderer
 */

import type { GameRenderer } from './render/GameRenderer'
import { useGameStore } from '@/shared/stores/gameStore'
import {
	createInitialGrid,
	trySwap,
	trySlide,
	isSupported,
	applyGravityWithFallTracking,
	resolveAfterMove,
	spawnWave,
	calculateRemovalScore,
	calculateChainMultiplier,
	calculateVesselClearBonus,
	calculateTotalScore,
	cloneGrid,
	type Position,
	WIDTH,
	HEIGHT,
} from './logic'
import type { GameEvent } from './logic/types'

export class GameController {
	private renderer: GameRenderer | null = null
	private store = useGameStore()
	private nextCubeId: number = 1
	private timerInterval: number | null = null
	private lastTickTime: number = 0

	constructor(renderer: GameRenderer) {
		this.renderer = renderer
	}

	async startGame(): Promise<void> {
		// Reset store
		this.store.reset()

		// Create initial grid
		const { grid, nextId } = createInitialGrid(1)
		this.nextCubeId = nextId
		this.store.setGrid(grid)

		// Render initial grid
		await this.renderer.renderGrid(grid, this.nextCubeId)

		// Start timer
		this.startTimer()
	}

	private startTimer(): void {
		this.lastTickTime = Date.now()
		this.timerInterval = window.setInterval(() => {
			this.tick()
		}, 1000) // Update every second
	}

	private tick(): void {
		if (this.store.isGameOver || this.store.isLocked) return

		const now = Date.now()
		const dt = (now - this.lastTickTime) / 1000 // seconds
		this.lastTickTime = now

		const newTime = this.store.remainingTime - dt
		this.store.setRemainingTime(newTime)

		if (newTime <= 0) {
			this.onWaveEnd()
		}
	}

	private async onWaveEnd(): Promise<void> {
		if (this.store.isLocked || this.store.isGameOver) return

		this.store.setLocked(true)

		// Reset timer
		this.store.setRemainingTime(this.store.WAVE_DURATION)

		// Spawn wave
		const grid = cloneGrid(this.store.grid)
		const result = spawnWave(grid, this.store.spawnRows, this.nextCubeId)
		this.nextCubeId = result.nextId

		// Update grid (new cubes are already placed)
		this.store.setGrid(grid)

		// Re-render grid first to create sprites for new cubes
		await this.renderer?.renderGrid(grid, this.nextCubeId)

		// Then animate spawn events (falling from above)
		if (this.renderer && result.events.length > 0) {
			await this.renderer.applyEvents(result.events)
		}

		// Update spawn rows: every 4 waves spawnRows += 1 up to max 6
		const newWaveIndex = this.store.waveIndex + 1
		this.store.setWaveIndex(newWaveIndex)
		if (newWaveIndex % 4 === 0 && this.store.spawnRows < 6) {
			this.store.setSpawnRows(this.store.spawnRows + 1)
		}

		// Sync positions after spawn animations
		await this.renderer?.syncGridPositions(grid)

		// Check game over
		if (result.gameOver) {
			this.store.setGameOver(true)
		}

		this.store.setLocked(false)
	}

	async applyUserAction(
		action: 'swap' | 'slide',
		from: Position,
		to: Position
	): Promise<void> {
		if (this.store.isLocked || this.store.isGameOver) return

		this.store.setLocked(true)

		const grid = cloneGrid(this.store.grid)
		let success = false
		let moveEvent: GameEvent | null = null

		// Perform move
		if (action === 'swap') {
			success = trySwap(grid, from, to)
			if (success) {
				// Decrease moves for both cubes
				const cubeA = grid[from.r]?.[from.c]
				const cubeB = grid[to.r]?.[to.c]
				if (cubeA) {
					cubeA.moves = Math.max(0, cubeA.moves - 1)
					// Update moves display immediately
					if (this.renderer) {
						this.renderer.updateCubeMoves(cubeA.id, cubeA.moves)
					}
				}
				if (cubeB) {
					cubeB.moves = Math.max(0, cubeB.moves - 1)
					// Update moves display immediately
					if (this.renderer) {
						this.renderer.updateCubeMoves(cubeB.id, cubeB.moves)
					}
				}
				moveEvent = {
					type: 'swap',
					a: from,
					b: to,
				}
			}
		} else if (action === 'slide') {
			success = trySlide(grid, from, to)
			if (success) {
				const cube = grid[to.r]?.[to.c]
				if (cube) {
					// Decrease moves by 2 for slide
					cube.moves = Math.max(0, cube.moves - 2)
					// Update moves display immediately
					if (this.renderer) {
						this.renderer.updateCubeMoves(cube.id, cube.moves)
					}
					moveEvent = {
						type: 'move',
						from,
						to,
						color: cube.color,
						kind: 'slide',
					}
				}
			}
		}

		if (!success || !moveEvent) {
			this.store.setLocked(false)
			return
		}

		// Animate move first (this updates positions in renderer)
		if (this.renderer) {
			await this.renderer.applyEvents([moveEvent])
		}

		// Update store grid AFTER animation completes
		// This ensures renderer cubePositions are synced with grid before resolveAfterMove
		this.store.setGrid(grid)

		// Positions of moved tiles for match resolution (only matches touching these are removed)
		let checkPositions: Position[] = [from, to]

		// After slide move, check if cube needs to fall
		if (action === 'slide' && success) {
			const cube = grid[to.r]?.[to.c]
			if (cube && !isSupported(grid, to.r, to.c)) {
				// Cube is not supported - apply gravity with fall tracking
				const fallItems = applyGravityWithFallTracking(grid)
				this.store.setGrid(grid)

				// Animate fall if there are fall events
				if (fallItems.length > 0 && this.renderer) {
					const fallEvent: GameEvent = {
						type: 'fall',
						items: fallItems,
					}
					await this.renderer.applyEvents([fallEvent])
					// Sync positions after fall animation
					await this.renderer.syncGridPositions(grid)
				}
				// Use final position of the moved cube after fall for match check
				const ourFallItem = fallItems.find((f) => f.from.r === to.r && f.from.c === to.c)
				if (ourFallItem) {
					checkPositions = [ourFallItem.to]
				}
			}
		}

		// Apply gravity and resolve matches
		// Note: resolveAfterMove works on grid where cubes are already swapped/moved
		// On first check, only matches that touch moved positions are removed
		const resolveResult = resolveAfterMove(grid, checkPositions)
		this.store.setGrid(grid)

		// Calculate score
		if (resolveResult.removedCounts.length > 0) {
			const removalScore = calculateRemovalScore(resolveResult.removedCounts)
			const chainMultiplier = calculateChainMultiplier(resolveResult.chainCount)
			const totalScore = calculateTotalScore(removalScore, chainMultiplier)
			this.store.addScore(totalScore)
		}

		// Apply resolve events (remove, fall, etc.)
		// Note: We don't re-render grid after events because:
		// 1. Remove events already remove sprites by ID
		// 2. Fall events already animate sprites to new positions
		// 3. Re-rendering would recreate all sprites and lose animations
		// Only sync positions after animations complete
		if (this.renderer && resolveResult.events.length > 0) {
			await this.renderer.applyEvents(resolveResult.events)
			// After animations, sync positions with grid state
			// This will update positions of cubes that moved due to gravity
			// animateRemove already removed cubes from maps, so syncGridPositions won't try to remove them again
			await this.renderer.syncGridPositions(grid)
		}

		// Check for vessel clear bonus
		let isEmpty = true
		for (let r = 0; r < HEIGHT; r++) {
			for (let c = 0; c < WIDTH; c++) {
				if (grid[r]?.[c]) {
					isEmpty = false
					break
				}
			}
			if (!isEmpty) break
		}

		if (isEmpty) {
			const clearBonus = calculateVesselClearBonus(
				this.store.remainingTime,
				this.store.WAVE_DURATION,
				this.store.waveIndex
			)
			this.store.addScore(clearBonus)
		}

		this.store.setLocked(false)
	}

	private async applyEvents(events: GameEvent[]): Promise<void> {
		if (!this.renderer) return

		// Apply animations
		await this.renderer.applyEvents(events)

		// Sync positions after events (don't recreate all sprites)
		await this.renderer.syncGridPositions(this.store.grid)
	}

	stop(): void {
		if (this.timerInterval) {
			window.clearInterval(this.timerInterval)
			this.timerInterval = null
		}
	}

	destroy(): void {
		this.stop()
		this.renderer?.destroy()
		this.renderer = null
	}
}
