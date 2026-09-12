import type { Plugin } from 'vite'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { STORIES_SFC_SUFFIX } from '../stories-sfc'
import { STORY_FILE_PATTERN, vueStoriesPlugin } from '../vite-plugin'

const STORY = `
<script setup lang="ts">
import Button from './Button.vue'
</script>

<template>
  <Meta title="Test/Button" :component="Button" />
  <Story name="Default">
    <Button label="Test" />
  </Story>
</template>
`

type TransformFn = (this: any, code: string, id: string) => any

function transformHandler(plugin: Plugin): TransformFn {
  const t = plugin.transform as any
  return typeof t === 'function'
    ? t
    : t.handler
}

async function transform(plugin: Plugin, code: string, id: string): Promise<any> {
  return await transformHandler(plugin).call({
    error: vi.fn(),
  }, code, id)
}

function configResolved(plugin: Plugin, plugins: Plugin[]) {
  (plugin.configResolved as any)({ plugins })
}

/** Minimal stand-in for @vitejs/plugin-vue's exclude API */
function fakeVuePlugin(exclude?: unknown, locked = false): Plugin {
  let current = exclude
  return {
    name: 'vite:vue',
    transform: vi.fn(() => 'vue output'),
    api: {
      get exclude() { return current },
      set exclude(value) {
        if (locked)
          throw new Error('exclude cannot be updated after `options` hook is called')
        current = value
      },
    },
  }
}

describe('vueStoriesPlugin', () => {
  it('returns a Vite plugin object with transform and stories component hooks', () => {
    const plugin = vueStoriesPlugin()

    expect(plugin.name).toBe('vite-plugin-vue-stories')
    expect(plugin.enforce).toBe('pre')
    expect(typeof plugin.transform).toBe('function')
    expect(typeof plugin.resolveId).toBe('function')
    expect(typeof plugin.load).toBe('function')
    expect(typeof plugin.hotUpdate).toBe('function')
  })

  it.each(['Button.svue', 'Button.stories.vue', '/abs/src/Button.stories.vue'])('transforms %s to CSF', async (id) => {
    const result = await transform(vueStoriesPlugin(), STORY, id)

    expect(result.code).toMatch(/title: ["']Test\/Button["']/)
    expect(result.code).toContain('__vueCsfStory_Default as Default')
    expect(result.code).toContain('export default')
    expect(result.code).toMatch(/import \{ h as __vueCsfH \} from ["']vue["']/)
  })

  it.each(['Button.vue', 'Button.stories.ts', 'Button.story.vue'])('ignores %s', async (id) => {
    expect(await transform(vueStoriesPlugin(), STORY, id)).toBeNull()
  })

  it('handles query strings in file paths', async () => {
    const plugin = vueStoriesPlugin()

    expect((await transform(plugin, STORY, 'Button.svue?import')).code).toContain('__vueCsfStory_Default as Default')
    expect((await transform(plugin, STORY, 'Button.stories.vue?t=123')).code).toContain('__vueCsfStory_Default as Default')
  })

  it('ignores plugin-vue sub-requests', async () => {
    expect(await transform(vueStoriesPlugin(), STORY, 'Button.stories.vue?vue&type=style&index=0&lang.css')).toBeNull()
  })

  it('uses custom include pattern', async () => {
    const plugin = vueStoriesPlugin({ include: /\.story\.vue$/ })

    expect(await transform(plugin, STORY, 'Button.svue')).toBeNull()
    expect((await transform(plugin, STORY, 'Button.story.vue')).code).toContain('__vueCsfStory_Default as Default')
  })

  it('reports parse errors through this.error', async () => {
    const error = vi.fn()
    await transformHandler(vueStoriesPlugin()).call({ error }, '<template><Story', 'Broken.stories.vue')

    expect(error).toHaveBeenCalledWith(expect.stringContaining('Failed to transform Broken.stories.vue'))
  })
})

describe('story file pattern', () => {
  it.each([
    ['Button.stories.vue', true],
    ['Button.svue', true],
    ['Button.vue', false],
    ['Button.stories.ts', false],
    ['stories.vue', false],
  ])('%s -> %s', (file, expected) => {
    expect(STORY_FILE_PATTERN.test(file)).toBe(expected)
  })
})

describe('configResolved', () => {
  it('adds the story pattern to plugin-vue exclude', () => {
    const vue = fakeVuePlugin()
    configResolved(vueStoriesPlugin(), [vue])

    expect(vue.api.exclude).toEqual([STORY_FILE_PATTERN])
  })

  it('keeps an existing plugin-vue exclude', () => {
    const vue = fakeVuePlugin(/\.legacy\.vue$/)
    configResolved(vueStoriesPlugin(), [vue])

    expect(vue.api.exclude).toEqual([/\.legacy\.vue$/, STORY_FILE_PATTERN])

    const vue2 = fakeVuePlugin(['a.vue', /b/])
    configResolved(vueStoriesPlugin(), [vue2])

    expect(vue2.api.exclude).toEqual(['a.vue', /b/, STORY_FILE_PATTERN])
  })

  it('uses a custom include pattern for the exclude', () => {
    const vue = fakeVuePlugin()
    configResolved(vueStoriesPlugin({ include: /\.story\.vue$/ }), [vue])

    expect(vue.api.exclude).toEqual([/\.story\.vue$/])
  })

  it('falls back to guarding plugin-vue transform when exclude is locked', async () => {
    const vue = fakeVuePlugin(undefined, true)
    const original = vue.transform as ReturnType<typeof vi.fn>
    configResolved(vueStoriesPlugin(), [vue])

    expect(await transform(vue, 'csf', '/src/Button.stories.vue')).toBeNull()
    expect(await transform(vue, '<template/>', '/src/Button.vue')).toBe('vue output')
    expect(original).toHaveBeenCalledTimes(1)
  })

  it('guards Storybook docgen transforms (object hook with filter)', async () => {
    const handler = vi.fn(() => 'docgen output')
    const docgen: Plugin = {
      name: 'storybook:vue-docgen-plugin',
      transform: {
        order: 'post',
        filter: { id: /\.(vue)$/ },
        handler,
      },
    }
    configResolved(vueStoriesPlugin(), [docgen])

    const t = docgen.transform as any
    expect(t.order).toBe('post')
    expect(t.filter).toEqual({ id: /\.(vue)$/ })
    expect(await transform(docgen, 'csf', '/src/Button.stories.vue')).toBeNull()
    expect(await transform(docgen, '<template/>', '/src/Button.vue')).toBe('docgen output')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('leaves unrelated plugins alone', () => {
    const t = vi.fn()
    const other: Plugin = { name: 'some-plugin', transform: t }
    configResolved(vueStoriesPlugin(), [other])

    expect(other.transform).toBe(t)
  })
})

describe('stories component hooks', () => {
  const fixtures = fileURLToPath(new URL('./fixtures', import.meta.url))
  const storyFile = join(fixtures, 'Card.stories.vue')
  const storiesId = `${storyFile}${STORIES_SFC_SUFFIX}`

  function hook<T extends keyof Plugin>(plugin: Plugin, name: T): (...args: any[]) => any {
    const h = plugin[name] as any
    return typeof h === 'function'
      ? h
      : h.handler
  }

  function withRoot(root: string): Plugin {
    const plugin = vueStoriesPlugin();
    (plugin.configResolved as any)({ plugins: [], root })
    return plugin
  }

  it('resolves the stories component next to its story file', () => {
    const resolve = hook(withRoot(fixtures), 'resolveId')

    expect(resolve(`./Card.stories.vue${STORIES_SFC_SUFFIX}`, storyFile)).toBe(storiesId)
    expect(resolve(storiesId)).toBe(storiesId)
    // Root-relative URL from the browser
    expect(resolve(`/Card.stories.vue${STORIES_SFC_SUFFIX}`)).toBe(storiesId)
    expect(resolve('./Card.vue', storyFile)).toBeNull()
    expect(resolve(`./Card.vue${STORIES_SFC_SUFFIX}`, storyFile)).toBeNull()
  })

  it('loads the stories component and watches the story file', () => {
    const load = hook(vueStoriesPlugin(), 'load')
    const ctx = {
      addWatchFile: vi.fn(),
      error: vi.fn(),
    }

    const sfc = load.call(ctx, storiesId)
    expect(sfc).toContain('defineProps([\'args\', \'vueCsfStory\', \'vueCsfSlots\'])')
    expect(sfc).toContain('<template v-if="vueCsfStory === \'StaticSlots\'">')
    expect(ctx.addWatchFile).toHaveBeenCalledWith(storyFile)

    // plugin-vue serves its own sub-requests, and other ids are not ours
    expect(load.call(ctx, `${storiesId}?vue&type=style&index=0&lang.css`)).toBeNull()
    expect(load.call(ctx, storyFile)).toBeNull()
  })

  it('updates the stories component when its story file changes', () => {
    const update = hook(vueStoriesPlugin(), 'hotUpdate')
    const storiesModule = { id: storiesId }
    const storyModule = { id: storyFile }
    const moduleGraph = {
      getModuleById: vi.fn((id: string) => id === storiesId
        ? storiesModule
        : undefined),
      invalidateModule: vi.fn(),
    }
    const ctx = {
      environment: { moduleGraph },
    }

    expect(update.call(ctx, {
      file: storyFile,
      modules: [storyModule],
    })).toEqual([storyModule, storiesModule])
    expect(moduleGraph.invalidateModule).toHaveBeenCalledWith(storiesModule)

    // Other files, and story files without a loaded stories component
    expect(update.call(ctx, {
      file: join(fixtures, 'Card.vue'),
      modules: [],
    })).toBeUndefined()
    moduleGraph.getModuleById.mockReturnValue(undefined)
    expect(update.call(ctx, {
      file: storyFile,
      modules: [storyModule],
    })).toBeUndefined()
  })

  it('keeps Storybook docgen away from stories components too', async () => {
    const handler = vi.fn(() => 'docgen output')
    const docgen: Plugin = {
      name: 'storybook:vue-docgen-plugin',
      transform: { handler },
    }
    configResolved(vueStoriesPlugin(), [docgen])

    expect(await transform(docgen, 'sfc', storiesId)).toBeNull()
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not exclude stories components from plugin-vue', () => {
    const vue = fakeVuePlugin()
    configResolved(vueStoriesPlugin(), [vue])

    expect((vue.api.exclude as RegExp[]).some(re => re.test(storiesId))).toBe(false)
  })
})
