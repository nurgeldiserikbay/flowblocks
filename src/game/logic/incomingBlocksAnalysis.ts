/**
 * Решение о модалке «новые блоки» и mid-wave спавне.
 * Только подсчёт плиток: без симуляции swap/slide.
 *
 * Показать модалку и спавн, если:
 * — на поле всего плиток меньше MIN (линию из MIN собрать нельзя), или
 * — ни у одного из присутствующих цветов нет ≥ MIN плиток (нет цвета, из которого теоретически можно собрать линию).
 */

import type { Cube } from './types'
import { getCube, WIDTH } from './grid'
import { MIN_BLOCKS_FOR_LINE_MATCH } from './matchConstants'

export type IncomingBlocksReason =
	| 'TOTAL_BLOCKS_LT_3'
	| 'NO_COLOR_WITH_MIN_COUNT'
	| 'COUNTS_OK'

export interface IncomingBlocksAnalysis {
	shouldShowIncomingModal: boolean
	reason: IncomingBlocksReason
	totalBlocks: number
	countsByColor: ReadonlyMap<number, number>
	/** Цвета с числом плиток ≥ MIN_BLOCKS_FOR_LINE_MATCH */
	colorsWithMinimumBlocks: readonly number[]
}

/** Один проход: сумма и гистограмма по цветам */
export function scanGridBlockStats(grid: (Cube | null)[][]): {
	totalBlocks: number
	countsByColor: Map<number, number>
} {
	const countsByColor = new Map<number, number>()
	let totalBlocks = 0
	const h = grid.length
	for (let r = 0; r < h; r++) {
		for (let c = 0; c < WIDTH; c++) {
			const cube = getCube(grid, r, c)
			if (!cube) continue
			totalBlocks++
			countsByColor.set(cube.color, (countsByColor.get(cube.color) ?? 0) + 1)
		}
	}
	return { totalBlocks, countsByColor }
}

export function groupBlocksByColor(
	grid: (Cube | null)[][],
): ReadonlyMap<number, number> {
	return scanGridBlockStats(grid).countsByColor
}

export function getColorsWithMinimumBlocks(
	countsByColor: ReadonlyMap<number, number>,
	minCount: number = MIN_BLOCKS_FOR_LINE_MATCH,
): number[] {
	const out: number[] = []
	for (const [color, n] of countsByColor) {
		if (n >= minCount) out.push(color)
	}
	return out
}

/** true, если по счётчикам нужен немедленный refill (без проверки ходов) */
export function isRefillForcedByCounts(grid: (Cube | null)[][]): boolean {
	return analyzeIncomingBlocks(grid).shouldShowIncomingModal
}

export function analyzeIncomingBlocks(
	grid: (Cube | null)[][],
): IncomingBlocksAnalysis {
	const { totalBlocks, countsByColor } = scanGridBlockStats(grid)
	const colorsWithMinimumBlocks = getColorsWithMinimumBlocks(
		countsByColor,
		MIN_BLOCKS_FOR_LINE_MATCH,
	)

	if (totalBlocks < MIN_BLOCKS_FOR_LINE_MATCH) {
		return {
			shouldShowIncomingModal: true,
			reason: 'TOTAL_BLOCKS_LT_3',
			totalBlocks,
			countsByColor,
			colorsWithMinimumBlocks,
		}
	}

	if (colorsWithMinimumBlocks.length === 0) {
		return {
			shouldShowIncomingModal: true,
			reason: 'NO_COLOR_WITH_MIN_COUNT',
			totalBlocks,
			countsByColor,
			colorsWithMinimumBlocks,
		}
	}

	return {
		shouldShowIncomingModal: false,
		reason: 'COUNTS_OK',
		totalBlocks,
		countsByColor,
		colorsWithMinimumBlocks,
	}
}

export function shouldSpawnIncomingBlocks(grid: (Cube | null)[][]): boolean {
	return analyzeIncomingBlocks(grid).shouldShowIncomingModal
}
