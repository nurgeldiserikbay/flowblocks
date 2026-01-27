/**
 * Check if there are any possible moves that can create matches
 */

import type { Cube, Position } from './types'
import { getCube, WIDTH, isAdjacent, swapCubes, setCube } from './grid'
import { findMatches } from './matches'

/**
 * Check if swapping two cubes would create a match
 */
function wouldCreateMatchAfterSwap(
	grid: (Cube | null)[][],
	a: Position,
	b: Position
): boolean {
	// Clone grid to test swap
	const testGrid = grid.map((row) => (row ? [...row] : []))
	
	// Perform swap
	const cubeA = getCube(testGrid, a.r, a.c)
	const cubeB = getCube(testGrid, b.r, b.c)
	if (!cubeA || !cubeB) return false
	
	testGrid[a.r][a.c] = cubeB
	testGrid[b.r][b.c] = cubeA
	
	// Check for matches
	const matches = findMatches(testGrid)
	return matches.length > 0
}

/**
 * Check if sliding a cube would create a match
 * IMPORTANT: After slide, gravity is applied, so we need to check matches after gravity
 */
function wouldCreateMatchAfterSlide(
	grid: (Cube | null)[][],
	from: Position,
	to: Position
): boolean {
	// Clone grid to test slide
	const testGrid = grid.map((row) => (row ? [...row] : []))
	
	const cube = getCube(testGrid, from.r, from.c)
	if (!cube) return false
	
	// Perform slide
	setCube(testGrid, from.r, from.c, null)
	setCube(testGrid, to.r, to.c, cube)
	
	// Apply gravity (cubes fall after slide)
	const h = testGrid.length
	for (let c = 0; c < WIDTH; c++) {
		const cubes: Array<Cube> = []
		for (let r = h - 1; r >= 0; r--) {
			const cube = getCube(testGrid, r, c)
			if (cube) cubes.push(cube)
		}
		// Clear column
		for (let r = 0; r < h; r++) {
			setCube(testGrid, r, c, null)
		}
		// Place cubes back from bottom
		for (let i = 0; i < cubes.length; i++) {
			const targetRow = h - 1 - i
			setCube(testGrid, targetRow, c, cubes[i])
		}
	}
	
	// Check for matches after gravity
	const matches = findMatches(testGrid)
	return matches.length > 0
}

/**
 * Рекурсивно проверяет, может ли кубик создать комбинацию после последовательности ходов
 * Проверяет как swap, так и slide ходы
 * @param testGrid - копия grid для тестирования
 * @param cubeId - ID кубика для отслеживания
 * @param cubePos - текущая позиция кубика
 * @param remainingMoves - оставшиеся ходы кубика
 * @param visited - множество посещенных позиций для избежания циклов
 * @param maxDepth - максимальная глубина рекурсии (для оптимизации)
 */
function canCreateMatchWithMoves(
	testGrid: (Cube | null)[][],
	cubeId: number,
	cubePos: Position,
	remainingMoves: number,
	visited: Set<string>,
	maxDepth: number
): boolean {
	if (remainingMoves === 0 || maxDepth <= 0) {
		return false
	}

	const h = testGrid.length
	const directions: Position[] = [
		{ r: 0, c: -1 }, // left
		{ r: 0, c: 1 },  // right
		{ r: -1, c: 0 }, // up
		{ r: 1, c: 0 },  // down
	]

	const cube = getCube(testGrid, cubePos.r, cubePos.c)
	if (!cube || cube.id !== cubeId || cube.moves === 0) {
		return false
	}

	const posKey = `${cubePos.r},${cubePos.c}`
	
	// Пропускаем уже посещенные позиции (избегаем циклов)
	if (visited.has(posKey)) {
		return false
	}

	visited.add(posKey)

	// Проверяем все возможные ходы из текущей позиции
	for (const dir of directions) {
		const toR = cubePos.r + dir.r
		const toC = cubePos.c + dir.c

		// Check bounds
		if (toR < 0 || toR >= h || toC < 0 || toC >= WIDTH) {
			continue
		}

		const to: Position = { r: toR, c: toC }
		const targetCube = getCube(testGrid, toR, toC)

		// Try swap if target has a cube
		if (targetCube && isAdjacent(cubePos, to)) {
			// Клонируем grid для тестирования swap
			const swapGrid = testGrid.map((row) => (row ? [...row] : []))
			const cubeA = getCube(swapGrid, cubePos.r, cubePos.c)
			const cubeB = getCube(swapGrid, toR, toC)
			if (cubeA && cubeB && cubeA.id === cubeId) {
				// Perform swap
				swapGrid[cubePos.r][cubePos.c] = cubeB
				swapGrid[toR][toC] = cubeA
				
				// Проверяем, создает ли swap комбинацию
				const matches = findMatches(swapGrid)
				if (matches.length > 0) {
					visited.delete(posKey)
					return true
				}

				// Если комбинации нет, но есть еще ходы, проверяем рекурсивно
				// КРИТИЧНО: Проверяем даже если remainingMoves = 1, так как после swap может быть гравитация
				// и это может создать комбинацию в следующем ходе
				if (remainingMoves > 0 && maxDepth > 1) {
					// После swap кубик находится в позиции to
					// Учитываем, что после swap moves уменьшается на 1 (или на 2, если cubeB.moves = 0)
					const movesDecrease = cubeB.moves === 0 ? 2 : 1
					const newRemainingMoves = Math.max(0, remainingMoves - movesDecrease)
					if (newRemainingMoves > 0) {
						const newCube = { ...cubeA, moves: newRemainingMoves }
						swapGrid[toR][toC] = newCube
						if (canCreateMatchWithMoves(swapGrid, cubeId, to, newRemainingMoves, visited, maxDepth - 1)) {
							visited.delete(posKey)
							return true
						}
					}
				}
			}
		}

		// Try slide if target is empty and horizontally adjacent
		if (!targetCube && dir.r === 0 && Math.abs(dir.c) === 1) {
			// Клонируем grid для тестирования slide
			const slideGrid = testGrid.map((row) => (row ? [...row] : []))
			const cube = getCube(slideGrid, cubePos.r, cubePos.c)
			if (!cube || cube.id !== cubeId) continue

			// Perform slide
			setCube(slideGrid, cubePos.r, cubePos.c, null)
			setCube(slideGrid, toR, toC, cube)

			// Apply gravity (cubes fall after slide)
			for (let c = 0; c < WIDTH; c++) {
				const cubes: Array<Cube> = []
				for (let r = h - 1; r >= 0; r--) {
					const cube = getCube(slideGrid, r, c)
					if (cube) cubes.push(cube)
				}
				// Clear column
				for (let r = 0; r < h; r++) {
					setCube(slideGrid, r, c, null)
				}
				// Place cubes back from bottom
				for (let i = 0; i < cubes.length; i++) {
					const targetRow = h - 1 - i
					setCube(slideGrid, targetRow, c, cubes[i])
				}
			}

			// Находим новую позицию кубика после гравитации
			let newPos: Position | null = null
			for (let r = h - 1; r >= 0; r--) {
				const cubeAtPos = getCube(slideGrid, r, toC)
				if (cubeAtPos && cubeAtPos.id === cubeId) {
					newPos = { r, c: toC }
					break
				}
			}

			if (newPos) {
				// Проверяем, создает ли slide комбинацию после гравитации
				const matches = findMatches(slideGrid)
				if (matches.length > 0) {
					visited.delete(posKey)
					return true
				}

				// Если комбинации нет, но есть еще ходы, проверяем рекурсивно
				if (remainingMoves > 1) {
					const newCube = { ...cube, moves: cube.moves - 1 }
					setCube(slideGrid, newPos.r, newPos.c, newCube)
					if (canCreateMatchWithMoves(slideGrid, cubeId, newPos, remainingMoves - 1, visited, maxDepth - 1)) {
						visited.delete(posKey)
						return true
					}
				}
			}
		}
	}

	visited.delete(posKey)
	return false
}

/**
 * Check if there are any possible moves that can create matches
 * A possible move is:
 * - Swap: cube A has moves > 0, swap with adjacent cube B, creates match (immediately or after sequence)
 * - Slide: cube A has moves > 0, slide to adjacent empty cell, creates match (immediately or after sequence)
 * КРИТИЧНО: Проверяет возможность создания комбинации после последовательности ходов,
 * а не только после одного хода
 */
export function hasPossibleMoves(grid: (Cube | null)[][]): boolean {
	const h = grid.length
	const directions: Position[] = [
		{ r: 0, c: -1 }, // left
		{ r: 0, c: 1 },  // right
		{ r: -1, c: 0 }, // up
		{ r: 1, c: 0 },  // down
	]

	// Сначала проверяем, есть ли хотя бы один кубик с ходами > 0
	// Это оптимизация для случаев с малым количеством кубиков
	let hasCubesWithMoves = false
	for (let r = 0; r < h; r++) {
		for (let c = 0; c < WIDTH; c++) {
			const cube = getCube(grid, r, c)
			if (cube && cube.moves > 0) {
				hasCubesWithMoves = true
				break
			}
		}
		if (hasCubesWithMoves) break
	}

	// Если нет кубиков с ходами, то и возможных ходов нет
	if (!hasCubesWithMoves) {
		return false
	}

	// Check every cube for possible moves
	// КРИТИЧНО: Проверяем ВСЕ кубики с ходами, не останавливаемся на первом найденном
	for (let r = 0; r < h; r++) {
		for (let c = 0; c < WIDTH; c++) {
			const cube = getCube(grid, r, c)
			if (!cube || cube.moves === 0) {
				continue // Cannot start move from this cube
			}

			// Сначала проверяем простые случаи (один ход создает комбинацию)
			// Это оптимизация - быстрая проверка перед рекурсивной
			for (const dir of directions) {
				const toR = r + dir.r
				const toC = c + dir.c

				// Check bounds
				if (toR < 0 || toR >= h || toC < 0 || toC >= WIDTH) {
					continue
				}

				const from: Position = { r, c }
				const to: Position = { r: toR, c: toC }
				const targetCube = getCube(grid, toR, toC)

				// Try swap if target has a cube
				if (targetCube && isAdjacent(from, to)) {
					if (wouldCreateMatchAfterSwap(grid, from, to)) {
						return true
					}
				}

				// Try slide if target is empty and horizontally adjacent
				if (!targetCube && dir.r === 0 && Math.abs(dir.c) === 1) {
					if (wouldCreateMatchAfterSlide(grid, from, to)) {
						return true
					}
				}
			}

			// Если простые случаи не сработали, проверяем последовательности ходов (swap и slide)
			// КРИТИЧНО: Проверяем даже если moves = 1, так как может быть комбинация после гравитации
			// Ограничиваем глубину рекурсии для оптимизации
			const maxDepth = Math.min(cube.moves, 5) // Максимум 5 уровней рекурсии
			if (maxDepth >= 1) {
				const testGrid = grid.map((row) => (row ? [...row] : []))
				const visited = new Set<string>()
				if (canCreateMatchWithMoves(testGrid, cube.id, { r, c }, cube.moves, visited, maxDepth)) {
					return true
				}
			}
		}
	}

	return false
}

/**
 * Count total number of cubes on the grid
 */
export function countCubes(grid: (Cube | null)[][]): number {
	let count = 0
	for (let r = 0; r < grid.length; r++) {
		for (let c = 0; c < WIDTH; c++) {
			if (getCube(grid, r, c) !== null) {
				count++
			}
		}
	}
	return count
}

/**
 * Check if grid is empty (no cubes)
 */
export function isGridEmpty(grid: (Cube | null)[][]): boolean {
	for (let r = 0; r < grid.length; r++) {
		for (let c = 0; c < WIDTH; c++) {
			if (getCube(grid, r, c) !== null) {
				return false
			}
		}
	}
	return true
}
