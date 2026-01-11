import type { GameState, GameConfig, MoveResult, GameAction } from './types'
import { createGameState, countTiles } from './state'
import { isSwapLegal, performSwap } from './rules/swap'
import {
	findMatchesAround,
	findAllMatches,
	removeMatchedTiles,
} from './rules/match'
import { applyGravity } from './rules/gravity'
import { spawnNewTiles } from './rules/spawn'
import { updateCombo } from './rules/combo'
import { addScore } from './rules/scoring'
import { calculateFinishBonus } from './rules/finishBonus'
import { hasAnyPossibleMove } from './rules/hasMoves'
import { generateGrid } from './generator/generateGrid'
import { getMovesRange } from './rules/spawn'

/**
 * Create initial game state with generated grid if needed
 */
export function createGame(config: GameConfig): GameState {
	// If no initial grid provided, generate one
	if (!config.initialGrid) {
		const movesRange = getMovesRange(config.difficulty)
		config.initialGrid = generateGrid(
			config.width,
			config.height,
			config.numColors,
			movesRange
		)
	}

	return createGameState(config)
}

/**
 * Apply a move (swap) and handle all cascades, gravity, spawn, scoring
 * Returns actions list for renderer
 */
export function applyMove(
	state: GameState,
	fromX: number,
	fromY: number,
	toX: number,
	toY: number,
	rng: () => number = Math.random
): MoveResult {
	const actions: GameAction[] = []

	// Validate move
	if (!isSwapLegal(state, fromX, fromY, toX, toY)) {
		return {
			success: false,
			actions: [],
			newState: state,
		}
	}

	// Update elapsed time
	state.elapsedTime = Date.now() - state.startTime

	// Perform swap (cost is always paid)
	const swapResult = performSwap(state, fromX, fromY, toX, toY)
	const fromTile = swapResult.newState.grid[fromX][fromY]
	const toTile = swapResult.newState.grid[toX][toY]

	// Create swap action
	actions.push({
		type: 'swap',
		aId: toTile?.id ?? 0, // Swapped tile (moved from fromX,fromY)
		bId: fromTile?.id ?? 0, // Target tile (moved from toX,toY)
		aFrom: { x: fromX, y: fromY },
		aTo: { x: toX, y: toY },
		bFrom: { x: toX, y: toY },
		bTo: { x: fromX, y: fromY },
		cost: swapResult.cost,
		aMovesAfter: swapResult.aMovesAfter,
	})

	// Get initial tile count for level mode finish bonus (from state or calculate)
	const initialTileCount = state.initialTileCount ?? countTiles(state)

	// Check for matches after swap
	let hasMatches = true
	let isFirstCheck = true

	// Cascade loop: keep resolving matches until no more matches
	while (hasMatches) {
		let matches: Set<string>

		if (isFirstCheck) {
			// First iteration: check around swapped positions only (optimized)
			matches = findMatchesAround(state, [
				{ x: fromX, y: fromY },
				{ x: toX, y: toY },
			])
			isFirstCheck = false
		} else {
			// Cascade: check entire grid after gravity/spawn
			matches = findAllMatches(state)
		}

		if (matches.size === 0) {
			hasMatches = false
			break
		}

		// Remove matched tiles
		const removed = removeMatchedTiles(state, matches)

		if (removed.length === 0) {
			hasMatches = false
			break
		}

		// Update combo
		updateCombo(state)

		// Calculate and add score
		const totalMoves = removed.reduce((sum, tile) => sum + tile.moves, 0)
		const scoreResult = addScore(state, removed.length, totalMoves)

		// Create remove action
		actions.push({
			type: 'remove',
			ids: removed.map((t) => t.id),
			positions: removed.map((t) => t.position),
		})

		// Create score action
		actions.push({
			type: 'score',
			add: scoreResult.add,
			total: scoreResult.total,
			combo: state.combo,
		})

		// Create combo action
		actions.push({
			type: 'combo',
			combo: state.combo,
			endsAt: state.comboEndsAt,
		})

		// Apply gravity
		const gravityAction = applyGravity(state)
		if (gravityAction) {
			actions.push(gravityAction)
		}

		// Spawn new tiles (Endless Mode only)
		const spawnAction = spawnNewTiles(state, rng)
		if (spawnAction) {
			actions.push(spawnAction)
		}

		// Continue cascade - check again after gravity and spawn in next iteration
	}

	// Update elapsed time
	state.elapsedTime = Date.now() - state.startTime

	// Check game end conditions
	if (state.config.mode === 'level') {
		const tilesLeft = countTiles(state)
		if (tilesLeft === 0) {
			// Cleared level
			const { finishBonus, perfectBonus } = calculateFinishBonus(
				state,
				initialTileCount
			)
			const finalScore = state.score + finishBonus + perfectBonus
			state.finalScore = finalScore
			state.isEnded = true
			state.endReason = 'cleared'

			actions.push({
				type: 'end',
				reason: 'cleared',
				finalScore,
				stats: {
					timeMs: state.elapsedTime,
					leftTiles: 0,
				},
			})
		} else if (!hasAnyPossibleMove(state)) {
			// No possible moves
			const { finishBonus, perfectBonus } = calculateFinishBonus(
				state,
				initialTileCount
			)
			const finalScore = state.score + finishBonus + perfectBonus
			state.finalScore = finalScore
			state.isEnded = true
			state.endReason = 'no_moves'

			actions.push({
				type: 'end',
				reason: 'no_moves',
				finalScore,
				stats: {
					timeMs: state.elapsedTime,
					leftTiles: tilesLeft,
				},
			})
		}
	} else {
		// Endless Mode
		if (!hasAnyPossibleMove(state)) {
			state.finalScore = state.score
			state.isEnded = true
			state.endReason = 'no_moves'

			actions.push({
				type: 'end',
				reason: 'no_moves',
				finalScore: state.score,
				stats: {
					timeMs: state.elapsedTime,
					leftTiles: countTiles(state),
				},
			})
		}
	}

	return {
		success: true,
		actions,
		newState: state,
	}
}

/**
 * Get current game stats
 */
export function getGameStats(state: GameState): {
	score: number
	combo: number
	elapsedTime: number
	tilesLeft: number
	isEnded: boolean
} {
	return {
		score: state.score,
		combo: state.combo,
		elapsedTime: state.elapsedTime,
		tilesLeft: countTiles(state),
		isEnded: state.isEnded,
	}
}
