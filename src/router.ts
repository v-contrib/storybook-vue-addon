/**
 * Router helper for stories: `@v-contrib/storybook-vue-addon/router`.
 *
 * `withRouter()` is a Storybook decorator that gives each story its own
 * vue-router instance with memory history. In a .stories.vue file the
 * `router` prop on `<Meta>` and `<Story>` compiles to it.
 *
 * Works with vue-router 4 and 5 (an optional peer dependency of the addon).
 */
import type { App, Component, Ref } from 'vue'
import type {
  NavigationGuardWithThis,
  RouteLocationNormalizedLoaded,
  RouteLocationRaw,
  Router,
  RouteRecordRaw,
  RouterOptions,
} from 'vue-router'
import { action } from 'storybook/actions'
import { computed, defineComponent, getCurrentInstance, h, provide, reactive, resolveComponent, watch } from 'vue'
import {
  createMemoryHistory,
  createRouter,
  routeLocationKey,
  routerKey,
  RouterLink,
  RouterView,
  routerViewLocationKey,
  START_LOCATION,
} from 'vue-router'

export interface RouterStoryOptions {
  /**
   * Routes of the story's router. Default: one catch-all route that renders
   * nothing, so any `<router-link>` works without setting up routes.
   */
  routes?: RouteRecordRaw[]
  /**
   * Where the story starts. Default `'/'`. A function gets the story's args,
   * so the route can follow Controls (it navigates when the result changes).
   */
  initialRoute?: RouteLocationRaw | ((args: Record<string, any>) => RouteLocationRaw)
  /** Global navigation guard of the story's router */
  beforeEach?: NavigationGuardWithThis<undefined>
  /** More options for `createRouter`, e.g. `linkActiveClass`. Default history: memory history */
  routerOptions?: Partial<RouterOptions>
  /** Log navigations to the Actions panel (`router:navigate`). Default: true */
  logNavigation?: boolean
}

/** What the `router` prop accepts: options, or `true` for the defaults */
export type RouterStoryOption = RouterStoryOptions | boolean | undefined | null

const Empty: Component = {
  name: 'VueCsfEmptyRoute',
  render: () => null,
}
const DEFAULT_ROUTES: RouteRecordRaw[] = [
  { path: '/:pathMatch(.*)*', component: Empty },
]

/** Merges option sets left to right; `true`, `false`, `null` and `undefined` add nothing */
export function mergeRouterOptions(...optionSets: RouterStoryOption[]): RouterStoryOptions {
  const merged: RouterStoryOptions = {}
  for (const options of optionSets) {
    if (options && typeof options === 'object')
      Object.assign(merged, options)
  }
  return merged
}

/** Provides a router to a component subtree, as `app.use(router)` does for an app */
function provideRouter(router: Router): void {
  const route = {} as Record<string, Ref<unknown>>
  for (const key of Object.keys(START_LOCATION) as Array<keyof RouteLocationNormalizedLoaded>)
    route[key] = computed(() => router.currentRoute.value[key])
  provide(routerKey, router)
  provide(routeLocationKey, reactive(route) as unknown as RouteLocationNormalizedLoaded)
  provide(routerViewLocationKey, router.currentRoute)
}

function hasRouter(app: App): boolean {
  return !!app.config.globalProperties.$router
}

/**
 * Storybook decorator that renders the story inside its own router.
 *
 * Each mount (story switch, remount, every Docs canvas) creates a new router
 * with memory history, so routes, guards and history never leak between
 * stories and the preview URL does not change. When the story's Vue app has
 * no router yet, the router is installed on it (`app.use`), so `$route` and
 * `$router` work in the Options API too. Otherwise, e.g. when preview.ts
 * installs an app router, the story's router is provided to its subtree only.
 *
 * Several option sets are merged left to right (meta options, then story options).
 */
export function withRouter(...optionSets: RouterStoryOption[]) {
  const options = mergeRouterOptions(...optionSets)

  return (_story: unknown, context: { args?: Record<string, any> }) => defineComponent({
    name: 'VueCsfRouter',
    setup() {
      const args = (): Record<string, any> => context?.args ?? {}
      const target = (): RouteLocationRaw => {
        const initial = options.initialRoute ?? '/'
        return typeof initial === 'function'
          ? initial(args())
          : initial
      }

      const history = options.routerOptions?.history ?? createMemoryHistory()
      const router = createRouter({
        ...options.routerOptions,
        history,
        routes: options.routes ?? options.routerOptions?.routes ?? DEFAULT_ROUTES,
      })
      if (options.beforeEach)
        router.beforeEach(options.beforeEach)
      if (options.logNavigation !== false) {
        const log = action('router:navigate')
        router.afterEach((to, from, failure) => {
          // Not the story's initial navigation, and not a blocked one
          if (from !== START_LOCATION && !failure)
            log({ to: to.fullPath, from: from.fullPath })
        })
      }

      // Start at the initial route. The history starts there too, so the
      // navigation app.use() itself starts (in a browser) goes to the same place.
      const start = router.resolve(target()).fullPath
      history.replace(start)
      const app = getCurrentInstance()!.appContext.app
      if (hasRouter(app))
        provideRouter(router)
      else
        app.use(router)
      router.replace(start)
      // In case app.use did not register them (e.g. a second router on the app)
      app.component('RouterLink') ?? app.component('RouterLink', RouterLink)
      app.component('RouterView') ?? app.component('RouterView', RouterView)

      // A route that depends on args follows Controls
      if (typeof options.initialRoute === 'function') {
        watch(() => router.resolve(target()).fullPath, (path) => {
          if (path !== router.currentRoute.value.fullPath)
            router.replace(path)
        })
      }

      // Storybook's Vue renderer registers the decorated story as `story`
      return () => h(resolveComponent('story') as Component)
    },
  })
}
