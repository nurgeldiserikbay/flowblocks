import {
	AdMob,
	BannerAdSize,
	BannerAdPosition,
	BannerAdPluginEvents,
	AdMobBannerSize,
	BannerAdOptions,
	InterstitialAdPluginEvents,
	AdLoadInfo,
	AdOptions,
	MaxAdContentRating,
} from '@capacitor-community/admob'
import { StatusBar } from '@capacitor/status-bar'
import { Fullscreen } from '@boengli/capacitor-fullscreen'
import type { PluginListenerHandle } from '@capacitor/core'

// Целевая аудитория игры в Google Play включает детей, поэтому действует
// Families Policy: каждый рекламный запрос должен быть помечен как детский,
// ограничен инвентарём с рейтингом G и неперсонализирован. Без этих флагов ревью
// отклоняет обновление с формулировкой «ad content is not consistent with the
// app's content rating».
const AdMobInitializationOptions = {
	testingDevices: ['8a1b4b83d67add00', '1f6e845f97c74f32', 'e81b6ee74e7f26dc'],
	// В dev-сборке используем тестовый режим AdMob, в проде — реальные объявления
	initializeForTesting: import.meta.env.DEV,
	tagForChildDirectedTreatment: true,
	tagForUnderAgeOfConsent: true,
	maxAdContentRating: MaxAdContentRating.General,
}

// Таймаутом ограничена только ЗАГРУЗКА объявления. Показ обрывать нельзя:
// закрывает объявление сам игрок.
const INTERSTITIAL_LOAD_TIMEOUT_MS = 5000

// Страховка, если Dismissed не пришёл: снимает только блокировку игрового
// потока. Системные панели этот путь не трогает — объявление может быть ещё на
// экране, и возврат immersive-режима спрятал бы кнопку закрытия под панель.
const INTERSTITIAL_WATCHDOG_MS = 25_000

// Резерв под баннер: примерно столько занимает adaptive-баннер на телефоне.
// Пока настоящая высота неизвестна, рекламная зона стоит на этом значении и
// никогда не бывает нулевой — иначе вёрстка прыгает при приходе объявления.
const BANNER_RESERVE_HEIGHT = 56

class Admob {
	/** Куда сообщать о состоянии слота. Ставится из App.vue до initialize(). */
	private bannerListener: ((live: boolean, height: number) => void) | null = null

	/**
	 * Стоит ли на экране настоящее объявление.
	 *
	 * Отдельный флаг нужен потому, что `SizeChanged` о наличии объявления не
	 * говорит ничего: плагин рассылает его и на загрузке — с настоящим
	 * размером, и на отказе, скрытии, снятии — с нулями. Если считать слот
	 * живым по любому из них, после снятия баннера слот останется «живым» с
	 * нулевой высотой: кросс-промо спрячется, а на его месте будет пустая
	 * полоса.
	 */
	private bannerLoaded = false
	/** Последняя известная высота объявления. */
	private bannerHeightPx = 0

	/** Подписка страницы на состояние слота. Ставится до initialize(). */
	onBannerChange(listener: (live: boolean, height: number) => void) {
		this.bannerListener = listener
	}

	private publishBanner(live: boolean, height = 0) {
		this.bannerListener?.(live, height)
	}

	/**
	 * Нативный баннер рисуется поверх вебвью, а не внутри вёрстки, поэтому
	 * сама страница о нём ничего не знает. Через эту переменную она узнаёт
	 * высоту объявления и держит под него место.
	 *
	 * Это же и есть защита от «реклама перекрывает управление»:
	 * adaptive-баннер на планшете вырастает почти вдвое против телефонного, и
	 * фиксированный отступ под него промахивается.
	 *
	 * `null` — вернуться к резерву из вёрстки. Место при этом не исчезает: в
	 * нём просто снова появляется кросс-промо.
	 */
	private setSlotHeight(px: number | null) {
		if (typeof document === 'undefined') return
		const root = document.documentElement.style
		if (px === null) root.removeProperty('--ad-slot')
		else root.setProperty('--ad-slot', `${Math.max(44, Math.round(px))}px`)
	}

	/**
	 * Добавляет к рекламной зоне системный инсет — туда же, куда система
	 * отодвинула баннер.
	 *
	 * Ставится и снимается вместе с самим объявлением, а не один раз при
	 * старте: когда баннера нет, отодвигать не подо что — в полосе стоит
	 * кросс-промо, и лишний инсет оставит под ним пустую кромку.
	 *
	 * Само число здесь не считается и не может: его знает браузер и отдаёт
	 * через `env(safe-area-inset-bottom)`. Переменной присваивается выражение,
	 * а не результат: инсет меняется вместе с системными панелями, и вычислять
	 * его должен CSS. Требует `viewport-fit=cover` в `index.html`.
	 *
	 * Берётся максимум из двух источников, и это не перестраховка. Capacitor 8
	 * сам вычисляет безопасную зону и кладёт её в собственные переменные
	 * `--safe-area-inset-*` (SystemBars.java, injectSafeAreaCSS), а нативный
	 * `env()` при этом работает не всегда: в ветке без passthrough — старый
	 * WebView или невидимый плагину `viewport-fit` — Capacitor отодвигает вебвью
	 * от системных панелей сам и обнуляет `env()`. Если понадеяться только на
	 * `env()`, в такой ветке резерв окажется меньше реального на высоту
	 * навигационной панели, и баннер накроет низ поля ровно на эту величину.
	 *
	 * `max()` может только увеличить резерв, так что ошибиться в другую сторону
	 * он не даёт.
	 */
	private setBannerInset(on: boolean) {
		if (typeof document === 'undefined') return
		const root = document.documentElement.style
		if (on)
			root.setProperty(
				'--ad-inset',
				'max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px))'
			)
		else root.removeProperty('--ad-inset')
	}

	/** Слот пуст: место остаётся, но в нём снова кросс-промо. */
	private clearBanner() {
		this.bannerLoaded = false
		this.bannerHeightPx = 0
		this.setSlotHeight(null)
		this.setBannerInset(false)
		this.publishBanner(false)
	}

	private bannerWasShown = false
	private bannerListeners: PluginListenerHandle[] = []
	private interstitialListeners: PluginListenerHandle[] = []
	// Детская конфигурация запросов применяется именно в initialize(), поэтому ни
	// один запрос рекламы не должен уйти раньше. Промис кэшируется: точки показа
	// рекламы ждут этот же промис, повторная инициализация не происходит.
	private initPromise: Promise<void> | null = null
	private initialized = false

	initialize() {
		if (!this.initPromise) {
			this.initPromise = this.runInitialize()
		}
		return this.initPromise
	}

	private async runInitialize() {
		await AdMob.initialize(AdMobInitializationOptions)
		this.initialized = true

		// UMP / GDPR consent flow.
		// ВАЖНО: показ формы согласия НЕ должен зависеть от статуса ATT
		// Форму согласия UMP осознанно не запрашиваем. Запросы помечены
		// tagForUnderAgeOfConsent, а у пользователя ниже возраста согласия согласие
		// на персонализацию не спрашивают — показывать ему форму выбора
		// персонализации неверно и по GDPR, и по Families Policy.
		// Неперсонализированную выдачу обеспечивает npa: true в каждом запросе.
	}

	private async removeInterstitialListeners() {
		await Promise.all(
			this.interstitialListeners.map((l) => l.remove().catch(() => {})),
		)
		this.interstitialListeners = []
	}

	async showBanner() {
		// Ждём детскую конфигурацию; если инициализация упала — баннер не
		// запрашиваем, показать нетегированный запрос хуже, чем не показать ничего.
		await this.initialize().catch((error) => console.log(error))
		if (!this.initialized) return

		// Регистрируем слушатели только один раз, чтобы не накапливать их
		// при повторных показах баннера (утечка слушателей).
		if (this.bannerListeners.length === 0) {
			this.bannerListeners.push(
				await AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
					this.bannerLoaded = true
					this.setBannerInset(true)
					this.publishBanner(true, this.bannerHeightPx || BANNER_RESERVE_HEIGHT)
				}),
			)

			// Нет заполнения, нет сети, нет объявления: место остаётся за слотом,
			// но рисует в нём снова кросс-промо. Обнулять резерв нельзя — вёрстка
			// прыгнет ровно так же, как прыгала при появлении баннера.
			//
			// Хэндл кладём в тот же список, что и остальные: removeBanner() снимает
			// подписки по нему, и промис вместо хэндла там сломал бы снятие.
			this.bannerListeners.push(
				await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => {
					this.clearBanner()
				}),
			)

			this.bannerListeners.push(
				await AdMob.addListener(
					BannerAdPluginEvents.SizeChanged,
					(size: AdMobBannerSize) => {
						// Нули означают, что баннера на экране нет: отказ, скрытие или
						// снятие. Не «объявление нулевой высоты», а его отсутствие.
						if (!size.height) {
							this.clearBanner()
							return
						}

						// Настоящая высота заменяет резерв, как только стала известна.
						// О самом наличии объявления это событие не говорит, поэтому
						// состояние слота остаётся тем, какое было.
						this.bannerHeightPx = size.height
						this.setSlotHeight(size.height)
						this.setBannerInset(true)
						this.publishBanner(this.bannerLoaded, size.height)
					},
				),
			)
		}

		const options: BannerAdOptions = {
			adId: 'ca-app-pub-9702825788968948/2833006189',
			// ADAPTIVE_BANNER, а не BANNER: фиксированный 320x50 не растягивается на ширину
			// экрана, и плагин центрирует его боковыми маргинами — а слушатель инсетов на
			// Android 15+ эти маргины обнуляет, из-за чего баннер уезжает к левому краю.
			adSize: BannerAdSize.ADAPTIVE_BANNER,
			position: BannerAdPosition.BOTTOM_CENTER,
			margin: 0,
			isTesting: import.meta.env.VITE_APP_MODE === 'TEST',
			npa: true,
		}

		await AdMob.showBanner(options)
		this.bannerWasShown = true
	}

	async resumeBanner() {
		await AdMob.resumeBanner()
	}

	async hideBanner() {
		await AdMob.hideBanner()
		// Объявление ушло с экрана — слот снова наш.
		this.clearBanner()
	}

	/**
	 * Показать баннер. При первом заходе — showBanner, при повторном — resumeBanner
	 * (после hideBanner нужно вызывать resumeBanner, иначе баннер не появится снова).
	 */
	async showBannerIfNeeded() {
		if (this.bannerWasShown) {
			await this.resumeBanner()
		} else {
			await this.showBanner()
		}
	}

	async removeBanner() {
		await AdMob.removeBanner()
		await Promise.all(
			this.bannerListeners.map((l) => l.remove().catch(() => {})),
		)
		this.bannerListeners = []
		this.bannerWasShown = false
		// Объявление ушло с экрана — слот снова наш.
		this.clearBanner()
	}

	// Пока показывается полноэкранная реклама, системные панели должны быть видны.
	// Activity объявления принадлежит SDK, а с Android 15 система рисует его
	// edge-to-edge: если игра держит immersive-режим, кнопка закрытия может
	// оказаться под навигационной панелью или вырезом — ровно то, что ревью
	// описывает как «unclosable ads».
	private async showSystemBars() {
		try {
			await Fullscreen.deactivateImmersiveMode()
			await StatusBar.show()
		} catch (error) {
			console.log(error)
		}
	}

	private async restoreImmersiveMode() {
		try {
			await Fullscreen.activateImmersiveMode()
			await StatusBar.hide()
		} catch (error) {
			console.log(error)
		}
	}

	async interstitial({
		isFirst = false,
		onInterstitialAdClosed,
	}: {
		isFirst?: boolean
		onInterstitialAdClosed?: () => void
	} = {}) {
		const done = onInterstitialAdClosed ?? (() => {})

		let isClosed = false
		let barsRaised = false
		let timeoutId: ReturnType<typeof setTimeout> | undefined
		let watchdogId: ReturnType<typeof setTimeout> | undefined

		// Снятие блокировки и возврат системных панелей разведены намеренно:
		// страхующий таймер срабатывает, когда объявление может быть ещё на экране,
		// и скрыть панели в этот момент означало бы увести кнопку закрытия под них.
		const releaseFlow = () => {
			if (isClosed) return
			isClosed = true
			if (timeoutId) clearTimeout(timeoutId)
			if (watchdogId) clearTimeout(watchdogId)
			// Снимаем слушатели этого показа, чтобы они не накапливались
			void this.removeInterstitialListeners()
			done()
		}

		const restoreBars = () => {
			if (!barsRaised) return
			barsRaised = false
			void this.restoreImmersiveMode()
		}

		const closeAds = () => {
			releaseFlow()
			restoreBars()
		}

		// Первая партия рекламы не показывает. Раньше при isFirst === true
		// объявление готовилось, но не показывалось, и колбэк не вызывался вообще —
		// вызывающий код ждал его до собственного таймаута.
		if (isFirst) {
			releaseFlow()
			return
		}

		// Инициализация ещё не завершилась — пропускаем показ и сразу возвращаем
		// управление игре, не отправляя нетегированный запрос.
		if (!this.initialized) {
			closeAds()
			return
		}

		// Убираем возможные слушатели предыдущего показа перед регистрацией новых
		await this.removeInterstitialListeners()

		this.interstitialListeners.push(
			await AdMob.addListener(
				InterstitialAdPluginEvents.Loaded,
				(_info: AdLoadInfo) => {},
			),
		)
		this.interstitialListeners.push(
			await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
				closeAds()
			}),
		)
		this.interstitialListeners.push(
			await AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, () => {
				closeAds()
			}),
		)
		this.interstitialListeners.push(
			await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => {
				closeAds()
			}),
		)

		const options: AdOptions = {
			adId: 'ca-app-pub-9702825788968948/2487732691',
			isTesting: import.meta.env.VITE_APP_MODE === 'TEST',
			npa: true,
			// immersiveMode осознанно не выставляем: с Android 15 (edge-to-edge)
			// он уводит кнопку закрытия рекламы под системные панели/вырез, и
			// объявление становится незакрываемым — это отказ по Families Policy.
		}

		// Загрузку гоняем в скачки с таймаутом: ждать её дольше пяти секунд — это
		// уже «реклама мешает пользоваться приложением».
		const loaded = await new Promise<boolean>((resolve) => {
			timeoutId = setTimeout(() => {
				console.log('Interstitial load timed out')
				resolve(false)
			}, INTERSTITIAL_LOAD_TIMEOUT_MS)

			AdMob.prepareInterstitial(options)
				.then(() => resolve(true))
				.catch((error) => {
					console.log(error)
					resolve(false)
				})
		})

		if (!loaded || isClosed) {
			releaseFlow()
			return
		}

		clearTimeout(timeoutId)

		await this.showSystemBars()
		barsRaised = true
		watchdogId = setTimeout(() => {
			console.log('Interstitial dismiss watchdog fired')
			releaseFlow()
		}, INTERSTITIAL_WATCHDOG_MS)

		try {
			await AdMob.showInterstitial()
		} catch (error) {
			// Нет заливки или ошибка показа — игровой поток не блокируем.
			console.log(error)
			closeAds()
		}
	}
}

export default new Admob()
