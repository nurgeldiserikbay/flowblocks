import {
	AdMob,
	AdmobConsentStatus,
	BannerAdSize,
	BannerAdPosition,
	BannerAdPluginEvents,
	AdMobBannerSize,
	BannerAdOptions,
	InterstitialAdPluginEvents,
	AdLoadInfo,
	AdOptions,
} from '@capacitor-community/admob'
import type { PluginListenerHandle } from '@capacitor/core'

const AdMobInitializationOptions = {
	testingDevices: ['8a1b4b83d67add00', '1f6e845f97c74f32', 'e81b6ee74e7f26dc'],
	// В dev-сборке используем тестовый режим AdMob, в проде — реальные объявления
	initializeForTesting: import.meta.env.DEV,
	// Трафик не считаем детским — иначе персонализация и доход искусственно ограничены
	tagForChildDirectedTreatment: false,
}

class Admob {
	private bannerWasShown = false
	private bannerListeners: PluginListenerHandle[] = []
	private interstitialListeners: PluginListenerHandle[] = []

	async initialize() {
		await AdMob.initialize(AdMobInitializationOptions)

		// UMP / GDPR consent flow.
		// ВАЖНО: показ формы согласия НЕ должен зависеть от статуса ATT
		// (trackingAuthorizationStatus — это iOS/App Tracking Transparency).
		// Для EU-пользователей форму нужно показывать всегда, когда UMP
		// сообщает status === REQUIRED и форма доступна.
		try {
			const consentInfo = await AdMob.requestConsentInfo()
			if (
				consentInfo.isConsentFormAvailable &&
				consentInfo.status === AdmobConsentStatus.REQUIRED
			) {
				// Форма автоматически закроется после отправки согласия;
				// Promise резолвится после закрытия формы.
				await AdMob.showConsentForm()
			}
		} catch (error) {
			console.warn('[AdMob] Error during consent flow:', error)
		}
	}

	private async removeInterstitialListeners() {
		await Promise.all(
			this.interstitialListeners.map((l) => l.remove().catch(() => {})),
		)
		this.interstitialListeners = []
	}

	async showBanner() {
		// Регистрируем слушатели только один раз, чтобы не накапливать их
		// при повторных показах баннера (утечка слушателей).
		if (this.bannerListeners.length === 0) {
			this.bannerListeners.push(
				await AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
					// Subscribe Banner Event Listener
				}),
			)
			this.bannerListeners.push(
				await AdMob.addListener(
					BannerAdPluginEvents.SizeChanged,
					(_size: AdMobBannerSize) => {
						// Subscribe Change Banner Size
					},
				),
			)
		}

		const options: BannerAdOptions = {
			adId: 'ca-app-pub-9702825788968948/2833006189',
			adSize: BannerAdSize.BANNER,
			position: BannerAdPosition.BOTTOM_CENTER,
			margin: 0,
			isTesting: import.meta.env.VITE_APP_MODE === 'TEST',
			// npa: true
		}

		await AdMob.showBanner(options)
		this.bannerWasShown = true
	}

	async resumeBanner() {
		await AdMob.resumeBanner()
	}

	async hideBanner() {
		await AdMob.hideBanner()
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
	}

	async interstitial({
		isFirst,
		onInterstitialAdClosed,
	}: {
		isFirst: boolean
		onInterstitialAdClosed: () => void
	}) {
		let isClosed = false
		const closeAds = () => {
			isClosed = true
			// Снимаем слушатели этого показа, чтобы они не накапливались
			void this.removeInterstitialListeners()
			onInterstitialAdClosed()
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
				if (!isClosed) closeAds()
			}),
		)
		this.interstitialListeners.push(
			await AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, () => {
				if (!isClosed) closeAds()
			}),
		)
		this.interstitialListeners.push(
			await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => {
				if (!isClosed) closeAds()
			}),
		)

		const options: AdOptions = {
			adId: 'ca-app-pub-9702825788968948/2487732691',
			isTesting: import.meta.env.VITE_APP_MODE === 'TEST',
			// npa: true
		}

		await AdMob.prepareInterstitial(options)
		if (!isFirst) await AdMob.showInterstitial()
	}
}

export default new Admob()
