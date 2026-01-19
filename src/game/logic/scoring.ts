/**
 * Scoring logic
 *
 * - Base: (moves + 5) per tile when it disappears
 * - Combo: extra points when tiles disappear in quick succession (invisible timer)
 * - Vessel clear: bonus = WIDTH * height when grid is fully empty before next spawn
 */

import { WIDTH } from './grid'

/** Base score per removal batch: sum of (moves + 5) for each cell */
export function calculateBaseRemovalScore(cells: { moves: number }[]): number {
	return cells.reduce((sum, c) => sum + (c.moves + 5), 0)
}

/** Combo bonus: comboLevel * 6 * tileCount. comboLevel 0 = no bonus (first in chain). */
export function calculateComboBonus(comboLevel: number, tileCount: number): number {
	if (comboLevel <= 0) return 0
	return comboLevel * 6 * tileCount
}

/** Vessel clear bonus when grid is fully empty before spawn: size of vessel */
export function getVesselClearBonus(grid: (unknown | null)[][]): number {
	return WIDTH * grid.length
}
