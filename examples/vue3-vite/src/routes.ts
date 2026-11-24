import type { RouteRecordRaw } from 'vue-router'
import { h } from 'vue'

/** Routes for the AppNav stories; plain render functions keep them tiny */
export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: {
      render: () => h('p', 'Welcome home'),
    },
  },
  {
    path: '/about',
    component: {
      render: () => h('p', 'About us'),
    },
  },
  {
    path: '/docs/:page',
    component: {
      props: ['page'],
      render: (ctx: { page: string }) => h('p', `Docs: ${ctx.page}`),
    },
    props: true,
  },
]
