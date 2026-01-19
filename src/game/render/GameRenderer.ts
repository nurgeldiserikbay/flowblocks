/**
 * Pixi.js game renderer - handles rendering and animations
 */

import { Application, Container, Sprite, Text, TextStyle, Graphics } from 'pixi.js'
import { gsap } from 'gsap'
import type { GameEvent, Cube } from '../logic/types'
import { getBlockTexture, loadBlockTextures } from '../blockTextures'
import { HEIGHT, WIDTH } from '../logic/grid'

const TILE_PADDING = 2

export interface GameRendererOptions {
	canvas: HTMLCanvasElement
	tileSize: number
}

type CubeContainer = {
	container: Container
	sprite: Sprite
	text: Text | null
	highlight: Graphics | null
}

export class GameRenderer {
	private canvas: HTMLCanvasElement
	private app: Application | null = null
	private gameContainer: Container | null = null
	private tileSize: number
	private cubeContainers: Map<number, CubeContainer> = new Map() // Map<cubeId, container>
	private cubePositions: Map<number, { r: number; c: number }> = new Map() // Map<cubeId, position>
	private nextCubeId: number = 1
	private selectedPosition: { r: number; c: number } | null = null

	constructor(options: GameRendererOptions) {
		this.canvas = options.canvas
		this.tileSize = options.tileSize
	}

	async init(): Promise<void> {
		await loadBlockTextures()

		this.app = new Application()
		await this.app.init({
			canvas: this.canvas,
			width: this.canvas.width,
			height: this.canvas.height,
			backgroundColor: 0x000000,
			backgroundAlpha: 0,
			resolution: window.devicePixelRatio || 1,
			autoDensity: true,
		})

		this.gameContainer = new Container()
		this.app.stage.addChild(this.gameContainer)
	}

	async renderGrid(grid: (Cube | null)[][], nextCubeId: number = 1): Promise<void> {
		if (!this.gameContainer) return

		this.nextCubeId = nextCubeId

		// Clear existing containers
		this.cubeContainers.forEach((cubeContainer) => {
			if (cubeContainer.container.parent) {
				cubeContainer.container.parent.removeChild(cubeContainer.container)
			}
			cubeContainer.container.destroy({ children: true })
		})
		this.cubeContainers.clear()
		this.cubePositions.clear()

		// Render all cubes
		for (let r = 0; r < HEIGHT; r++) {
			for (let c = 0; c < WIDTH; c++) {
				const cube = grid[r]?.[c]
				if (cube) {
					this.createCubeSprite(cube, r, c)
				}
			}
		}

		// Restore selection if it exists
		if (this.selectedPosition) {
			this.setSelectedPosition(this.selectedPosition.r, this.selectedPosition.c)
		}
	}

	private createCubeSprite(cube: Cube, r: number, c: number): CubeContainer {
		if (!this.gameContainer) {
			throw new Error('Game container not initialized')
		}

		const texture = getBlockTexture(cube.color)
		if (!texture) {
			throw new Error(`Texture not found for color ${cube.color}`)
		}

		// Create container for cube
		const container = new Container()
		container.x = c * this.tileSize
		container.y = r * this.tileSize

		// Create sprite
		const sprite = new Sprite(texture)
		const spriteSize = Math.max(1, this.tileSize - TILE_PADDING * 2)
		sprite.width = spriteSize
		sprite.height = spriteSize
		sprite.x = TILE_PADDING
		sprite.y = TILE_PADDING
		container.addChild(sprite)

		// Create text for moves
		let text: Text | null = null
		if (cube.moves > 0) {
			text = new Text({
				text: String(cube.moves),
				style: new TextStyle({
					fontFamily: 'Arial',
					fontSize: Math.max(10, this.tileSize / 3),
					fill: 0xffffff,
					align: 'center',
				}),
			})
			text.style.stroke = { color: 0x000000, width: 2 }
			text.anchor.set(0.5)
			text.x = this.tileSize / 2
			text.y = this.tileSize / 2
			container.addChild(text)
		}

		// Create highlight (initially hidden)
		const highlight = new Graphics()
		highlight.rect(TILE_PADDING, TILE_PADDING, spriteSize, spriteSize)
		highlight.stroke({ color: 0xffffff, width: 4, alpha: 1 })
		highlight.rect(TILE_PADDING + 2, TILE_PADDING + 2, spriteSize - 4, spriteSize - 4)
		highlight.stroke({ color: 0x000000, width: 2, alpha: 0.5 })
		highlight.visible = false
		container.addChild(highlight)

		this.gameContainer.addChild(container)
		this.cubeContainers.set(cube.id, { container, sprite, text, highlight })
		this.cubePositions.set(cube.id, { r, c })

		// Update highlight if this position is selected
		if (this.selectedPosition && this.selectedPosition.r === r && this.selectedPosition.c === c) {
			highlight.visible = true
		}

		return { container, sprite, text, highlight }
	}

	updateCubeMoves(cubeId: number, moves: number): void {
		const cubeContainer = this.cubeContainers.get(cubeId)
		if (!cubeContainer) return

		if (moves > 0) {
			if (!cubeContainer.text) {
				// Create text if it doesn't exist
				cubeContainer.text = new Text({
					text: String(moves),
					style: new TextStyle({
						fontFamily: 'Arial',
						fontSize: Math.max(10, this.tileSize / 3),
						fill: 0xffffff,
						align: 'center',
					}),
				})
				cubeContainer.text.style.stroke = { color: 0x000000, width: 2 }
				cubeContainer.text.anchor.set(0.5)
				cubeContainer.text.x = this.tileSize / 2
				cubeContainer.text.y = this.tileSize / 2
				cubeContainer.container.addChild(cubeContainer.text)
			} else {
				// Update existing text
				cubeContainer.text.text = String(moves)
			}
		} else {
			// Remove text if moves is 0
			if (cubeContainer.text) {
				cubeContainer.container.removeChild(cubeContainer.text)
				cubeContainer.text.destroy()
				cubeContainer.text = null
			}
		}
	}

	setSelectedPosition(r: number | null, c: number | null): void {
		// Remove previous selection
		if (this.selectedPosition) {
			const prevCubeId = this.findCubeIdAt(this.selectedPosition.r, this.selectedPosition.c)
			if (prevCubeId !== null) {
				const prevContainer = this.cubeContainers.get(prevCubeId)
				if (prevContainer?.highlight) {
					prevContainer.highlight.visible = false
				}
			}
		}

		// Set new selection
		if (r !== null && c !== null) {
			this.selectedPosition = { r, c }
			const cubeId = this.findCubeIdAt(r, c)
			if (cubeId !== null) {
				const cubeContainer = this.cubeContainers.get(cubeId)
				if (cubeContainer?.highlight) {
					cubeContainer.highlight.visible = true
				}
			}
		} else {
			this.selectedPosition = null
		}
	}

	async applyEvents(events: GameEvent[]): Promise<void> {
		for (const event of events) {
			switch (event.type) {
				case 'swap':
					await this.animateSwap(event.a, event.b)
					break
				case 'move':
					await this.animateMove(event.from, event.to)
					break
				case 'fall':
					await this.animateFall(event.items)
					break
				case 'remove':
					await this.animateRemove(event.cells)
					break
				case 'spawn':
					await this.animateSpawn(event.cells)
					break
				case 'gameover':
					// No animation, just handled by game state
					break
			}
		}
	}

	private async animateSwap(a: { r: number; c: number }, b: { r: number; c: number }): Promise<void> {
		// Find cube IDs at positions a and b
		const cubeIdA = this.findCubeIdAt(a.r, a.c)
		const cubeIdB = this.findCubeIdAt(b.r, b.c)

		if (cubeIdA === null || cubeIdB === null) return

		const containerA = this.cubeContainers.get(cubeIdA)
		const containerB = this.cubeContainers.get(cubeIdB)

		if (!containerA || !containerB) return

		const posAX = a.c * this.tileSize
		const posAY = a.r * this.tileSize
		const posBX = b.c * this.tileSize
		const posBY = b.r * this.tileSize

		// Update positions
		this.cubePositions.set(cubeIdA, { r: b.r, c: b.c })
		this.cubePositions.set(cubeIdB, { r: a.r, c: a.c })

		await Promise.all([
			new Promise<void>((resolve) => {
				gsap.to(containerA.container, {
					x: posBX,
					y: posBY,
					duration: 0.2,
					ease: 'power2.out',
					onComplete: resolve,
				})
			}),
			new Promise<void>((resolve) => {
				gsap.to(containerB.container, {
					x: posAX,
					y: posAY,
					duration: 0.2,
					ease: 'power2.out',
					onComplete: resolve,
				})
			}),
		])
	}

	private async animateMove(
		from: { r: number; c: number },
		to: { r: number; c: number }
	): Promise<void> {
		const cubeId = this.findCubeIdAt(from.r, from.c)
		if (cubeId === null) return

		const cubeContainer = this.cubeContainers.get(cubeId)
		if (!cubeContainer) return

		// Update position
		this.cubePositions.set(cubeId, { r: to.r, c: to.c })

		const targetX = to.c * this.tileSize
		const targetY = to.r * this.tileSize

		await new Promise<void>((resolve) => {
			gsap.to(cubeContainer.container, {
				x: targetX,
				y: targetY,
				duration: 0.2,
				ease: 'power2.out',
				onComplete: resolve,
			})
		})
	}

	private async animateFall(
		items: Array<{ from: { r: number; c: number }; to: { r: number; c: number }; color: number }>
	): Promise<void> {
		const animations = items.map((item) => {
			const cubeId = this.findCubeIdAt(item.from.r, item.from.c)
			if (cubeId === null) return Promise.resolve()

			const cubeContainer = this.cubeContainers.get(cubeId)
			if (!cubeContainer) return Promise.resolve()

			// Update position
			this.cubePositions.set(cubeId, { r: item.to.r, c: item.to.c })

			const targetX = item.to.c * this.tileSize
			const targetY = item.to.r * this.tileSize

			return new Promise<void>((resolve) => {
				gsap.to(cubeContainer.container, {
					x: targetX,
					y: targetY,
					duration: 0.3,
					ease: 'power2.out',
					onComplete: resolve,
				})
			})
		})

		await Promise.all(animations)
	}

	private async animateRemove(
		cells: Array<{ r: number; c: number; color: number; id: number }>
	): Promise<void> {
		// Use cube IDs directly from the event instead of finding by position
		const cubeIdsToRemove: number[] = cells.map((cell) => cell.id)

		const containers = cubeIdsToRemove
			.map((id) => this.cubeContainers.get(id))
			.filter((c): c is CubeContainer => c !== undefined)

		if (containers.length === 0) return

		await Promise.all(
			containers.map(
				(cubeContainer) =>
					new Promise<void>((resolve) => {
						gsap.to(cubeContainer.container, {
							alpha: 0,
							scale: 0,
							duration: 0.15,
							ease: 'back.in',
							onComplete: () => {
								if (cubeContainer.container.parent) {
									cubeContainer.container.parent.removeChild(cubeContainer.container)
								}
								cubeContainer.container.destroy({ children: true })
								resolve()
							},
						})
					})
			)
		)

		// Remove from maps
		cubeIdsToRemove.forEach((id) => {
			this.cubeContainers.delete(id)
			this.cubePositions.delete(id)
		})
	}

	private async animateSpawn(cells: Array<{ id: number; r: number; c: number; color: number; fromRow?: number; toRow?: number }>): Promise<void> {
		const animations = cells.map((cell) => {
			const cubeContainer = this.cubeContainers.get(cell.id)
			if (!cubeContainer) return Promise.resolve() // removed in resolve

			const pos = this.cubePositions.get(cell.id)
			if (!pos) return Promise.resolve()

			const targetRow = pos.r
			const targetY = targetRow * this.tileSize

			if (cell.fromRow !== undefined && cell.fromRow < 0) {
				const startY = cell.fromRow * this.tileSize
				cubeContainer.container.y = startY
				cubeContainer.container.alpha = 1
				cubeContainer.container.scale.set(1)
				return new Promise<void>((resolve) => {
					gsap.to(cubeContainer.container, {
						y: targetY,
						duration: 0.6,
						ease: 'power2.out',
						onComplete: () => {
							cubeContainer.container.y = targetY
							resolve()
						},
					})
				})
			} else {
				cubeContainer.container.alpha = 0
				cubeContainer.container.scale.set(0)
				return new Promise<void>((resolve) => {
					gsap.to(cubeContainer.container, {
						alpha: 1,
						scale: 1,
						duration: 0.15,
						ease: 'back.out',
						onComplete: resolve,
					})
				})
			}
		})
		await Promise.all(animations)
	}

	private findSpriteAt(r: number, c: number): Sprite | null {
		// Find cube ID at this position
		for (const [cubeId, pos] of this.cubePositions.entries()) {
			if (pos.r === r && pos.c === c) {
				return this.cubeContainers.get(cubeId)?.sprite || null
			}
		}
		return null
	}

	private findCubeIdAt(r: number, c: number): number | null {
		for (const [cubeId, pos] of this.cubePositions.entries()) {
			if (pos.r === r && pos.c === c) {
				return cubeId
			}
		}
		return null
	}

	updateTileSize(newTileSize: number): void {
		this.tileSize = newTileSize
		// Update all sprite positions and sizes
		this.cubeContainers.forEach((cubeContainer, cubeId) => {
			// We'd need to track positions to update properly
			// For now, re-render will handle it
		})
	}

	async syncGridPositions(grid: (Cube | null)[][]): Promise<void> {
		if (!this.gameContainer) return

		// Update positions of existing cubes and remove cubes that are no longer in grid
		const cubesInGrid = new Set<number>()

		// Collect all cube IDs from grid
		for (let r = 0; r < HEIGHT; r++) {
			for (let c = 0; c < WIDTH; c++) {
				const cube = grid[r]?.[c]
				if (cube) {
					cubesInGrid.add(cube.id)
					// Update position if cube exists
					const cubeContainer = this.cubeContainers.get(cube.id)
					if (cubeContainer) {
						const pos = this.cubePositions.get(cube.id)
						if (!pos || pos.r !== r || pos.c !== c) {
							// Position changed - update it (but don't animate, just set)
							this.cubePositions.set(cube.id, { r, c })
							cubeContainer.container.x = c * this.tileSize
							cubeContainer.container.y = r * this.tileSize
						}
					}
					// Don't create missing cubes here - they should be created by renderGrid or spawn events
				}
			}
		}

		// Remove cubes that are no longer in grid (but only if they weren't already removed by animateRemove)
		const cubesToRemove: number[] = []
		for (const cubeId of this.cubeContainers.keys()) {
			if (!cubesInGrid.has(cubeId)) {
				cubesToRemove.push(cubeId)
			}
		}

		for (const cubeId of cubesToRemove) {
			const cubeContainer = this.cubeContainers.get(cubeId)
			if (cubeContainer) {
				// Only remove if still in parent (wasn't already removed by animateRemove)
				if (cubeContainer.container.parent) {
					cubeContainer.container.parent.removeChild(cubeContainer.container)
				}
				cubeContainer.container.destroy({ children: true })
				this.cubeContainers.delete(cubeId)
				this.cubePositions.delete(cubeId)
			}
		}

		// Restore selection if it exists
		if (this.selectedPosition) {
			this.setSelectedPosition(this.selectedPosition.r, this.selectedPosition.c)
		}
	}

	destroy(): void {
		this.cubeContainers.forEach((cubeContainer) => {
			if (cubeContainer.container.parent) {
				cubeContainer.container.parent.removeChild(cubeContainer.container)
			}
			cubeContainer.container.destroy({ children: true })
		})
		this.cubeContainers.clear()

		if (this.app) {
			this.app.destroy(true, {
				children: true,
				texture: true,
				textureSource: true,
			})
			this.app = null
		}
	}
}
