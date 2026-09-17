/**
 * UiTextures — накладки поверх доски: кольцо выбора, искра и мягкая вспышка.
 *
 * Все три лежат отдельными текстурами, а не запекаются в плитку. Кольцо
 * особенно: если подмешать его в саму текстуру плитки, придётся держать по две
 * текстуры на цвет и перекидывать спрайт при каждом выборе, а любой эффект
 * поверх (исчезновение, падение) начнёт таскать кольцо за собой.
 *
 * Растр сделан заранее из `src/assets/ui/*.svg` — см. одноимённые `.webp`
 * рядом. Мастера остаются в репозитории для правок.
 */

import { Assets, Texture } from 'pixi.js'

import selectionRingUrl from '@/assets/ui/selection-ring.webp'
import sparkleUrl from '@/assets/ui/sparkle.webp'
import softBurstUrl from '@/assets/ui/soft-burst.webp'

export interface UiTextures {
	selectionRing: Texture
	sparkle: Texture
	softBurst: Texture
}

export async function createUiTextures(): Promise<UiTextures> {
	const [selectionRing, sparkle, softBurst] = await Promise.all([
		Assets.load<Texture>(selectionRingUrl),
		Assets.load<Texture>(sparkleUrl),
		Assets.load<Texture>(softBurstUrl),
	])

	for (const texture of [selectionRing, sparkle, softBurst]) {
		texture.source.scaleMode = 'linear'
	}

	return { selectionRing, sparkle, softBurst }
}
