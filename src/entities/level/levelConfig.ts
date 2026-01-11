/**
 * Level Mode Configuration
 *
 * Прогрессия уровней для Level Mode:
 * - Ширина поля: W = 8 кубиков (фиксированная)
 * - Всего уровней: 50
 * - Level 1: 128 кубиков → H = 16 рядов
 * - Level 50: 2000 кубиков → H = 250 рядов
 *
 * Логика роста рядов:
 * - Первые 11 переходов (Level 1 → Level 12): +4 ряда на каждый уровень
 *   Level 1 → 2: +4, Level 2 → 3: +4, ..., Level 11 → 12: +4
 *   Level 12 = 16 + 11*4 = 60 рядов
 *
 * - Оставшиеся 38 переходов (Level 12 → Level 50): +5 рядов на каждый уровень
 *   Level 12 → 13: +5, Level 13 → 14: +5, ..., Level 49 → 50: +5
 *   Level 50 = 60 + 38*5 = 250 рядов
 *
 * Проверка: 16 + 44 + 190 = 250 ✓
 *
 * Формула для tiles: tiles = rows * 8 (ширина фиксированная)
 */

export type LevelConfig = {
	level: number
	rows: number // H - высота поля в рядах
	tiles: number // rows * 8 - общее количество кубиков
}

/**
 * Конфигурация всех 50 уровней для Level Mode
 * Массив строго возрастающий по rows и tiles
 */
export const LEVEL_CONFIGS: LevelConfig[] = [
	// Первые 11 переходов: +4 ряда на уровень
	{ level: 1, rows: 16, tiles: 128 }, // 16 + 0*4
	{ level: 2, rows: 20, tiles: 160 }, // 16 + 1*4
	{ level: 3, rows: 24, tiles: 192 }, // 16 + 2*4
	{ level: 4, rows: 28, tiles: 224 }, // 16 + 3*4
	{ level: 5, rows: 32, tiles: 256 }, // 16 + 4*4
	{ level: 6, rows: 36, tiles: 288 }, // 16 + 5*4
	{ level: 7, rows: 40, tiles: 320 }, // 16 + 6*4
	{ level: 8, rows: 44, tiles: 352 }, // 16 + 7*4
	{ level: 9, rows: 48, tiles: 384 }, // 16 + 8*4
	{ level: 10, rows: 52, tiles: 416 }, // 16 + 9*4
	{ level: 11, rows: 56, tiles: 448 }, // 16 + 10*4
	{ level: 12, rows: 60, tiles: 480 }, // 16 + 11*4 = 60

	// Оставшиеся 38 переходов: +5 рядов на уровень
	{ level: 13, rows: 65, tiles: 520 }, // 60 + 1*5
	{ level: 14, rows: 70, tiles: 560 }, // 60 + 2*5
	{ level: 15, rows: 75, tiles: 600 }, // 60 + 3*5
	{ level: 16, rows: 80, tiles: 640 }, // 60 + 4*5
	{ level: 17, rows: 85, tiles: 680 }, // 60 + 5*5
	{ level: 18, rows: 90, tiles: 720 }, // 60 + 6*5
	{ level: 19, rows: 95, tiles: 760 }, // 60 + 7*5
	{ level: 20, rows: 100, tiles: 800 }, // 60 + 8*5
	{ level: 21, rows: 105, tiles: 840 }, // 60 + 9*5
	{ level: 22, rows: 110, tiles: 880 }, // 60 + 10*5
	{ level: 23, rows: 115, tiles: 920 }, // 60 + 11*5
	{ level: 24, rows: 120, tiles: 960 }, // 60 + 12*5
	{ level: 25, rows: 125, tiles: 1000 }, // 60 + 13*5
	{ level: 26, rows: 130, tiles: 1040 }, // 60 + 14*5
	{ level: 27, rows: 135, tiles: 1080 }, // 60 + 15*5
	{ level: 28, rows: 140, tiles: 1120 }, // 60 + 16*5
	{ level: 29, rows: 145, tiles: 1160 }, // 60 + 17*5
	{ level: 30, rows: 150, tiles: 1200 }, // 60 + 18*5
	{ level: 31, rows: 155, tiles: 1240 }, // 60 + 19*5
	{ level: 32, rows: 160, tiles: 1280 }, // 60 + 20*5
	{ level: 33, rows: 165, tiles: 1320 }, // 60 + 21*5
	{ level: 34, rows: 170, tiles: 1360 }, // 60 + 22*5
	{ level: 35, rows: 175, tiles: 1400 }, // 60 + 23*5
	{ level: 36, rows: 180, tiles: 1440 }, // 60 + 24*5
	{ level: 37, rows: 185, tiles: 1480 }, // 60 + 25*5
	{ level: 38, rows: 190, tiles: 1520 }, // 60 + 26*5
	{ level: 39, rows: 195, tiles: 1560 }, // 60 + 27*5
	{ level: 40, rows: 200, tiles: 1600 }, // 60 + 28*5
	{ level: 41, rows: 205, tiles: 1640 }, // 60 + 29*5
	{ level: 42, rows: 210, tiles: 1680 }, // 60 + 30*5
	{ level: 43, rows: 215, tiles: 1720 }, // 60 + 31*5
	{ level: 44, rows: 220, tiles: 1760 }, // 60 + 32*5
	{ level: 45, rows: 225, tiles: 1800 }, // 60 + 33*5
	{ level: 46, rows: 230, tiles: 1840 }, // 60 + 34*5
	{ level: 47, rows: 235, tiles: 1880 }, // 60 + 35*5
	{ level: 48, rows: 240, tiles: 1920 }, // 60 + 36*5
	{ level: 49, rows: 245, tiles: 1960 }, // 60 + 37*5
	{ level: 50, rows: 250, tiles: 2000 }, // 60 + 38*5 = 250
]

/**
 * Получить конфигурацию уровня по номеру
 * @param level - номер уровня (1-50)
 * @returns конфигурация уровня или undefined, если уровень не найден
 */
export function getLevelConfig(level: number): LevelConfig | undefined {
	return LEVEL_CONFIGS.find((config) => config.level === level)
}

/**
 * Проверка корректности конфигурации уровней
 * @returns true если конфигурация валидна
 */
export function validateLevelConfigs(): boolean {
	// Проверка количества уровней
	if (LEVEL_CONFIGS.length !== 50) {
		console.error(`Expected 50 levels, got ${LEVEL_CONFIGS.length}`)
		return false
	}

	// Проверка первого и последнего уровня
	const first = LEVEL_CONFIGS[0]
	const last = LEVEL_CONFIGS[49]

	if (first.level !== 1 || first.rows !== 16 || first.tiles !== 128) {
		console.error(
			`Invalid first level: expected {level: 1, rows: 16, tiles: 128}, got`,
			first
		)
		return false
	}

	if (last.level !== 50 || last.rows !== 250 || last.tiles !== 2000) {
		console.error(
			`Invalid last level: expected {level: 50, rows: 250, tiles: 2000}, got`,
			last
		)
		return false
	}

	// Проверка возрастающей последовательности и правильности tiles
	for (let i = 0; i < LEVEL_CONFIGS.length; i++) {
		const config = LEVEL_CONFIGS[i]

		// Проверка номера уровня
		if (config.level !== i + 1) {
			console.error(
				`Invalid level number at index ${i}: expected ${i + 1}, got ${
					config.level
				}`
			)
			return false
		}

		// Проверка формулы tiles = rows * 8
		if (config.tiles !== config.rows * 8) {
			console.error(
				`Invalid tiles at level ${config.level}: expected ${
					config.rows * 8
				}, got ${config.tiles}`
			)
			return false
		}

		// Проверка возрастающей последовательности
		if (i > 0) {
			const prev = LEVEL_CONFIGS[i - 1]
			if (config.rows <= prev.rows) {
				console.error(
					`Non-increasing rows at level ${config.level}: previous was ${prev.rows}, current is ${config.rows}`
				)
				return false
			}
			if (config.tiles <= prev.tiles) {
				console.error(
					`Non-increasing tiles at level ${config.level}: previous was ${prev.tiles}, current is ${config.tiles}`
				)
				return false
			}

			// Проверка прогрессии: первые 11 переходов +4, остальные +5
			const rowsDiff = config.rows - prev.rows
			const expectedDiff = config.level <= 12 ? 4 : 5

			if (rowsDiff !== expectedDiff) {
				console.error(
					`Invalid rows progression at level ${config.level}: expected +${expectedDiff}, got +${rowsDiff}`
				)
				return false
			}
		}
	}

	return true
}
