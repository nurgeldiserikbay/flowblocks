import type { GameState } from '../types'
import { countTiles } from '../state'

/**
 * Calculate finish bonus for Level Mode
 * clearRatio = (N0 - Nleft) / N0
 * finishBonus = round(K * (clearRatio^P)), P=4
 * perfectBonus = (Nleft==0) ? K2 : 0
 */
export function calculateFinishBonus(
	state: GameState,
	initialTileCount: number,
	K: number = 1000,
	K2: number = 5000
): { finishBonus: number; perfectBonus: number } {
	if (state.config.mode !== 'level') {
		return { finishBonus: 0, perfectBonus: 0 }
	}

	const Nleft = countTiles(state)
	const clearRatio = (initialTileCount - Nleft) / initialTileCount
	const P = 4

	const finishBonus = Math.round(K * Math.pow(clearRatio, P))
	const perfectBonus = Nleft === 0 ? K2 : 0

	return { finishBonus, perfectBonus }
}
