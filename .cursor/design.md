Сделай UI-часть приложения на Vue 3 + TypeScript + Vue Router + Pinia (Vite проект). Нужны страницы и общий layout. Пока без Pixi-логики игры — GamePage может содержать заглушку (div/canvas), но UI сверху должен быть готов.

ТРЕБОВАНИЯ ПО СТРАНИЦАМ:

1. StartPage ("/")

- По центру: логотип (можно SVG-заглушка) + название игры.
- Большая кнопка: "Выбрать режим" (ведёт на "/mode").
- Кнопка звука (mute/unmute) должна быть видна на странице (иконка в правом верхнем углу).
- Стиль: современный, тёмный фон, карточки с мягкими тенями/градиентом.

2. ModePage ("/mode")

- Заголовок "Режим".
- 2 больших карточки-кнопки:
  A) "Уровни" (Level Mode) -> ведёт на "/difficulty?mode=levels"
  B) "Бесконечный" (Endless Mode) -> ведёт на "/difficulty?mode=endless"
- На странице всегда кнопка звука (в шапке).

3. DifficultyPage ("/difficulty")

- Читает query param mode=levels|endless.
- Заголовок "Сложность".
- 3 карточки-кнопки:
  - Easy (например 4-5 цветов)
  - Normal (6)
  - Hard (7-8)
- При выборе:
  - если mode=endless -> переход сразу на "/game?mode=endless&difficulty=easy"
  - если mode=levels -> переход на "/levels?difficulty=easy"
- Кнопка "Назад".
- Кнопка звука (в шапке).

4. LevelsPage ("/levels")

- Используется только для Level Mode.
- Читает difficulty из query param difficulty=easy|normal|hard.
- Заголовок "Уровни".
- Сетка уровней (например 1..30) карточками (можно пока статически).
- Логика открытия: открыты уровни <= unlockedLevel[difficulty] (используй Pinia persisted store; дефолт 1).
- Заблокированные уровни серые и не кликаются.
- При клике на открытый: переход на "/game?mode=levels&difficulty=easy&level=1"
- Кнопка звука (в шапке).

5. GamePage ("/game")

- Читает query: mode, difficulty, level(optional).
- Сверху фиксированная панель:
  - слева: Время (формат mm:ss) — просто счётчик от запуска страницы
  - справа: Баллы (score) — пока число из store или локальное 0
- Также в шапке должна быть кнопка звука.
- Под шапкой: зона игры (пока placeholder) — контейнер для Pixi canvas (div с фиксированной высотой или flex).
- Кнопка "Назад" или "Выход" (опционально внизу или в шапке).
- Вся страница адаптивная под мобилку.

ОБЩИЕ ТРЕБОВАНИЯ:

- На ВСЕХ страницах должна быть кнопка звука, одна и та же, через общий AppLayout/TopBar компонент.
- Состояние звука хранить в Pinia store: isMuted boolean + toggleMute()
- Сохранять isMuted в localStorage (pinia-plugin-persistedstate или свой простой persist).
- Кнопка звука — иконка (SVG), меняется при mute/unmute.
- Используй чистую структуру компонентов:
  - src/app/router/index.ts
  - src/shared/stores/audioStore.ts
  - src/shared/components/AppLayout.vue (или BaseLayout)
  - src/shared/components/TopBar.vue (logo/title slot + sound button)
  - src/pages/\*.vue

РОУТЫ:

- "/" StartPage
- "/mode" ModePage
- "/difficulty" DifficultyPage
- "/levels" LevelsPage
- "/game" GamePage

ДИЗАЙН (примерный):

- Тёмный градиентный фон
- Карточки с border-radius 16-24, лёгкий blur/overlay
- Кнопки крупные, удобные для пальца
- Текст читабельный, аккуратные отступы

ПОЖАЛУЙСТА:

- Напиши весь код полностью: страницы, router, stores, базовые компоненты.
- Используй TypeScript в <script setup lang="ts">
- Сделай аккуратные классы (можно простой CSS scoped или SCSS).
- Убедись что проект запускается и маршрутизация работает.
