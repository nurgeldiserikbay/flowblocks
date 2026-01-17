/**
 * Block - класс для представления и отрисовки блока на игровом поле
 */

import { Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js'
import type { Tile } from '@/features/game/core/types'
import { getBlockTexture } from './blockTextures'

// Padding между блоками (в пикселях)
const TILE_PADDING = 2

export class Block extends Container {
	public readonly tileId: number
	public gridX: number
	public gridY: number
	private sprite: Sprite | null = null
	private fallbackGraphics: Graphics | null = null
	private text: Text | null = null
	private highlight: Graphics | null = null
	private tileSize: number
	private currentTile: Tile // Храним текущее состояние плитки

	/**
	 * Вычислить размер спрайта с учетом padding
	 */
	private getSpriteSize(): number {
		return Math.max(1, this.tileSize - TILE_PADDING * 2)
	}

	/**
	 * Вычислить смещение для центрирования спрайта
	 */
	private getSpriteOffset(): number {
		return TILE_PADDING
	}

	constructor(
		tileId: number,
		gridX: number,
		gridY: number,
		tileSize: number,
		tile: Tile
	) {
		super()

		this.tileId = tileId
		this.gridX = gridX
		this.gridY = gridY
		this.tileSize = tileSize
		this.currentTile = { ...tile }

		// Нарисовать блок
		this.draw(tile)

		// Установить позицию
		this.x = gridX * tileSize
		this.y = gridY * tileSize
	}

	/**
	 * Отрисовка блока на основе данных плитки
	 */
	public draw(tile: Tile): void {
		// Сохранить текущее состояние
		this.currentTile = { ...tile }

		// Получить текстуру для цвета блока
		const texture = getBlockTexture(tile.color)
		const spriteSize = this.getSpriteSize()
		const spriteOffset = this.getSpriteOffset()

		if (texture) {
			// Удалить fallback если он есть
			if (this.fallbackGraphics) {
				this.removeChild(this.fallbackGraphics)
				this.fallbackGraphics.destroy()
				this.fallbackGraphics = null
			}

			// Использовать Sprite с текстурой
			if (!this.sprite) {
				this.sprite = new Sprite(texture)
				this.sprite.width = spriteSize
				this.sprite.height = spriteSize
				this.sprite.x = spriteOffset
				this.sprite.y = spriteOffset
				this.addChild(this.sprite)
			} else {
				// Обновить текстуру если цвет изменился
				if (this.sprite.texture !== texture) {
					this.sprite.texture = texture
				}
				// Обновить размер и позицию
				this.sprite.width = spriteSize
				this.sprite.height = spriteSize
				this.sprite.x = spriteOffset
				this.sprite.y = spriteOffset
			}
		} else {
			// Удалить sprite если он есть
			if (this.sprite) {
				this.removeChild(this.sprite)
				this.sprite.destroy()
				this.sprite = null
			}

			// Fallback: если текстура не загружена, использовать цветной прямоугольник
			if (!this.fallbackGraphics) {
				this.fallbackGraphics = new Graphics()
				this.fallbackGraphics.rect(
					spriteOffset,
					spriteOffset,
					spriteSize,
					spriteSize
				)
				this.fallbackGraphics.fill(0x888888) // Серый цвет как fallback
				this.fallbackGraphics.stroke({ color: 0x000000, width: 1, alpha: 0.2 })
				this.addChild(this.fallbackGraphics)
			} else {
				// Обновить размер fallback
				this.fallbackGraphics.clear()
				this.fallbackGraphics.rect(
					spriteOffset,
					spriteOffset,
					spriteSize,
					spriteSize
				)
				this.fallbackGraphics.fill(0x888888)
				this.fallbackGraphics.stroke({ color: 0x000000, width: 1, alpha: 0.2 })
			}
		}

		// Обновить или создать текст с количеством ходов
		if (tile.moves > 0) {
			if (!this.text) {
				this.text = new Text({
					text: String(tile.moves),
					style: new TextStyle({
						fontFamily: 'Arial',
						fontSize: Math.max(10, this.tileSize / 3),
						fill: 0xffffff,
						align: 'center',
					}),
				})
				// Установить stroke отдельно через свойство style
				this.text.style.stroke = { color: 0x000000, width: 2 }
				this.text.anchor.set(0.5)
				this.text.x = this.tileSize / 2
				this.text.y = this.tileSize / 2
				this.addChild(this.text)
			} else {
				this.text.text = String(tile.moves)
			}
		} else {
			// Удалить текст если moves === 0
			if (this.text) {
				this.removeChild(this.text)
				this.text.destroy()
				this.text = null
			}
		}
	}

	/**
	 * Обновить позицию блока на сетке
	 */
	public updatePosition(gridX: number, gridY: number): void {
		this.gridX = gridX
		this.gridY = gridY
		this.x = gridX * this.tileSize
		this.y = gridY * this.tileSize
	}

	/**
	 * Обновить размер плитки (при изменении размера canvas)
	 */
	public updateTileSize(tileSize: number): void {
		this.tileSize = tileSize
		// Перерисовать с новым размером используя сохраненное состояние
		this.draw(this.currentTile)
		// Обновить позицию
		this.x = this.gridX * tileSize
		this.y = this.gridY * tileSize
	}

	/**
	 * Установить выделение блока
	 */
	public setHighlight(isSelected: boolean): void {
		if (isSelected) {
			if (!this.highlight) {
				const highlight = new Graphics()
				const spriteSize = this.getSpriteSize()
				const spriteOffset = this.getSpriteOffset()

				// Полупрозрачный белый фон для выделения
				highlight.rect(spriteOffset, spriteOffset, spriteSize, spriteSize)
				highlight.fill({ color: 0xffffff, alpha: 0.3 })
				// Яркая белая обводка
				highlight.stroke({ color: 0xffffff, width: 4, alpha: 1 })
				// Дополнительная внутренняя обводка для лучшей видимости
				highlight.rect(
					spriteOffset + 2,
					spriteOffset + 2,
					spriteSize - 4,
					spriteSize - 4
				)
				highlight.stroke({ color: 0x000000, width: 2, alpha: 0.5 })
				this.highlight = highlight
				// Добавить highlight поверх всех элементов
				this.addChild(highlight)
			} else {
				// Обновить размер highlight при изменении размера плитки
				const spriteSize = this.getSpriteSize()
				const spriteOffset = this.getSpriteOffset()
				this.highlight.clear()
				this.highlight.rect(spriteOffset, spriteOffset, spriteSize, spriteSize)
				this.highlight.fill({ color: 0xffffff, alpha: 0.3 })
				this.highlight.stroke({ color: 0xffffff, width: 4, alpha: 1 })
				this.highlight.rect(
					spriteOffset + 2,
					spriteOffset + 2,
					spriteSize - 4,
					spriteSize - 4
				)
				this.highlight.stroke({ color: 0x000000, width: 2, alpha: 0.5 })
			}
		} else {
			if (this.highlight) {
				this.removeChild(this.highlight)
				this.highlight.destroy()
				this.highlight = null
			}
		}
	}

	/**
	 * Получить текущее состояние плитки
	 */
	public getTile(): Tile {
		return { ...this.currentTile }
	}

	/**
	 * Уничтожить блок и освободить ресурсы
	 */
	public destroy(): void {
		if (this.text) {
			this.text.destroy()
			this.text = null
		}
		if (this.highlight) {
			this.highlight.destroy()
			this.highlight = null
		}
		if (this.sprite) {
			this.sprite.destroy()
			this.sprite = null
		}
		if (this.fallbackGraphics) {
			this.fallbackGraphics.destroy()
			this.fallbackGraphics = null
		}
		super.destroy()
	}
}
