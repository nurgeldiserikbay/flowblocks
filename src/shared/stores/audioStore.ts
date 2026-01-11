import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Store для управления звуком
 * Сохраняется в localStorage через pinia-plugin-persistedstate
 */
export const useAudioStore = defineStore(
	'audio',
	() => {
		const isMuted = ref(false)

		function toggleMute() {
			isMuted.value = !isMuted.value
		}

		return {
			isMuted,
			toggleMute,
		}
	},
	{
		persist: true,
	}
)
