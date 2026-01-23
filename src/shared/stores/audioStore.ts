import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { AudioManager } from '@/game/audio/AudioManager'

/**
 * Store для управления звуком
 * Сохраняется в localStorage через pinia-plugin-persistedstate
 */
export const useAudioStore = defineStore(
	'audio',
	() => {
		const isMuted = ref(false)

		// Синхронизируем с AudioManager при загрузке
		const savedEnabled = localStorage.getItem('soundEnabled')
		if (savedEnabled !== null) {
			isMuted.value = savedEnabled !== 'true'
		}

		const isEnabled = computed(() => !isMuted.value)

		function toggleMute() {
			isMuted.value = !isMuted.value
			AudioManager.setEnabled(!isMuted.value)
		}

		function setEnabled(value: boolean) {
			isMuted.value = !value
			AudioManager.setEnabled(value)
		}

		return {
			isMuted,
			isEnabled,
			toggleMute,
			setEnabled,
		}
	},
	{
		persist: true,
	}
)
