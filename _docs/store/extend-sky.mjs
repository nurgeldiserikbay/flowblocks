// Достраивает небо вверх, чтобы кадр покрывал высокие экраны без обрезки ширины.
//
// Мастер 941x1672 — ровно 9:16. Телефоны сейчас 19.5:9 и выше, и при `cover`
// такой кадр терял по бокам 18-20% ширины: острова оказывались обрезаны
// посередине. Залить недостающий верх плоским цветом нельзя — у кадра по верхней
// кромке лежат кубы, разброс по строке под 165 из 255, и плоская заливка дала бы
// видимый шов.
//
// Поэтому верх достраивается самим кадром: берём его верхнюю полоску и тянем её
// вверх. По каждому столбцу цвет продолжается ровно тот же, что на кромке, —
// шва нет по построению, а растяжка читается как уходящее в темноту небо.

import fs from 'node:fs'
import path from 'node:path'

const SRC = 'D:/WORK/completed/16-FlowBlocks/src/assets/img/sky-portrait.webp'
const OUT = 'D:/WORK/completed/16-FlowBlocks/src/assets/img/sky-portrait.webp'

// 941 / 0.45 = 2091 — покрывает 20:9, самый вытянутый ходовой формат.
const TARGET_H = 2091
/*
   Толщина полоски-донора — ровно одна строка.

   С полоской в десять строк стык рвался: растяжка заканчивалась десятой строкой
   оригинала, а сразу под ней шла нулевая, и на кубах у кромки разница доходила
   до 104 из 255 — проверка это и поймала. С одной строкой низ растяжки и верх
   оригинала — это одна и та же строка, разрыву взяться неоткуда.
*/
const DONOR = 1

function findPatchright() {
	const root = 'C:/Users/nurik/.vscode/extensions'
	const hit = fs
		.readdirSync(root)
		.filter((d) => d.startsWith('danielsanmedium.dscodegpt-'))
		.sort()
		.reverse()
		.map((d) => path.join(root, d, 'standalone/node_modules/patchright/index.mjs'))
		.find((p) => fs.existsSync(p))
	return 'file:///' + hit.split(String.fromCharCode(92)).join('/')
}
function findChromium() {
	const root = 'C:/Users/nurik/AppData/Local/ms-playwright'
	const builds = fs
		.readdirSync(root)
		.map((d) => /^(chromium(?:_headless_shell)?)-(\d+)$/.exec(d))
		.filter(Boolean)
		.map((m) => ({ dir: m[0], headless: m[1].includes('headless'), build: Number(m[2]) }))
		.sort((a, b) => b.build - a.build || Number(b.headless) - Number(a.headless))
	for (const b of builds) {
		const exe = b.headless
			? path.join(root, b.dir, 'chrome-headless-shell-win64/chrome-headless-shell.exe')
			: path.join(root, b.dir, 'chrome-win64/chrome.exe')
		if (fs.existsSync(exe)) return exe
	}
}

const { chromium } = await import(findPatchright())
const browser = await chromium.launch({ executablePath: findChromium() })
const page = await browser.newPage()

const b64 = fs.readFileSync(SRC).toString('base64')

const res = await page.evaluate(
	async ([data, targetH, donor]) => {
		const img = new Image()
		img.src = 'data:image/webp;base64,' + data
		await img.decode()
		const w = img.naturalWidth
		const h = img.naturalHeight
		if (h >= targetH) return { skipped: true, w, h }

		const pad = targetH - h
		const cv = document.createElement('canvas')
		cv.width = w
		cv.height = targetH
		const ctx = cv.getContext('2d')
		ctx.imageSmoothingEnabled = true
		ctx.imageSmoothingQuality = 'high'

		// Оригинал прижат к низу: облака и кубы внизу должны остаться нетронутыми.
		ctx.drawImage(img, 0, pad)

		// Донорская полоска, растянутая на весь добавленный верх.
		ctx.drawImage(img, 0, 0, w, donor, 0, 0, w, pad)

		// Растяжка сама по себе слишком равномерная и выдаёт себя полосами.
		// Уводим её верх в темноту — так это читается как глубина неба.
		const top = ctx.getImageData(0, 0, w, 1).data
		let r = 0
		let g = 0
		let b = 0
		for (let i = 0; i < top.length; i += 4) {
			r += top[i]
			g += top[i + 1]
			b += top[i + 2]
		}
		const n = w
		const avg = [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
		const deep = avg.map((v) => Math.round(v * 0.42))

		const grad = ctx.createLinearGradient(0, 0, 0, pad)
		grad.addColorStop(0, `rgb(${deep[0]},${deep[1]},${deep[2]})`)
		grad.addColorStop(0.55, `rgba(${deep[0]},${deep[1]},${deep[2]},0.55)`)
		grad.addColorStop(1, `rgba(${deep[0]},${deep[1]},${deep[2]},0)`)
		ctx.fillStyle = grad
		ctx.fillRect(0, 0, w, pad)

		// Шва быть не должно: сравниваем строку над стыком и под ним.
		const above = ctx.getImageData(0, pad - 1, w, 1).data
		const below = ctx.getImageData(0, pad + 1, w, 1).data
		let maxDiff = 0
		for (let i = 0; i < above.length; i += 4) {
			for (let c = 0; c < 3; c++) {
				maxDiff = Math.max(maxDiff, Math.abs(above[i + c] - below[i + c]))
			}
		}

		return {
			skipped: false,
			w,
			h,
			targetH,
			pad,
			avg,
			maxSeamDiff: maxDiff,
			url: cv.toDataURL('image/webp', 0.86),
		}
	},
	[b64, TARGET_H, DONOR]
)

if (res.skipped) {
	console.log('уже достроен:', res.w + 'x' + res.h)
} else {
	if (res.maxSeamDiff > 40)
		throw new Error('шов на стыке заметен: максимум ' + res.maxSeamDiff)
	const buf = Buffer.from(res.url.split(',')[1], 'base64')
	fs.writeFileSync(OUT, buf)
	console.log(
		JSON.stringify({
			было: res.w + 'x' + res.h,
			стало: res.w + 'x' + res.targetH,
			добавлено: res.pad,
			цветКромки: res.avg,
			максРазницаНаСтыке: res.maxSeamDiff,
			килобайт: Math.round(buf.length / 1024),
		})
	)
}

await browser.close()
