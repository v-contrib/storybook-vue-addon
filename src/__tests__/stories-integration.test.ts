import type { Plugin, ViteDevServer } from 'vite'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { createServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRenderer, createSSRApp, h, nextTick, reactive } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { STORIES_SFC_SUFFIX } from '../stories-sfc'
import { vueStoriesPlugin } from '../vite-plugin'

const fixtures = fileURLToPath(new URL('./fixtures', import.meta.url))

async function startServer(plugins: Plugin[]): Promise<ViteDevServer> {
  return createServer({
    root: fixtures,
    configFile: false,
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false, watch: null },
    plugins,
  })
}

/** Render a story like Storybook does: render(args) returns a render function */
async function renderStory(mod: Record<string, any>, name: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const story = mod[name]
  const args = reactive({
    ...mod.default.args,
    ...story.args,
    ...overrides,
  })
  const render = story.render(args, { args })
  return renderToString(createSSRApp({
    render: () => h(render),
  }))
}

/** Collapse whitespace and drop SSR fragment comments, for readable assertions */
function text(html: string): string {
  return html.replace(/<!--[[\]]?-->/g, '').replace(/\s+/g, ' ')
}

describe('.stories.vue with story content (SSR, real @vitejs/plugin-vue)', () => {
  let server: ViteDevServer
  let mod: Record<string, any>

  beforeAll(async () => {
    server = await startServer([
      vueStoriesPlugin(),
      vue(),
    ])
    mod = await server.ssrLoadModule('/Card.stories.vue')
  })
  afterAll(() => server.close())

  it('keeps the story file\'s <style> blocks', async () => {
    const storiesId = `/Card.stories.vue${STORIES_SFC_SUFFIX}`
    const component = await server.transformRequest(storiesId)
    const styleImport = component!.code.match(/import ["']([^"']*type=style[^"']*)["']/)?.[1]
    expect(styleImport).toBeDefined()

    const resolved = await server.pluginContainer.resolveId(styleImport!, `${fixtures}${storiesId}`)
    expect(resolved!.id).toContain('?vue&type=style')
    const style = await server.transformRequest(styleImport!)
    expect(style!.code).toMatch(/\.badge ?\{ ?color: ?red/)
  })

  it('exports every story', () => {
    expect(mod.__namedExportsOrder).toEqual([
      'StaticSlots',
      'ArgsSlots',
      'MultipleRoots',
      'Simple',
    ])
    expect(Object.keys(mod).filter(k => k !== 'default' && k !== '__namedExportsOrder').sort())
      .toEqual([
        'ArgsSlots',
        'MultipleRoots',
        'Simple',
        'StaticSlots',
      ])
  })

  it('renders named, default and scoped slot content', async () => {
    const html = text(await renderStory(mod, 'StaticSlots'))

    expect(html).toContain('<header><strong>Header slot</strong>')
    expect(html).toContain('<section><p>Body typed note</p>')
    expect(html).toContain('<footer> Footer 2026</footer>')
  })

  it('uses components, variables (lang="ts") and v-for from <script setup>', async () => {
    const html = text(await renderStory(mod, 'StaticSlots'))

    expect(html).toContain('<span class="badge">new</span>')
    expect(html).toContain('typed note')
    expect(html).toContain('<li>a</li><li>b</li>')
  })

  it('turns the root component attributes of a static story into args', async () => {
    expect(mod.StaticSlots.args).toEqual({ title: 'Static title', elevated: true })
    expect(text(await renderStory(mod, 'StaticSlots'))).toContain('class="card elevated"')
    expect(text(await renderStory(mod, 'StaticSlots', { elevated: false }))).toContain('class="card"')
  })

  it('uses args inside slot content of an args story', async () => {
    expect(mod.ArgsSlots.args).toEqual({ title: 'From args', elevated: false })

    const html = text(await renderStory(mod, 'ArgsSlots'))
    expect(html).toContain('<header> Header for From args</header>')
    expect(html).not.toContain('Raised')

    const changed = text(await renderStory(mod, 'ArgsSlots', { title: 'Changed', elevated: true }))
    expect(changed).toContain('Header for Changed')
    expect(changed).toContain('<p class="raised"> Raised </p>')
  })

  it('renders multiple root elements', async () => {
    const html = text(await renderStory(mod, 'MultipleRoots'))

    expect(html).toContain('One')
    expect(html).toContain('Two')
    expect(mod.MultipleRoots.args).toBeUndefined()
  })

  it('keeps simple stories on the meta component with Storybook\'s own snippet', async () => {
    expect(mod.Simple.args).toEqual({ title: 'Plain' })
    expect(text(await renderStory(mod, 'Simple'))).toContain('Plain')

    // Storybook 10 emits its own Vue snippet: left as it is
    const { originalSource, transform } = mod.Simple.parameters.docs.source
    const context = {
      args: { title: 'Changed' },
      parameters: mod.Simple.parameters,
    }
    expect(transform('<template>\n  <Card title="Changed" />\n</template>', context))
      .toBe('<template>\n  <Card title="Changed" />\n</template>')
    // Storybook 11 (docgen server) has no snippet and transforms originalSource
    expect(originalSource).toBe('<Card title="Plain" />')
    expect(transform(originalSource, context)).toBe('<Card title="Changed" />')
  })

  it('gives stories with content their template as originalSource', () => {
    // Storybook 11's Code panel transforms originalSource; without it the panel stays empty
    const { originalSource } = mod.StaticSlots.parameters.docs.source
    expect(originalSource.split('\n')[0]).toBe('<Card title="Static title" elevated>')
    expect(originalSource.split('\n')[1]).toBe('  <template #header>')
    expect(originalSource.split('\n').at(-1)).toBe('</Card>')
  })

  it('docs snippet shows the story template with current args filled in', () => {
    const snippet = (name: string, args: Record<string, unknown>): string =>
      mod[name].parameters.docs.source.transform('', { args })

    expect(snippet('ArgsSlots', { title: 'From args', elevated: false })).toBe([
      '<Card title="From args">',
      '  <template #header>',
      '    Header for From args',
      '  </template>',
      '  <p v-if="args.elevated" class="raised">',
      '    Raised',
      '  </p>',
      '  Body',
      '</Card>',
    ].join('\n'))

    expect(snippet('StaticSlots', { title: 'Changed', elevated: false }).split('\n')[0])
      .toBe('<Card title="Changed">')
    expect(snippet('MultipleRoots', {})).toBe('<Card title="One" />\n<Card title="Two" />')
  })
})

/** @vitejs/plugin-vue compiling for the client, even when loaded through the SSR module runner */
function clientVuePlugin(): Plugin {
  const plugin = vue()
  const transform = plugin.transform as any
  const handler = typeof transform === 'function'
    ? transform
    : transform.handler
  const clientHandler = function (this: any, code: string, id: string, opts?: Record<string, unknown>): unknown {
    return handler.call(this, code, id, { ...opts, ssr: false })
  }
  plugin.transform = typeof transform === 'function'
    ? clientHandler as any
    : { ...transform, handler: clientHandler }
  return plugin
}

interface FakeNode {
  tag: string
  attrs: Record<string, unknown>
  children: FakeNode[]
  parent: FakeNode | null
  text: string
}

/** In-memory DOM, enough to mount and re-render a Vue app */
function createTestRenderer(): { mount: (render: () => unknown) => () => string } {
  const node = (tag: string, text = ''): FakeNode => ({
    tag,
    attrs: {},
    children: [],
    parent: null,
    text,
  })
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
  const html = (n: FakeNode): string => {
    if (n.tag === '#text')
      return n.text
    const inner = n.children.map(html).join('')
    if (n.tag === '#comment' || n.tag === '#root')
      return inner
    return `<${n.tag}${n.attrs.class
      ? ` class="${n.attrs.class}"`
      : ''}>${inner}</${n.tag}>`
  }
  return {
    mount(render) {
      const root = node('#root')
      createApp({
        render: () => h(render as any),
      }).mount(root)
      return () => html(root).replace(/\s+/g, ' ')
    },
  }
}

describe('.stories.vue with story content follows Controls (client compile)', () => {
  let server: ViteDevServer
  let mod: Record<string, any>

  beforeAll(async () => {
    server = await startServer([
      vueStoriesPlugin(),
      clientVuePlugin(),
    ])
    mod = await server.ssrLoadModule('/Card.stories.vue')
  })
  afterAll(() => server.close())

  /** Mount like Storybook's renderToCanvas, then update args in place like its updateArgs */
  async function mountAndUpdate(name: string, update: Record<string, unknown>, argTypes: Record<string, unknown> = {}): Promise<[string, string]> {
    const story = mod[name]
    const args = reactive({
      ...mod.default.args,
      ...story.args,
    })
    const read = createTestRenderer().mount(story.render(args, { args, argTypes }))
    const before = read()
    Object.assign(args, update)
    await nextTick()
    return [
      before,
      read(),
    ]
  }

  it('args story re-renders args used in slot content', async () => {
    const [before, after] = await mountAndUpdate('ArgsSlots', { title: 'Changed', elevated: true })

    expect(before).toContain('Header for From args')
    expect(after).toContain('Header for Changed')
    expect(after).toContain('<p class="raised"> Raised </p>')
  })

  it('static story re-renders when its root attribute args change', async () => {
    const [before, after] = await mountAndUpdate('StaticSlots', { elevated: false })

    expect(before).toContain('<article class="card elevated">')
    expect(after).toContain('<article class="card">')
    expect(after).toContain('<strong>Header slot</strong>')
  })

  /** Docgen puts slots in the "slots" category; Storybook's own render turns those args into slots */
  const slotArgTypes = {
    header: {
      table: { category: 'slots' },
    },
    footer: {
      table: { category: 'slots' },
    },
  }

  it('slot args from Controls replace slots written in the template', async () => {
    const [before, after] = await mountAndUpdate('StaticSlots', { footer: 'From controls' }, slotArgTypes)

    expect(before).toContain('<footer> Footer 2026</footer>')
    expect(after).toContain('<footer>From controls</footer>')
    expect(after).toContain('<strong>Header slot</strong>')
    expect(after).toContain('<article class="card elevated">')
  })

  it('slot args from Controls fill slots the template does not write', async () => {
    const [before, after] = await mountAndUpdate('ArgsSlots', { footer: 'From controls', title: 'Changed' }, slotArgTypes)

    expect(before).toContain('<footer></footer>')
    expect(after).toContain('<footer>From controls</footer>')
    expect(after).toContain('Header for Changed')
  })

  it('slot args from Controls fill slots of a simple story', async () => {
    const [, after] = await mountAndUpdate('Simple', { header: 'From controls' }, slotArgTypes)

    expect(after).toContain('<header>From controls</header>')
  })

  it('shows an object slot arg as JSON', async () => {
    const [, after] = await mountAndUpdate('StaticSlots', {
      footer: { year: 1999 },
    }, slotArgTypes)

    expect(after).toContain('<footer>{"year":1999}</footer>')
  })

  it('leaves slot args out of the docs snippet attributes', () => {
    const snippet = mod.StaticSlots.parameters.docs.source.transform('', {
      args: { title: 'T', footer: 'From controls' },
      argTypes: slotArgTypes,
    })

    expect(snippet.split('\n')[0]).toBe('<Card title="T">')
  })
})
