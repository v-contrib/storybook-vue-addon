import type { Component } from 'vue'
import type { Router, RouteRecordRaw } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h, nextTick, reactive } from 'vue'
import { createMemoryHistory, createRouter, RouterView, useRoute, useRouter } from 'vue-router'
import { mergeRouterOptions, withRouter } from '../router'

// Run with VUE_ROUTER=4 to test against vue-router 4 (see vitest.config.ts)
const logged = vi.hoisted(() => [] as Array<{ name: string, payload: unknown }>)
vi.mock('storybook/actions', () => ({
  action: (name: string) => (payload: unknown) => logged.push({ name, payload }),
}))

interface FakeNode { tag: string, text: string, attrs: Record<string, unknown>, children: FakeNode[], parent: FakeNode | null }

function node(tag: string, text = ''): FakeNode {
  const n: FakeNode = {
    tag,
    text,
    attrs: {},
    children: [],
    parent: null,
  }
  // Vue's dev build asks elements for their root node
  return Object.assign(n, {
    getRootNode: () => n,
  })
}
const { createApp } = createRenderer<FakeNode, FakeNode>({
  createElement: tag => node(tag),
  createText: value => node('#text', value),
  createComment: value => node('#comment', value),
  setText: (n, value) => { n.text = value },
  setElementText: (n, value) => {
    n.children = [
      node('#text', value),
    ]
  },
  insert(child, parent, anchor) {
    child.parent = parent
    const i = anchor
      ? parent.children.indexOf(anchor)
      : -1
    if (i >= 0)
      parent.children.splice(i, 0, child)
    else
      parent.children.push(child)
  },
  remove(child) {
    child.parent?.children.splice(child.parent.children.indexOf(child), 1)
  },
  parentNode: n => n.parent,
  nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
  patchProp(n, key, _prev, next) { n.attrs[key] = next },
})
function text(n: FakeNode): string {
  return n.tag === '#text'
    ? n.text
    : n.children.map(text).join('')
}

/** Settles pending navigations and renders */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise(resolve => setTimeout(resolve))
    await nextTick()
  }
}

const Home: Component = {
  render: () => h('p', 'Home page'),
}
const About: Component = {
  render: () => h('p', 'About page'),
}
const routes: RouteRecordRaw[] = [
  { path: '/', component: Home },
  { path: '/about', name: 'about', component: About },
  {
    path: '/docs/:page',
    component: {
      render: () => h('p', 'Docs'),
    },
  },
]

/** What the story under test sees of the router */
interface Seen { router?: Router, path?: string, optionsPath?: string }

/**
 * Mounts a story the way Storybook's Vue renderer applies a decorator: the
 * decorator's component gets the inner story registered as `story`.
 */
function mountStory(decorator: ReturnType<typeof withRouter>, context: { args?: Record<string, any> } = {}, setupApp?: (app: any) => void) {
  const seen: Seen = {}
  const Story = defineComponent({
    setup() {
      seen.router = useRouter()
      const route = useRoute()
      return () => {
        seen.path = route.fullPath
        return h('main', [
          h(RouterView),
        ])
      }
    },
    // Options API access
    created() {
      seen.optionsPath = (this as any).$route?.fullPath
    },
  })
  const Decorated = {
    ...decorator(() => Story, context),
    components: {
      story: () => h(Story),
    },
  }
  const root = node('#root')
  const app = createApp(Decorated)
  setupApp?.(app)
  app.mount(root)
  return { root, seen, app }
}

beforeEach(() => {
  logged.length = 0
})

describe('withRouter', () => {
  it('renders the story at the initial route; useRoute() and this.$route work', async () => {
    const { root, seen } = mountStory(withRouter({ routes, initialRoute: '/about' }))
    await flush()

    expect(text(root)).toBe('About page')
    expect(seen.path).toBe('/about')
    expect(seen.optionsPath).toBeDefined()
    expect(seen.router!.currentRoute.value.fullPath).toBe('/about')
  })

  it('works without routes: any path matches a route that renders nothing', async () => {
    const { root, seen } = mountStory(withRouter(true))
    await flush()
    await seen.router!.push('/anything/here')
    await flush()

    expect(seen.path).toBe('/anything/here')
    expect(text(root)).toBe('')
  })

  it('gives every mount its own router with memory history', async () => {
    const a = mountStory(withRouter({ routes }))
    const b = mountStory(withRouter({ routes }))
    await flush()
    a.seen.router!.addRoute({ path: '/only-a', component: Home })
    await a.seen.router!.push('/about')
    await flush()

    expect(a.seen.router).not.toBe(b.seen.router)
    expect(b.seen.path).toBe('/')
    expect(b.seen.router!.hasRoute('about')).toBe(true)
    expect(b.seen.router!.resolve('/only-a').matched).toHaveLength(0)
    expect(a.seen.router!.options.history.base).toBe('')
  })

  it('logs navigations (not the initial one) to Actions', async () => {
    const { seen } = mountStory(withRouter({ routes }))
    await flush()
    expect(logged).toEqual([])

    await seen.router!.push('/about')
    expect(logged).toEqual([
      {
        name: 'router:navigate',
        payload: { to: '/about', from: '/' },
      },
    ])
  })

  it('can turn logging off', async () => {
    const { seen } = mountStory(withRouter({ routes, logNavigation: false }))
    await flush()
    await seen.router!.push('/about')

    expect(logged).toEqual([])
  })

  it('applies beforeEach and router options', async () => {
    const { seen } = mountStory(withRouter({
      routes,
      beforeEach: to => to.path === '/about'
        ? '/'
        : true,
      routerOptions: { linkActiveClass: 'is-active' },
    }))
    await flush()
    await seen.router!.push('/about')
    await flush()

    expect(seen.path).toBe('/')
    expect(seen.router!.options.linkActiveClass).toBe('is-active')
  })

  it('follows args when initialRoute is a function (Controls)', async () => {
    const args = reactive({ page: 'intro' })
    const { root, seen } = mountStory(withRouter({
      routes,
      initialRoute: a => `/docs/${a.page}`,
    }), { args })
    await flush()
    expect(seen.path).toBe('/docs/intro')
    expect(text(root)).toBe('Docs')

    args.page = 'api'
    await flush()
    expect(seen.path).toBe('/docs/api')
  })

  it('accepts a named route location', async () => {
    const { seen } = mountStory(withRouter({
      routes,
      initialRoute: {
        name: 'about',
        query: { tab: '2' },
      },
    }))
    await flush()

    expect(seen.path).toBe('/about?tab=2')
  })

  it('provides its own router to the story when the app already has one', async () => {
    const appRouter = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/:all(.*)*', component: Home },
      ],
    })
    const { root, seen } = mountStory(withRouter({ routes, initialRoute: '/about' }), {}, app => app.use(appRouter))
    await flush()

    expect(seen.router).not.toBe(appRouter)
    expect(seen.path).toBe('/about')
    expect(text(root)).toBe('About page')
    expect(appRouter.currentRoute.value.fullPath).not.toBe('/about')
  })
})

describe('test setup', () => {
  it('runs against the vue-router major in VUE_ROUTER (default 5)', async () => {
    const { version } = (await import('vue-router/package.json')).default

    expect(version.split('.')[0]).toBe(process.env.VUE_ROUTER ?? '5')
  })
})

describe('mergeRouterOptions', () => {
  it('merges left to right and ignores true/undefined', () => {
    expect(mergeRouterOptions({ routes, initialRoute: '/' }, true, undefined, { initialRoute: '/about' }))
      .toEqual({ routes, initialRoute: '/about' })
  })
})
