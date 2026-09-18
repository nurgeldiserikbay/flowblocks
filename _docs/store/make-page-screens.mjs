// Снимает все экраны FlowBlocks — то, что игрок вообще может увидеть: старт,
// «Другие игры», генерация поля, доска в начале партии, выделенный блок,
// набранная партия, бонусный тост, диалог выхода, поражение и промо-полоса
// на экране поражения. Портрет 780×1688 (390×844 при dpr 2).
//
// Это не витрина Google Play. Витрина снимается в трёх классах устройств и
// прячет рекламную полосу; здесь наоборот — один телефонный вьюпорт и полоса
// на месте, потому что она часть экрана и её поломку надо видеть. Этот прогон
// нужен после каждой правки, а не перед выкладкой.
//
// Дев-сервер скрипт поднимает сам: `node` на этой машине не лежит в PATH, а
// `process.execPath` указывает на тот самый интерпретатор, которым запущен
// скрипт, — поэтому vite стартует без отдельной настройки окружения.
//
// Запуск из корня проекта:
//   node _docs/store/make-page-screens.mjs [порт]

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '../..')
const OUT = path.join(ROOT, '_docs/screens/pages')
const PORT = process.argv[2] || '4316'

/** Путь до patchright внутри расширения — версия меняется, поэтому ищем сами. */
function findPatchright() {
	const root = 'C:/Users/nurik/.vscode/extensions'
	const hit = fs
		.readdirSync(root)
		.filter((d) => d.startsWith('danielsanmedium.dscodegpt-'))
		.sort()
		.reverse()
		.map((d) =>
			path.join(root, d, 'standalone/node_modules/patchright/index.mjs')
		)
		.find((p) => fs.existsSync(p))
	if (!hit) throw new Error('patchright не найден в расширениях VSCode')
	return 'file:///' + hit.split(String.fromCharCode(92)).join('/')
}

/**
 * Браузер берём свой, а не тот, что прописан внутри patchright.
 *
 * Расширение обновляется само и приносит patchright, который ждёт ровно свою
 * сборку Chromium, — а скачать её некому, `npx playwright install` тут никто не
 * запускает. Один раз прогон так и слёг: расширение уехало с 3.24.68 на 3.24.71,
 * и запуск упал на «Executable doesn't exist ... chromium_headless_shell-1243».
 *
 * Установленные сборки лежат рядом и работают; берём самую свежую из них.
 * Headless-shell предпочтительнее полного chrome: он для того и собран.
 */
function findChromium() {
	const root = 'C:/Users/nurik/AppData/Local/ms-playwright'
	if (!fs.existsSync(root)) return undefined

	const builds = fs
		.readdirSync(root)
		.map((d) => /^(chromium(?:_headless_shell)?)-(\d+)$/.exec(d))
		.filter(Boolean)
		.map((m) => ({
			dir: m[0],
			headless: m[1].includes('headless'),
			build: Number(m[2]),
		}))
		// Сначала по свежести сборки, при равной — headless-shell.
		.sort((a, b) => b.build - a.build || Number(b.headless) - Number(a.headless))

	for (const b of builds) {
		const exe = b.headless
			? path.join(root, b.dir, 'chrome-headless-shell-win64/chrome-headless-shell.exe')
			: path.join(root, b.dir, 'chrome-win64/chrome.exe')
		if (fs.existsSync(exe)) return exe
	}
	return undefined
}

// -------------------------------------------------------------- сервер ----

const vite = spawn(
	process.execPath,
	[
		path.join(ROOT, 'node_modules/vite/bin/vite.js'),
		'--mode',
		'development',
		'--port',
		PORT,
		'--strictPort',
	],
	{ cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
)

const viteLog = []
vite.stdout.on('data', (b) => viteLog.push(String(b)))
vite.stderr.on('data', (b) => viteLog.push(String(b)))

// Готовность ищется в выводе без раскраски. Vite подсвечивает порт отдельно,
// и в сыром потоке между «localhost:» и номером стоят управляющие escape-коды —
// подстрока с портом там не находится никогда.
const plainLog = () => viteLog.join('').replace(/\u001b\[[0-9;]*m/g, '')

await new Promise((ok, fail) => {
	const timer = setTimeout(
		() => fail(new Error('vite не поднялся за 60 с:\n' + plainLog())),
		60000
	)
	const watch = setInterval(() => {
		if (plainLog().includes('localhost:' + PORT)) {
			clearInterval(watch)
			clearTimeout(timer)
			ok()
		}
	}, 250)
	vite.on('exit', (code) => {
		clearInterval(watch)
		clearTimeout(timer)
		fail(new Error('vite упал (' + code + '):\n' + plainLog()))
	})
})

const URL = 'http://localhost:' + PORT + '/'

// ------------------------------------------------------------- браузер ----

fs.mkdirSync(OUT, { recursive: true })
for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f))

const { chromium } = await import(findPatchright())
const browser = await chromium.launch({ executablePath: findChromium() })
const page = await browser.newPage({
	viewport: { width: 390, height: 844 },
	deviceScaleFactor: 2,
	locale: 'en',
})

const errors = []
const shots = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 200)))

/*
   Сбор ошибок внутри страницы.

   `pageerror` ловит не всё: ошибка внутри хука Vue приходит отвергнутым
   промисом, а этого события он не вызывает. Здесь это особенно важно — партия
   живёт на промисах: волна, каскад матчей и анимации рендерера ждут друг друга
   через await, и упавший промис не уронит страницу, а тихо подвесит доску.
   Поэтому слушаем и то, и другое изнутри страницы.
*/
await page.addInitScript(() => {
	window.__errs = []
	addEventListener('error', (e) =>
		window.__errs.push('error: ' + (e.message || e.type))
	)
	addEventListener('unhandledrejection', (e) =>
		window.__errs.push(
			'rejection: ' +
				String(e.reason && e.reason.message ? e.reason.message : e.reason)
		)
	)
})
page.on('console', (m) => {
	// Вебсокет HMR и MIME-предупреждения дев-сервера к игре не относятся.
	if (m.type() === 'error' && !/websocket|MIME|net::ERR|vite/i.test(m.text())) {
		errors.push('console: ' + m.text().slice(0, 200))
	}
})

const shot = async (name) => {
	await page.screenshot({ path: path.join(OUT, name + '.png') })
	shots.push(name)
}

const has = async (sel) => (await page.locator(sel).count()) > 0

/** Состояние партии читается из HUD: доступа к стору со страницы нет. */
const hud = () =>
	page.evaluate(() => ({
		score: Number(
			(document.querySelector('.game-header__score')?.textContent || '').replace(
				/\D/g,
				''
			)
		),
		wave: Number(
			(document.querySelector('.game-header__wave')?.textContent || '').replace(
				/\D/g,
				''
			)
		),
		over: !!document.querySelector('.game-overlay'),
		toast: !!document.querySelector('.game-message-toast'),
	}))

/**
 * Геометрия поля.
 *
 * Поле рисуется в один canvas, и клетка считается ровно так же, как это делает
 * сама игра в `getPositionFromEvent`: сторона клетки — ширина canvas, делённая
 * на шесть колонок. Канвас выше экрана и проскроллен к низу, поэтому `top` у
 * него отрицательный, а видима только нижняя часть — её и берём.
 */
const WIDTH = 6

const geometry = () =>
	page.evaluate(() => {
		const cv = document.querySelector('canvas')
		const play = document.querySelector('.game-page__play-area')
		if (!cv || !play) return null
		const r = cv.getBoundingClientRect()
		const p = play.getBoundingClientRect()
		return {
			x: r.left,
			y: r.top,
			w: r.width,
			h: r.height,
			playTop: p.top,
			playBottom: p.bottom,
		}
	})

/** Ряды, попадающие в видимую часть поля с запасом от шапки и полосы внизу. */
function visibleRows(g) {
	const tile = g.w / WIDTH
	const rows = []
	for (let r = 0; r < Math.round(g.h / tile); r++) {
		const y = g.y + (r + 0.5) * tile
		if (y > g.playTop + 40 && y < g.playBottom - 90) rows.push(r)
	}
	return rows
}

const cellAt = (g, r, c) => {
	const tile = g.w / WIDTH
	return { x: g.x + (c + 0.5) * tile, y: g.y + (r + 0.5) * tile }
}

/**
 * Ход. Свап делается двумя тапами по соседним клеткам: игра поддерживает и
 * свайп, и два тапа, а тапы не зависят от порога свайпа и потому надёжнее.
 *
 * Цвета блоков со страницы не видны — стор наружу не выставлен, а поле живёт в
 * canvas, — поэтому пара берётся вслепую. Это не мешает: за партию набирается и
 * счёт, и волны, тем более что матчи складываются и сами, при подсеве волны.
 */
async function swap(g, rows) {
	const r = rows[Math.floor(Math.random() * rows.length)]
	const c = Math.floor(Math.random() * (WIDTH - 1))
	const a = cellAt(g, r, c)
	const b = cellAt(g, r, c + 1)
	await page.mouse.click(a.x, a.y)
	await page.waitForTimeout(130)
	await page.mouse.click(b.x, b.y)
	await page.waitForTimeout(800)
}

// --------------------------------------------------------------- старт ----

await page.goto(URL, { waitUntil: 'networkidle' })
// Логотип и плитки выезжают — даём анимации встать.
await page.waitForTimeout(1600)
await shot('01-start')

/*
   Кнопка «Другие игры» проверяется на перекрытие, а не просто нажимается.

   Обе кнопки в шапке — `position: fixed` с одним z-index, и попадание по ним
   решает порядок в разметке, а не вёрстка. Playwright обычный клик тут не
   пропускает, но `force` пропустил бы — и набор собрался бы зелёным на
   игре, где кнопка недоступна пальцу. Поэтому спрашиваем у страницы, что
   лежит в центре кнопки, и только потом жмём принудительно, чтобы снять
   оставшиеся кадры.
*/
const promoHit = await page.evaluate(() => {
	const promo = document.querySelector('.promo-games')
	if (!promo) return { found: false }
	const b = promo.getBoundingClientRect()
	const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
	return {
		found: true,
		reachable: !!top && (top === promo || promo.contains(top)),
		covers: top ? top.closest('button')?.className || top.nodeName : null,
	}
})
if (!promoHit.found) errors.push('кнопки «Другие игры» нет на старте')
else if (!promoHit.reachable)
	errors.push(
		'кнопка «Другие игры» перекрыта и не нажимается: в её центре лежит ' +
			promoHit.covers
	)

/*
   Открываем событием, а не кликом по координатам.

   `force` тут не помогает: он снимает проверку доступности, но всё равно
   целится в точку, а в точке лежит кнопка звука — прогон её и нажимал,
   выключая звук вместо открытия раздела. Событие адресовано самому элементу и
   до перекрытия ему дела нет.
*/
await page.locator('.promo-games').dispatchEvent('click')
await page.waitForTimeout(700)
if (!(await has('.games'))) errors.push('со старта не открылись «Другие игры»')
await shot('02-other-games')
await page.locator('.games__close').click()
await page.waitForTimeout(500)

// -------------------------------------------------------------- партия ----

await page.locator('.play-button').click()
// Спиннер генерации живёт недолго — ловим его сразу, пока поле собирается.
await page.waitForTimeout(350)
if (await has('.generation-loading')) await shot('03-generating')
await page.waitForSelector('canvas', { timeout: 20000 })
await page.waitForTimeout(5500)

let g = await geometry()
if (!g) throw new Error('поле не отрисовалось: canvas или play-area не найдены')
let rows = visibleRows(g)
if (!rows.length) throw new Error('видимых рядов поля нет: ' + JSON.stringify(g))
await shot('04-board-start')

/*
   Выделенный блок.

   Проверять выделение приходится картинкой. Подсветку рисует рендерер внутри
   canvas, в DOM от неё нет ничего, а блок с исчерпанными ходами не выделяется
   вовсе — тап по нему просто снимает выбор. Поэтому снимок клетки до и после
   тапа сравнивается побайтово: не изменилась — блок не тот, пробуем соседний.
   Без этой проверки в набор попадал бы кадр обычной доски под именем
   «выделено», и заметить это можно было бы только глазами.
*/
let selected = false
for (const r of rows.slice(-4).reverse()) {
	for (let c = 0; c < WIDTH && !selected; c++) {
		const p = cellAt(g, r, c)
		const tile = g.w / WIDTH
		const clip = {
			x: p.x - tile / 2,
			y: p.y - tile / 2,
			width: tile,
			height: tile,
		}
		const before = await page.screenshot({ clip })
		await page.mouse.click(p.x, p.y)
		await page.waitForTimeout(450)
		const after = await page.screenshot({ clip })
		if (!before.equals(after)) {
			await shot('05-block-selected')
			selected = true
			// Снимаем выбор тем же тапом, чтобы он не мешал следующим ходам.
			await page.mouse.click(p.x, p.y)
			await page.waitForTimeout(300)
		}
	}
	if (selected) break
}
if (!selected) errors.push('ни один блок не подсветился при тапе')

// Набранная партия: пустой счёт и нулевая волна ничего не показывают.
// Заодно ловим бонусный тост — он выпадает сам и живёт две секунды.
let toastShot = false
for (let i = 0; i < 45; i++) {
	const s = await hud()
	if (s.over) break
	if (s.toast && !toastShot) {
		await shot('06-bonus-toast')
		toastShot = true
	}
	if (s.score > 400 && s.wave >= 1) break
	g = (await geometry()) || g
	rows = visibleRows(g)
	if (!rows.length) break
	await swap(g, rows)
}

const played = await hud()
if (!played.over) {
	if (!played.score) errors.push('за партию не набралось ни очка')
	await shot('07-board-played')

	// Диалог выхода.
	await page.locator('.game-header__exit').click()
	await page.waitForTimeout(600)
	if (!(await has('.confirm-dialog'))) errors.push('диалог выхода не открылся')
	await shot('08-exit-dialog')

	// Отмена обязательна: подтверждение увело бы на старт, а партия нужна
	// дальше для экрана поражения. Заодно это проверка самой кнопки — если
	// отмена не закрывает диалог, поражение просто не будет видно под ним.
	await page.locator('.confirm-dialog__btn--cancel').click()
	await page.waitForTimeout(600)
	if (await has('.confirm-dialog'))
		errors.push('отмена не закрыла диалог выхода')
}

// ----------------------------------------------------------- поражение ----

/*
   Поражение ждём, а не подгоняем.

   Ускорить прогон можно было бы только разгоном таймеров, а это ломает саму
   игру: в соседнем 04-FruitoPao разгон в двадцать раз сжал таймер уровня с
   двухсот секунд до десяти, бот проигрывал партию под руками скрипта, и в
   принятый набор попал экран поражения вместо победного. Здесь ходов не делаем
   вовсе — волна подсевает четыре ряда каждые ~23 секунды, и сосуд в тридцать
   рядов заполняется сам за несколько минут.
*/
const deadline = Date.now() + 420000
while (Date.now() < deadline) {
	const s = await hud()
	if (s.over) break
	if (s.toast && !toastShot) {
		await shot('06-bonus-toast')
		toastShot = true
	}
	await page.waitForTimeout(2000)
}

if (await has('.game-overlay')) {
	await page.waitForTimeout(800)
	await shot('09-game-over')

	// Промо-полоса внизу нажимается только на поражении: во время партии она
	// намеренно не кликается, чтобы случайный тап мимо поля не уводил из игры.
	if (await has('.house--tap')) {
		/*
		   Полоса тоже проверяется на перекрытие.

		   Нажимаемой она становится ровно на поражении — а поражение рисует
		   `.game-overlay`, растянутый на всю игровую область поверх низа. Если
		   полоса оказалась под ним, тап до неё не доходит ни у бота, ни у
		   игрока, и кадр ниже снят событием, а не пальцем.
		*/
		const houseHit = await page.evaluate(() => {
			const house = document.querySelector('.house--tap')
			const b = house.getBoundingClientRect()
			const top = document.elementFromPoint(
				b.left + b.width / 2,
				b.top + b.height / 2
			)
			return {
				reachable: !!top && (top === house || house.contains(top)),
				covers: top ? top.className || top.nodeName : null,
			}
		})
		if (!houseHit.reachable)
			errors.push(
				'промо-полоса на поражении перекрыта и не нажимается: поверх неё ' +
					houseHit.covers
			)

		await page.locator('.house--tap').dispatchEvent('click')
		await page.waitForTimeout(700)
		if (!(await has('.games')))
			errors.push('полоса на поражении не открыла «Другие игры»')
		await shot('10-other-games-in-game')
		await page.locator('.games__close').click()
		await page.waitForTimeout(500)
	} else {
		errors.push('на поражении полоса не стала нажимаемой')
	}

	/*
	   Перезапуск проверяется, а не снимается.

	   Кнопка пересобирает доску целиком — и всё, что осталось в партии от
	   прошлых правок, вылезает именно здесь. Проверка нужна отдельной строкой:
	   без неё развалившийся перезапуск выглядел бы зелёным прогоном, потому что
	   скрипт снял бы поражение и закрылся, ни разу не нажав кнопку.
	*/
	await page.locator('.btn--restart').click()
	await page.waitForTimeout(6000)
	const back = await hud()
	const alive = await geometry()
	if (back.over || !alive)
		errors.push('перезапуск не поднял доску: ' + JSON.stringify({ back, alive }))
} else {
	errors.push('поражение не наступило за отведённое время')
}

// ------------------------------------------------------------ проверка ----

errors.push(...(await page.evaluate(() => window.__errs || [])))
await browser.close()
vite.kill()

// Битый PNG выглядит как обычный файл: заголовок на месте, а картинки нет.
// Прецедент был в соседней игре, поэтому сверяем размер каждого кадра, а не
// только его наличие.
const checked = []
for (const name of fs.readdirSync(OUT).sort()) {
	const buf = fs.readFileSync(path.join(OUT, name))
	checked.push({
		файл: name,
		размер: buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20),
		килобайт: Math.round(buf.length / 1024),
	})
}
const плохие = checked.filter(
	(c) => c.размер !== '780x1688' || c.килобайт < 5
)

console.log(
	JSON.stringify(
		{ кадров: shots.length, shots, плохие, errors, checked },
		null,
		1
	)
)
if (errors.length || плохие.length) process.exitCode = 1
