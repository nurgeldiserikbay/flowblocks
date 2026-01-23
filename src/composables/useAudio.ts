import { ref } from 'vue'

export const audioList: { [key: string]: string } = {
	CLEAR: '/assets/audio/CLEAR.ogg',
	COMBO_2: '/assets/audio/COMBO_2.ogg',
	COMBO_3: '/assets/audio/COMBO_3.ogg',
	COMBO_4: '/assets/audio/COMBO_4.ogg',
	COMBO_5: '/assets/audio/COMBO_5.ogg',
	GAME_OVER: '/assets/audio/GAME_OVER.mp3',
	MATCH: '/assets/audio/MATCH.ogg',
	MOVE: '/assets/audio/MOVE.ogg',
	SPAWN: '/assets/audio/SPAWN.ogg',
}

const audioActive = ref(true)
const musicActive = ref(true)

let music: { [key: string]: HTMLAudioElement } = {}

// Пул предзагруженных аудио объектов для оптимизации
const audioPool: { [key: string]: HTMLAudioElement[] } = {}
const maxPoolSize = 3 // Максимальное количество копий каждого звука в пуле

// Предзагрузка аудио в пул
function preloadAudio(audioType: string) {
	if (!audioList[audioType] || audioPool[audioType]) return

	audioPool[audioType] = []

	// Создаем несколько копий для возможности одновременного воспроизведения
	for (let i = 0; i < maxPoolSize; i++) {
		const audio = new Audio(audioList[audioType])
		audio.preload = 'auto'
		audio.volume = 1

		// Обработка ошибок загрузки
		audio.addEventListener(
			'error',
			() => {
				console.warn(`Failed to load audio: ${audioType}`)
			},
			{ once: true }
		)

		audioPool[audioType].push(audio)
	}
}

// Предзагружаем все звуки при инициализации
Object.keys(audioList).forEach((key) => {
	preloadAudio(key)
})

export const useAudio = () => {
	function playAudio(audioType: string, anyway: boolean = false) {
		if (!anyway && (!audioActive.value || !audioList[audioType])) return

		// Используем пул вместо создания нового объекта
		if (audioPool[audioType]) {
			// Ищем свободный аудио объект в пуле
			let audio = audioPool[audioType].find(
				(a) => a.paused || a.ended || a.currentTime === 0
			)

			// Если все заняты, используем первый (перезапишем)
			if (!audio) {
				audio = audioPool[audioType][0]
			}

			// Сбрасываем и воспроизводим
			if (audio) {
				audio.currentTime = 0
				audio.volume = audioActive.value ? 1 : 0
				audio.play().catch((err) => {
					// Игнорируем ошибки автовоспроизведения (требуется взаимодействие пользователя)
					if (err.name !== 'NotAllowedError') {
						console.warn('Audio play error:', err)
					}
				})
			}
		} else {
			// Fallback: если пул не инициализирован, создаем временный объект
			preloadAudio(audioType)
			if (audioPool[audioType]) {
				playAudio(audioType, anyway)
			}
		}
	}

	function toggleAudio() {
		audioActive.value = !audioActive.value

		// Обновляем громкость всех аудио в пуле
		Object.values(audioPool).forEach((pool) => {
			pool.forEach((audio) => {
				audio.volume = audioActive.value ? 1 : 0
			})
		})
	}

	function toggleMusic() {
		musicActive.value = !musicActive.value

		if (musicActive.value) {
			Object.entries(music).forEach(([_, audio]) => {
				audio.volume = 0.5
			})
		} else {
			Object.entries(music).forEach(([_, audio]) => {
				audio.volume = 0
			})
		}

		playAudio('tap')
	}

	function play(name: string) {
		if (!audioList[name]) return

		if (musicActive.value) {
			if (music[name]) {
				music[name].play()
				music[name].currentTime = 0
			} else {
				music[name] = new Audio(audioList[name])

				music[name].addEventListener(
					'canplaythrough',
					function () {
						this.play().catch((_: any) => {
							document.addEventListener(
								'click',
								() => {
									this.play()
								},
								{
									once: true,
								}
							)
						})
					},
					false
				)

				music[name].addEventListener(
					'ended',
					function () {
						this.currentTime = 0
						this.play()
					},
					false
				)
				music[name].volume = 0.5
			}
		}
	}

	function stop(name: string) {
		if (music[name]) music[name].pause()
	}

	return {
		audioActive,
		musicActive,
		toggleAudio,
		playAudio,
		toggleMusic,
		play,
		stop,
	}
}
