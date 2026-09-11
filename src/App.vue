<script lang="ts" setup>
import { onMounted } from 'vue'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { StatusBar } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { Fullscreen } from '@boengli/capacitor-fullscreen'

import Admob from '@/utils/admob'

import { useAdsStore } from '@/store/adsStore'
import { loadBlockTextures } from '@/game/blockTextures'

const adsStore = useAdsStore()

onMounted(async () => {
	// КРИТИЧНО: Инициализируем AdMob до использования (showBanner, interstitial)
	// Без await showBanner может зависнуть при повторном заходе в игру
	if (Capacitor.getPlatform() === 'android') {
		try {
			// Подписку ставим до initialize(): первое событие баннера может прийти
			// раньше, чем страница успеет смонтироваться, и потеряться.
			Admob.onBannerChange((live, height) => adsStore.setBanner(live, height))

			await Admob.initialize()
		} catch (error) {
			console.warn('[App] AdMob initialization failed:', error)
		}
	}

	if (Capacitor.getPlatform() === 'android') {
		await Fullscreen.activateImmersiveMode()
		await StatusBar.hide()
		await StatusBar.setOverlaysWebView({ overlay: true })
		await SplashScreen.hide()

		App.addListener('backButton', () => {
			App.exitApp()
		})
	}
})
</script>

<template>
	<RouterView />
</template>

<style lang="scss" scoped>
.wrapper {
	width: 100%;
	min-height: 100dvh;
}
</style>
