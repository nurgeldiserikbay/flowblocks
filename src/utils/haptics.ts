import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

export function hapticPerfect() {
	if (Capacitor.getPlatform() === 'web') return

	Haptics.impact({
		style: ImpactStyle.Medium, // 🔥 идеально для perfect
	}).catch(() => {})
}

export function hapticLight() {
	if (Capacitor.getPlatform() === 'web') return

	Haptics.impact({
		style: ImpactStyle.Light,
	}).catch(() => {})
}

export function hapticError() {
	if (Capacitor.getPlatform() === 'web') return

	Haptics.impact({
		style: ImpactStyle.Heavy,
	}).catch(() => {})
}
