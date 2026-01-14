/**
 * Block - класс для представления и отрисовки блока на игровом поле
 */

import {
	Container,
	Graphics,
	Text,
	TextStyle,
} from 'pixi.js'
import type { Tile } from '@/features/game/core/types'

// Цвета для плиток (базовая палитра)
const TILE_COLORS = [
	'#FF6B6B', // Красный
	'#4ECDC4', // Бирюзовый
	'#45B7D1', // Голубой
	'#FFA07A', // Лососевый
	'#98D8C8', // Мятный
	'#F7DC6F', // Желтый
	'#BB8FCE', // Фиолетовый
	'#85C1E2', // Светло-голубой
]

export class Block extends Container {
	public readonly tileId: number
	public gridX: number
	public gridY: number
	private background: Graphics
	private text: Text | null = null
	private highlight: Graphics | null = null
	private tileSize: number
	private currentTile: Tile // Храним текущее состояние плитки

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

		// Создать фон
		this.background = new Graphics()
		this.addChild(this.background)

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

		// Отрисовать фон
		const colorIndex = tile.color % TILE_COLORS.length
		const colorHex = parseInt(TILE_COLORS[colorIndex].replace('#', ''), 16)

		this.background.clear()
		this.background.rect(0, 0, this.tileSize, this.tileSize)
		this.background.fill(colorHex)
		this.background.stroke({ color: 0x000000, width: 1, alpha: 0.2 })

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
				// Полупрозрачный белый фон для выделения
				highlight.rect(0, 0, this.tileSize, this.tileSize)
				highlight.fill({ color: 0xffffff, alpha: 0.3 })
				// Яркая белая обводка
				highlight.stroke({ color: 0xffffff, width: 4, alpha: 1 })
				// Дополнительная внутренняя обводка для лучшей видимости
				highlight.rect(2, 2, this.tileSize - 4, this.tileSize - 4)
				highlight.stroke({ color: 0x000000, width: 2, alpha: 0.5 })
				this.highlight = highlight
				// Добавить highlight поверх всех элементов
				this.addChild(highlight)
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
		this.background.destroy()
		super.destroy()
	}
}
