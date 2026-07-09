/**
 * AudioManager - управление звуками игры с использованием @pixi/sound
 */

import { sound } from '@pixi/sound'
import type { IMediaInstance } from '@pixi/sound'
import { audioList } from '@/composables/useAudio'

export type SoundId =
	| 'move'
	| 'match'
	| 'combo2'
	| 'combo3'
	| 'combo4'
	| 'combo5'
	| 'spawn'
	| 'clear'
	| 'gameover'

interface SoundConfig {
	path: string
	category: 'move' | 'match' | 'combo' | 'spawn' | 'clear' | 'gameover'
	throttleMs?: number
	useRandomPitch?: boolean
}

const SOUND_CONFIGS: Record<SoundId, SoundConfig> = {
	move: {
		path: audioList.MOVE,
		category: 'move',
		throttleMs: 70,
		useRandomPitch: true,
	},
	match: {
		path: audioList.MATCH,
		category: 'match',
		throttleMs: 90,
		useRandomPitch: true,
	},
	combo2: {
		path: audioList.COMBO_2,
		category: 'combo',
		throttleMs: 0, // Убираем throttle для звуков комбо, чтобы они не блокировались при каскадных исчезновениях
	},
	combo3: {
		path: audioList.COMBO_3,
		category: 'combo',
		throttleMs: 0,
	},
	combo4: {
		path: audioList.COMBO_4,
		category: 'combo',
		throttleMs: 0,
	},
	combo5: {
		path: audioList.COMBO_5,
		category: 'combo',
		throttleMs: 0,
	},
	spawn: {
		path: audioList.SPAWN,
		category: 'spawn',
		throttleMs: 700,
	},
	clear: {
		path: audioList.CLEAR,
		category: 'clear',
	},
	gameover: {
		path: audioList.GAME_OVER,
		category: 'gameover',
	},
}

class AudioManagerClass {
	private initialized = false
	private enabled = true
	private unlocked = false
	private masterVolume = 0.8

	// Категории громкости
	private categoryVolumes: Record<string, number> = {
		move: 1.0,
		match: 1.0,
		combo: 1.0,
		spawn: 1.0,
		clear: 1.0,
		gameover: 1.0,
	}

	// Throttle timers для защиты от спама
	private throttleTimers: Map<SoundId, number> = new Map()

	// Флаги для once-per-state звуков
	private clearPlayed = false
	private gameoverPlayed = false

	/**
	 * Инициализация: загрузка всех звуков
	 */
	async init(): Promise<void> {
		if (this.initialized) return

		try {
			const loadPromises = Object.entries(SOUND_CONFIGS).map(
				([id, config]) =>
					new Promise<void>((resolve) => {
						try {
							sound.add(id as SoundId, {
								url: config.path,
								preload: true,
								singleInstance: false,
								loaded: (err) => {
									if (err) {
										console.warn(`Failed to load sound ${id}:`, err)
									}
									resolve()
								},
							})
						} catch (err) {
							console.warn(`Failed to add sound ${id}:`, err)
							resolve()
						}
					}),
			)
			await Promise.all(loadPromises)

			// Загружаем состояние из localStorage
			const savedEnabled = localStorage.getItem('soundEnabled')
			if (savedEnabled !== null) {
				this.enabled = savedEnabled === 'true'
			}

			this.initialized = true
		} catch (error) {
			console.error('AudioManager init error:', error)
		}
	}

	/**
	 * Разблокировка аудио контекста (для iOS/Android)
	 * Вызывается при первом взаимодействии пользователя
	 */
	unlock(): void {
		if (this.unlocked) return

		try {
			const ctx = sound.context?.audioContext
			if (ctx?.state === 'suspended') {
				void ctx.resume()
			}

			// Используем уже загруженный звук для разблокировки контекста
			if (sound.exists('move')) {
				const r = sound.play('move', {
					volume: 0,
					complete: () => {
						// Контекст разблокирован
					},
				})
				if (r && typeof (r as Promise<unknown>).then === 'function') {
					void (r as Promise<unknown>).catch(() => {
						/* ignore */
					})
				}
			}
			this.unlocked = true
		} catch (error) {
			console.warn('AudioManager unlock error:', error)
		}
	}

	/**
	 * Включить/выключить звук
	 */
	setEnabled(value: boolean): void {
		this.enabled = value
		localStorage.setItem('soundEnabled', String(value))

		// Останавливаем все звуки при выключении
		if (!value) {
			Object.keys(SOUND_CONFIGS).forEach((id) => {
				sound.stop(id as SoundId)
			})
		}
	}

	/**
	 * Проверка, включен ли звук
	 */
	isEnabled(): boolean {
		return this.enabled
	}

	/**
	 * Воспроизведение звука с защитой от спама и настройками
	 */
	private play(
		id: SoundId,
		options?: {
			volume?: number
			speed?: number
			once?: boolean
			skipThrottle?: boolean
		},
	): void {
		if (!this.initialized || !this.enabled) return

		const config = SOUND_CONFIGS[id]
		if (!config) return

		// Проверяем, что звук загружен
		if (!sound.exists(id)) {
			return
		}

		// Проверка throttle (пропускаем для каскадных исчезновений)
		const throttleMs = config.throttleMs ?? 0
		if (throttleMs > 0 && !options?.skipThrottle) {
			const lastPlay = this.throttleTimers.get(id) ?? 0
			const now = Date.now()
			if (now - lastPlay < throttleMs) {
				return
			}
		}

		// Проверка once-per-state для clear и gameover
		if (options?.once) {
			if (id === 'clear' && this.clearPlayed) return
			if (id === 'gameover' && this.gameoverPlayed) return
		}

		// Вычисляем финальную громкость
		const categoryVolume = this.categoryVolumes[config.category] ?? 1.0
		const finalVolume =
			(options?.volume ?? 1.0) * categoryVolume * this.masterVolume

		// Random pitch для move и match
		let speed = options?.speed ?? 1.0
		if (config.useRandomPitch && !options?.speed) {
			const pitchVariation = 0.04 + Math.random() * 0.02 // 4-6%
			speed = 1.0 + (Math.random() > 0.5 ? pitchVariation : -pitchVariation)
		}

		const playOpts = {
			volume: finalVolume,
			speed,
			loop: false,
			singleInstance: false,
		}

		const onPlayed = (instance: IMediaInstance | null) => {
			if (!instance) return
			if (throttleMs > 0 && !options?.skipThrottle) {
				this.throttleTimers.set(id, Date.now())
			}
			if (options?.once) {
				if (id === 'clear') this.clearPlayed = true
				if (id === 'gameover') this.gameoverPlayed = true
			}
		}

		const onError = (error: unknown) => {
			console.warn(`Failed to play sound ${id}:`, error)
			if (id.startsWith('combo') && sound.exists('match')) {
				this.play('match', { ...options, speed: options?.speed ?? 1.1 })
			}
		}

		try {
			const playResult = sound.play(id, playOpts)
			if (
				playResult &&
				typeof (playResult as Promise<IMediaInstance>).then === 'function'
			) {
				void (playResult as Promise<IMediaInstance>)
					.then(onPlayed)
					.catch(onError)
				return
			}
			onPlayed(playResult as IMediaInstance | null)
		} catch (error) {
			onError(error)
		}
	}

	/**
	 * Сброс флагов once-per-state (вызывается при рестарте игры)
	 */
	resetOnceFlags(): void {
		this.clearPlayed = false
		this.gameoverPlayed = false
	}

	/**
	 * Воспроизведение звука хода
	 */
	playMove(): void {
		this.play('move')
	}

	/**
	 * Звук матча / комбо по каскаду.
	 * @param scoreComboLevel 1 = MATCH; 2–5 = COMBO_2 … COMBO_5 (из GameController по размерам clear)
	 */
	playMatch(
		_chainIndex: number,
		skipThrottle: boolean = false,
		scoreComboLevel?: number,
	): void {
		const level = scoreComboLevel ?? 1

		if (level >= 2) {
			const comboId: SoundId =
				level === 2
					? 'combo2'
					: level === 3
						? 'combo3'
						: level === 4
							? 'combo4'
							: 'combo5'
			if (sound.exists(comboId)) {
				this.play(comboId, { skipThrottle })
			} else {
				this.play('match', { skipThrottle, volume: 0.9 })
			}
			return
		}

		this.play('match', { skipThrottle })
	}

	/**
	 * Воспроизведение звука спавна
	 */
	playSpawn(): void {
		this.play('spawn')
	}

	/**
	 * Воспроизведение звука очистки
	 */
	playClear(): void {
		this.play('clear', { once: true })
	}

	/**
	 * Воспроизведение звука game over
	 */
	playGameOver(): void {
		this.play('gameover', { once: true })
	}

	/**
	 * Установка громкости категории
	 */
	setCategoryVolume(category: string, volume: number): void {
		this.categoryVolumes[category] = Math.max(0, Math.min(1, volume))
	}

	/**
	 * Установка master volume
	 */
	setMasterVolume(volume: number): void {
		this.masterVolume = Math.max(0, Math.min(1, volume))
	}
}

export const AudioManager = new AudioManagerClass()
