import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Difficulty } from '@/features/game/core/types'

/**
 * Store для прогресса игры (открытые уровни)
 * Сохраняется в localStorage
 */
export const useProgressStore = defineStore(
	'progress',
	() => {
		// unlockedLevel[difficulty] = максимальный открытый уровень (1-based)
		const unlockedLevel = ref<Record<Difficulty, number>>({
			easy: 1,
			normal: 1,
			hard: 1,
		})

		function getUnlockedLevel(difficulty: Difficulty): number {
			return unlockedLevel.value[difficulty] ?? 1
		}

		function isLevelUnlocked(difficulty: Difficulty, level: number): boolean {
			return level <= getUnlockedLevel(difficulty)
		}

		function unlockLevel(difficulty: Difficulty, level: number) {
			const current = getUnlockedLevel(difficulty)
			if (level > current) {
				unlockedLevel.value[difficulty] = level
			}
		}

		function reset() {
			unlockedLevel.value = {
				easy: 1,
				normal: 1,
				hard: 1,
			}
		}

		return {
			unlockedLevel,
			getUnlockedLevel,
			isLevelUnlocked,
			unlockLevel,
			reset,
		}
	},
	{
		persist: true,
	}
)
