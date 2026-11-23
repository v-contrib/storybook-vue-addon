import type { ViteDevServer } from 'vite'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import VueMacros from 'unplugin-vue-macros/vite'
import { createServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createSSRApp, h, reactive } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { vueStoriesPlugin } from '../vite-plugin'

const root = fileURLToPath(new URL('./fixtures/macros', import.meta.url))

/**
 * A typical Vue app setup: Vue Macros (default options) wrapping plugin-vue,
 * auto-imported APIs and auto-registered components. Story files must compile
 * without extra config, and still get the auto imports.
 */
describe('.stories.vue with unplugin-vue-macros, auto-import and vue-components', () => {
  let server: ViteDevServer

  beforeAll(async () => {
    server = await createServer({
      root,
      configFile: false,
      logLevel: 'error',
      server: { middlewareMode: true, hmr: false, watch: null },
      plugins: [
        vueStoriesPlugin(),
        VueMacros({
          plugins: {
            vue: vue(),
          },
        }),
        AutoImport({
          imports: ['vue'],
          dts: false,
        }),
        Components({
          dirs: ['components'],
          dts: false,
        }),
      ],
    })
  })
  afterAll(() => server?.close())

  it('compiles the story file (named-template does not re-parse the CSF output)', async () => {
    const result = await server.transformRequest('/Pill.stories.vue')
    expect(result!.code).toMatch(/\bAutoImported\b/)
    expect(result!.code).toContain('import { ref }')
  })

  it('renders a story using auto-imported ref() and an auto-registered component', async () => {
    const mod = await server.ssrLoadModule('/Pill.stories.vue')
    const story = mod.AutoImported
    const args = reactive({
      ...mod.default.args,
      ...story.args,
    })
    const html = await renderToString(createSSRApp({
      render: () => h(story.render(args, { args })),
    }))
    expect(html.replace(/<!--[[\]]?-->/g, '')).toContain('<span class="pill">count 3!</span>')
  })
})
