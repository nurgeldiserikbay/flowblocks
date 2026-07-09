/**
 * Scoring logic
 *
 * - Base: (moves + 5) per tile when it disappears
 * - Combo: extra points за 2+ исчезновения подряд в одном каскаде (без таймера)
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

/**
 * Уровень звука для шага каскада (1 = MATCH; 2–5 = COMBO_2 … COMBO_5).
 * Подряд = в одной цепочке событий remove после одного хода.
 */
export function soundComboLevelForCascadeStep(
	sizes: readonly number[],
	stepIndex1: number,
): number {
	const k = stepIndex1
	if (k <= 1) return 1

	const a = sizes[0] ?? 0
	const b = sizes[1] ?? 0
	const c = sizes[2] ?? 0

	if (k === 2) {
		if (a === 3 && b === 3) return 2
		if (a >= 3 && b >= 3) return 3
		return 2
	}

	if (k === 3) {
		if (a === 3 && b === 3 && c === 3) return 4
		if (a === 3 && b > 3 && c > 3) return 5
		return 4
	}

	return 5
}

/** Vessel clear bonus when grid is fully empty before spawn: size of vessel */
export function getVesselClearBonus(grid: (unknown | null)[][]): number {
	return WIDTH * grid.length
}

/** Bonus for clearing all cubes: same as vessel clear bonus */
export function getGreatBonus(grid: (unknown | null)[][]): number {
	return getVesselClearBonus(grid)
}

/** Bonus for no moves left: depends on remaining time */
export function getNoMovesBonus(remainingTime: number): number {
	// Бонус пропорционален оставшемуся времени (например, 10 очков за секунду)
	return Math.max(0, Math.floor(remainingTime * 10))
}
