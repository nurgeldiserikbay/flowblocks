import { createRouter, createWebHistory } from 'vue-router'
import StartPage from '@/pages/StartPage.vue'
import LevelsPage from '@/pages/LevelsPage.vue'
import GamePage from '@/pages/GamePage.vue'

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{
			path: '/',
			name: 'start',
			component: StartPage,
		},
		{
			path: '/levels',
			name: 'levels',
			component: LevelsPage,
		},
		{
			path: '/game',
			name: 'game',
			component: GamePage,
		},
	],
})

export default router
