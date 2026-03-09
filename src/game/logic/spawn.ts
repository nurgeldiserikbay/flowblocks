/**
 * Spawn wave: shift down and fill top rows
 *
 * КРИТИЧНО: Правильная последовательность операций:
 * 1. Применяем гравитацию к существующим кубам
 * 2. Создаем новые кубы
 * 3. Применяем гравитацию к новым кубам (создаем события fall)
 * 4. Создаем событие spawn для новых кубов
 * 5. Проверяем матчи ПОСЛЕ завершения анимации spawn (вызывается отдельно через checkMatchesAfterSpawn)
 *    ВАЖНО: Удаляем только те матчи, которые включают новые кубы. Старые кубы, которые создавали пары до спавна, остаются.
 *
 * КРИТИЧНО: Проверка матчей теперь происходит ПОСЛЕ завершения всех анимаций спавна и падения,
 * чтобы пользователь видел, что плитки установились правильно перед проверкой совпадений.
 *
 * КРИТИЧНО: События разделены на две группы:
 * - events: события до проверки матчей после spawn (включая spawn)
 * - eventsAfterSpawnCheck: события проверки матчей после spawn (должны обрабатываться после завершения анимации spawn)
 */

import type { Cube, GameEvent, SpawnResult, Position } from './types'
import { WIDTH, getCube, setCube } from './grid'
import { applyGravityUntilSettled } from './gravity'
import { findMatchesIncludingNewCubes } from './matches'
import { getNumColorsForLevel, rollMovesForLevel } from '@/shared/stores/gameStore'

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

	// КРИТИЧНО: Сохраняем ID существующих кубов ДО создания новых кубов
	// Это нужно для проверки, что матчи содержат И новые И существующие кубы
	const existingCubeIds = new Set<number>()
	for (let r = 0; r < h; r++) {
		for (let c = 0; c < WIDTH; c++) {
			const cube = getCube(grid, r, c)
			if (cube) {
				existingCubeIds.add(cube.id)
			}
		}
	}

	// ========== ЭТАП 2: Создание новых кубов ==========
	// КРИТИЧНО: НЕ удаляем матчи до спавна - плитки, которые создавали пары до спавна, должны оставаться
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
	const newCubes: Array<{
		cube: Cube
		startRow: number
		targetRow: number
		c: number
	}> = []
	for (let spawnIndex = 0; spawnIndex < spawnRows; spawnIndex++) {
		for (let c = 0; c < WIDTH; c++) {
			const targetRow = topRows[c] - spawnRows + spawnIndex

			// Пропускаем если позиция вне границ или занята
			if (
				targetRow < 0 ||
				targetRow >= h ||
				getCube(grid, targetRow, c) !== null
			) {
				continue
			}

			const color = Math.floor(Math.random() * numColors)
			const moves = rollMovesForLevel(level)
			const cube: Cube = { id: nextId++, color, moves }
			const startRow = -spawnRows + spawnIndex
			newCubes.push({ cube, startRow, targetRow, c })

			// Размещаем куб в grid
			setCube(grid, targetRow, c, cube)
		}
	}

	// ========== ЭТАП 3: Гравитация новых кубов ==========
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

	// ========== ЭТАП 4: Создание события spawn ==========
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
		const newCubesFallFiltered = newCubesFall.filter((f) => {
			return newCubes.some(({ cube }) => cube.id === f.id)
		})
		if (newCubesFallFiltered.length > 0) {
			events.push({ type: 'fall', items: newCubesFallFiltered })
		}
	}

	// ========== ЭТАП 5: Подготовка данных для проверки матчей после спавна ==========
	// КРИТИЧНО: Проверка матчей теперь происходит ПОСЛЕ завершения всех анимаций спавна и падения
	// через отдельную функцию checkMatchesAfterSpawn, которая вызывается в GameController
	// Это гарантирует, что пользователь видит, как плитки установились правильно перед проверкой совпадений
	// События проверки матчей будут возвращены пустыми - они будут заполнены позже через checkMatchesAfterSpawn
	const eventsAfterSpawnCheck: GameEvent[] = []

	// ========== ЭТАП 6: Ограничение заполненных строк (если нужно) ==========
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

	// ========== ЭТАП 7: Проверка game over ==========
	// КРИТИЧНО: Проверка gameOver происходит после всех операций спавна, но до проверки матчей
	// Финальная проверка gameOver будет выполнена после проверки матчей в GameController
	let gameOver = false
	for (let c = 0; c < WIDTH; c++) {
		if (getCube(grid, 0, c) !== null) {
			gameOver = true
			break
		}
	}

	// Собираем ID новых кубов для проверки матчей позже
	const newCubeIds = new Set<number>(newCubes.map(({ cube }) => cube.id))

	return {
		events,
		eventsAfterSpawnCheck,
		gameOver,
		nextId,
		newCubeIds,
		existingCubeIds,
	}
}

/**
 * Проверка матчей после спавна - вызывается ПОСЛЕ завершения всех анимаций спавна и падения
 * Это гарантирует, что пользователь видит, как плитки установились правильно перед проверкой совпадений
 */
export function checkMatchesAfterSpawn(
	grid: (Cube | null)[][],
	newCubeIds: Set<number>,
	existingCubeIds: Set<number>
): GameEvent[] {
	const events: GameEvent[] = []
	const h = grid.length

	// Получаем финальные позиции новых кубов после гравитации
	const newCubesFinalPositions: Position[] = []
	for (let r = 0; r < h; r++) {
		for (let c = 0; c < WIDTH; c++) {
			const cube = getCube(grid, r, c)
			if (cube && newCubeIds.has(cube.id)) {
				newCubesFinalPositions.push({ r, c })
			}
		}
	}

	// Проверяем матчи только среди тех, которые включают новые кубы
	let checkPositions: Position[] = newCubesFinalPositions
	let hasChanges = true

	// КРИТИЧНО: Защита от бесконечного цикла
	// Максимальное количество итераций каскада (разумный лимит для предотвращения зависания)
	const MAX_CASCADE_ITERATIONS = 100
	let iterations = 0

	// Создаем копию newCubeIds для отслеживания оставшихся новых кубов
	const remainingNewCubeIds = new Set(newCubeIds)

	while (
		hasChanges &&
		checkPositions.length > 0 &&
		remainingNewCubeIds.size > 0 &&
		iterations < MAX_CASCADE_ITERATIONS
	) {
		hasChanges = false
		iterations++

		// КРИТИЧНО: Используем функцию, которая находит только матчи, включающие И новые И существующие кубы
		// Это гарантирует, что исчезают только пары из новых и существующих плиток
		const matches = findMatchesIncludingNewCubes(
			grid,
			checkPositions,
			remainingNewCubeIds,
			existingCubeIds
		)

		if (matches.length > 0) {
			hasChanges = true
			const removeCells: Array<{
				r: number
				c: number
				color: number
				id: number
				moves: number
			}> = []

			// Удаляем матчи и удаляем удаленные новые кубы из remainingNewCubeIds
			for (const { r, c } of matches) {
				const cube = getCube(grid, r, c)
				if (cube) {
					removeCells.push({
						r,
						c,
						color: cube.color,
						id: cube.id,
						moves: cube.moves,
					})
					// Если это новый куб, удаляем его из remainingNewCubeIds
					if (remainingNewCubeIds.has(cube.id)) {
						remainingNewCubeIds.delete(cube.id)
					}
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

				// Для следующей итерации проверяем только позиции, где находятся оставшиеся новые кубы
				// Находим текущие позиции всех оставшихся новых кубов в grid
				const remainingNewCubePositions: Position[] = []
				for (let r = 0; r < h; r++) {
					for (let c = 0; c < WIDTH; c++) {
						const cube = getCube(grid, r, c)
						if (cube && remainingNewCubeIds.has(cube.id)) {
							remainingNewCubePositions.push({ r, c })
						}
					}
				}
				// Также добавляем позиции упавших кубов, если среди них есть новые кубы
				for (const fallItem of nextFall) {
					if (remainingNewCubeIds.has(fallItem.id)) {
						remainingNewCubePositions.push(fallItem.to)
					}
				}
				checkPositions = remainingNewCubePositions
			} else {
				// Если ничего не упало, проверяем оставшиеся новые кубы
				const remainingNewCubePositions: Position[] = []
				for (let r = 0; r < h; r++) {
					for (let c = 0; c < WIDTH; c++) {
						const cube = getCube(grid, r, c)
						if (cube && remainingNewCubeIds.has(cube.id)) {
							remainingNewCubePositions.push({ r, c })
						}
					}
				}
				checkPositions = remainingNewCubePositions
			}
		} else {
			// Если матчей нет, прекращаем каскад
			checkPositions = []
		}
	}

	// Предупреждение если достигнут лимит итераций
	if (iterations >= MAX_CASCADE_ITERATIONS && hasChanges) {
		console.warn(
			'[checkMatchesAfterSpawn] Maximum cascade iterations reached after spawn, stopping to prevent infinite loop'
		)
	}

	// КРИТИЧНО: Проверка gameOver после проверки матчей (матчи могут изменить состояние grid)
	// Проверяем верхнюю строку - если там есть кубы, игра окончена
	for (let c = 0; c < WIDTH; c++) {
		if (getCube(grid, 0, c) !== null) {
			events.push({ type: 'gameover' })
			break
		}
	}

	return events
}
