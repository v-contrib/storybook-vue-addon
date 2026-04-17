import type { Plugin } from 'vite'
import { describe, expect, it, vi } from 'vitest'
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

function transform(plugin: Plugin, code: string, id: string) {
  return transformHandler(plugin).call({
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
  it('returns a Vite plugin object with a transform hook', () => {
    const plugin = vueStoriesPlugin()

    expect(plugin.name).toBe('vite-plugin-vue-stories')
    expect(plugin.enforce).toBe('pre')
    expect(typeof plugin.transform).toBe('function')
    expect(plugin.load).toBeUndefined()
  })

  it.each(['Button.svue', 'Button.stories.vue', '/abs/src/Button.stories.vue'])('transforms %s to CSF', (id) => {
    const result = transform(vueStoriesPlugin(), STORY, id)

    expect(result.code).toContain('title: \'Test/Button\'')
    expect(result.code).toContain('export const Default')
    expect(result.code).toContain('export default')
    expect(result.code).toContain('import { h } from \'vue\'')
  })

  it.each(['Button.vue', 'Button.stories.ts', 'Button.story.vue'])('ignores %s', (id) => {
    expect(transform(vueStoriesPlugin(), STORY, id)).toBeNull()
  })

  it('handles query strings in file paths', () => {
    const plugin = vueStoriesPlugin()

    expect(transform(plugin, STORY, 'Button.svue?import').code).toContain('export const Default')
    expect(transform(plugin, STORY, 'Button.stories.vue?t=123').code).toContain('export const Default')
  })

  it('ignores plugin-vue sub-requests', () => {
    expect(transform(vueStoriesPlugin(), STORY, 'Button.stories.vue?vue&type=style&index=0&lang.css')).toBeNull()
  })

  it('uses custom include pattern', () => {
    const plugin = vueStoriesPlugin({ include: /\.story\.vue$/ })

    expect(transform(plugin, STORY, 'Button.svue')).toBeNull()
    expect(transform(plugin, STORY, 'Button.story.vue').code).toContain('export const Default')
  })

  it('reports parse errors through this.error', () => {
    const error = vi.fn()
    transformHandler(vueStoriesPlugin()).call({ error }, '<template><Story', 'Broken.stories.vue')

    expect(error).toHaveBeenCalledWith(expect.stringContaining('Failed to transform Broken.stories.vue'))
  })
})

describe('sTORY_FILE_PATTERN', () => {
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

  it('falls back to guarding plugin-vue transform when exclude is locked', () => {
    const vue = fakeVuePlugin(undefined, true)
    const original = vue.transform as ReturnType<typeof vi.fn>
    configResolved(vueStoriesPlugin(), [vue])

    expect(transform(vue, 'csf', '/src/Button.stories.vue')).toBeNull()
    expect(transform(vue, '<template/>', '/src/Button.vue')).toBe('vue output')
    expect(original).toHaveBeenCalledTimes(1)
  })

  it('guards Storybook docgen transforms (object hook with filter)', () => {
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
    expect(transform(docgen, 'csf', '/src/Button.stories.vue')).toBeNull()
    expect(transform(docgen, '<template/>', '/src/Button.vue')).toBe('docgen output')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('leaves unrelated plugins alone', () => {
    const t = vi.fn()
    const other: Plugin = { name: 'some-plugin', transform: t }
    configResolved(vueStoriesPlugin(), [other])

    expect(other.transform).toBe(t)
  })
})
