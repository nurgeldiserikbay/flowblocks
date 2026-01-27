/**
 * Spawn wave: shift down and fill top rows
 * 
 * КРИТИЧНО: Правильная последовательность операций:
 * 1. Применяем гравитацию к существующим кубам
 * 2. Удаляем матчи среди существующих кубов (создаем события remove + fall)
 * 3. Создаем новые кубы
 * 4. Применяем гравитацию к новым кубам (создаем события fall)
 * 5. Создаем событие spawn для новых кубов
 * 6. Проверяем матчи среди всех кубов (создаем события remove + fall)
 */

import type { Cube, GameEvent, SpawnResult, Position } from './types'
import { WIDTH, getCube, setCube } from './grid'
import { applyGravityUntilSettled } from './gravity'
import { findMatchesAround, findMatches } from './matches'
import { getNumColorsForLevel } from '@/shared/stores/gameStore'

export function spawnWave(
	grid: (Cube | null)[][],
	spawnRows: number,
	nextId: number,
	level: number = 1,
	maxFilledRows?: number
): SpawnResult {
	const numColors = getNumColorsForLevel(level)
	const events: GameEvent[] = []
	const h = grid.length

	// ========== ЭТАП 1: Гравитация существующих кубов ==========
	// Применяем гравитацию к существующим кубам, чтобы заполнить все дыры
	const initialFall = applyGravityUntilSettled(grid)
	if (initialFall.length > 0) {
		events.push({ type: 'fall', items: initialFall })
	}

	// ========== ЭТАП 2: Удаление матчей среди существующих кубов ==========
	// Проверяем и удаляем матчи ДО спавна новых кубов
	// Это гарантирует правильную очередь: сначала исчезли кубики и упали остальные, потом спавн
	let checkPositions: Position[] = []
	
	// Собираем все позиции существующих кубов для первой проверки
	for (let r = 0; r < h; r++) {
		for (let c = 0; c < WIDTH; c++) {
			if (getCube(grid, r, c) !== null) {
				checkPositions.push({ r, c })
			}
		}
	}
	
	// Удаляем матчи каскадом до полного завершения
	let hasChanges = true
	while (hasChanges && checkPositions.length > 0) {
		hasChanges = false
		const matches = findMatchesAround(grid, checkPositions)
		
		if (matches.length > 0) {
			hasChanges = true
			const removeCells: Array<{ r: number; c: number; color: number; id: number; moves: number }> = []
			
			// Удаляем матчи
			for (const { r, c } of matches) {
				const cube = getCube(grid, r, c)
				if (cube) {
					removeCells.push({ r, c, color: cube.color, id: cube.id, moves: cube.moves })
					setCube(grid, r, c, null)
				}
			}
			
			if (removeCells.length > 0) {
				events.push({ type: 'remove', cells: removeCells })
			}
			
			// Применяем гравитацию после удаления
			const nextFall = applyGravityUntilSettled(grid)
			if (nextFall.length > 0) {
				events.push({ type: 'fall', items: nextFall })
				checkPositions = nextFall.map((f) => f.to)
			} else {
				checkPositions = []
			}
		}
	}

	// ========== ЭТАП 3: Создание новых кубов ==========
	// ТОЛЬКО ПОСЛЕ того как все матчи удалены и кубы упали, создаем новые кубы
	
	// Находим самую верхнюю занятую строку для каждой колонки
	const topRows: number[] = []
	for (let c = 0; c < WIDTH; c++) {
		let topRow = h // Если колонка пустая
		for (let r = 0; r < h; r++) {
			if (getCube(grid, r, c) !== null) {
				topRow = r
				break
			}
		}
		topRows[c] = topRow
	}

	// Создаем новые кубы
	const newCubes: Array<{ cube: Cube; startRow: number; targetRow: number; c: number }> = []
	for (let spawnIndex = 0; spawnIndex < spawnRows; spawnIndex++) {
		for (let c = 0; c < WIDTH; c++) {
			const targetRow = topRows[c] - spawnRows + spawnIndex
			
			// Пропускаем если позиция вне границ или занята
			if (targetRow < 0 || targetRow >= h || getCube(grid, targetRow, c) !== null) {
				continue
			}

			const color = Math.floor(Math.random() * numColors)
			const moves = Math.floor(Math.random() * 9) + 1 // 1-9
			const cube: Cube = { id: nextId++, color, moves }
			const startRow = -spawnRows + spawnIndex
			newCubes.push({ cube, startRow, targetRow, c })
			
			// Размещаем куб в grid
			setCube(grid, targetRow, c, cube)
		}
	}

	// ========== ЭТАП 4: Гравитация новых кубов ==========
	// Применяем гравитацию к новым кубам, чтобы они упали на существующие
	const newCubesFall = applyGravityUntilSettled(grid)
	
	// Создаем карту финальных позиций для новых кубов
	const finalPositions = new Map<number, number>()
	for (const fallItem of newCubesFall) {
		// Проверяем, является ли это новый куб
		for (const { cube } of newCubes) {
			if (cube.id === fallItem.id) {
				finalPositions.set(cube.id, fallItem.to.r)
				break
			}
		}
	}
	// Для кубов, которые не упали (уже были на месте), используем их текущую позицию
	for (const { cube, targetRow } of newCubes) {
		if (!finalPositions.has(cube.id)) {
			// Ищем куб в grid по ID
			for (let r = 0; r < h; r++) {
				for (let c = 0; c < WIDTH; c++) {
					const existingCube = getCube(grid, r, c)
					if (existingCube && existingCube.id === cube.id) {
						finalPositions.set(cube.id, r)
						break
					}
				}
			}
		}
	}

	// ========== ЭТАП 5: Создание события spawn ==========
	// Событие spawn создается ПОСЛЕ удаления всех матчей и падения кубов
	if (newCubes.length > 0) {
		const spawnCells = newCubes.map(({ cube, startRow, targetRow, c }) => ({
			id: cube.id,
			r: finalPositions.get(cube.id) ?? targetRow,
			c,
			color: cube.color,
			fromRow: startRow,
			toRow: finalPositions.get(cube.id) ?? targetRow,
		}))
		events.push({ type: 'spawn', cells: spawnCells })
		
		// Если новые кубы упали, добавляем событие fall для них
		const newCubesFallFiltered = newCubesFall.filter(f => {
			return newCubes.some(({ cube }) => cube.id === f.id)
		})
		if (newCubesFallFiltered.length > 0) {
			events.push({ type: 'fall', items: newCubesFallFiltered })
		}
	}

	// ========== ЭТАП 6: Проверка матчей после спавна (каскад) ==========
	// Проверяем матчи среди всех кубов (включая новые)
	checkPositions = newCubesFall.map((f) => f.to)
	hasChanges = true
	
	while (hasChanges && checkPositions.length > 0) {
		hasChanges = false
		const matches = findMatchesAround(grid, checkPositions)
		
		if (matches.length > 0) {
			hasChanges = true
			const removeCells: Array<{ r: number; c: number; color: number; id: number; moves: number }> = []
			
			// Удаляем матчи
			for (const { r, c } of matches) {
				const cube = getCube(grid, r, c)
				if (cube) {
					removeCells.push({ r, c, color: cube.color, id: cube.id, moves: cube.moves })
					setCube(grid, r, c, null)
				}
			}
			
			if (removeCells.length > 0) {
				events.push({ type: 'remove', cells: removeCells })
			}
			
			// Применяем гравитацию после удаления
			const nextFall = applyGravityUntilSettled(grid)
			if (nextFall.length > 0) {
				events.push({ type: 'fall', items: nextFall })
				checkPositions = nextFall.map((f) => f.to)
			} else {
				checkPositions = []
			}
		}
	}

	// ========== ЭТАП 7: Ограничение заполненных строк (если нужно) ==========
	if (maxFilledRows !== undefined) {
		const targetTopRow = h - maxFilledRows
		
		// Удаляем все кубы выше targetTopRow
		for (let r = 0; r < targetTopRow; r++) {
			for (let c = 0; c < WIDTH; c++) {
				if (getCube(grid, r, c) !== null) {
					setCube(grid, r, c, null)
				}
			}
		}
		
		// Применяем гравитацию
		applyGravityUntilSettled(grid)
		
		// Проверяем еще раз и удаляем кубы выше targetTopRow
		for (let r = 0; r < targetTopRow; r++) {
			for (let c = 0; c < WIDTH; c++) {
				if (getCube(grid, r, c) !== null) {
					setCube(grid, r, c, null)
				}
			}
		}
		
		// Финальная гравитация
		applyGravityUntilSettled(grid)
	}

	// ========== ЭТАП 8: Проверка game over ==========
	let gameOver = false
	for (let c = 0; c < WIDTH; c++) {
		if (getCube(grid, 0, c) !== null) {
			gameOver = true
			break
		}
	}

	if (gameOver) {
		events.push({ type: 'gameover' })
	}

	return { events, gameOver, nextId }
}
