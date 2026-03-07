import { describe, expect, it } from 'vitest'
import { vueStoriesPlugin } from '../vite-plugin'

describe('vueStoriesPlugin', () => {
  it('returns a Vite plugin object', () => {
    const plugin = vueStoriesPlugin()

    expect(plugin.name).toBe('vite-plugin-vue-stories')
    expect(typeof plugin.transform).toBe('function')
  })

  it('transforms .stories.vue files', async () => {
    const plugin = vueStoriesPlugin()
    const code = `
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

    const result = await (plugin.transform as Function).call({}, code, 'Button.stories.vue')

    expect(result).toBeDefined()
    expect(result.code).toContain('title: \'Test/Button\'')
    expect(result.code).toContain('export const Default')
    expect(result.code).toContain('export default')
  })

  it('ignores non-.stories.vue files', async () => {
    const plugin = vueStoriesPlugin()

    const result = await (plugin.transform as Function).call({}, '', 'Button.vue')

    expect(result).toBeUndefined()
  })

  it('ignores regular .stories.ts files', async () => {
    const plugin = vueStoriesPlugin()

    const result = await (plugin.transform as Function).call({}, '', 'Button.stories.ts')

    expect(result).toBeUndefined()
  })

  it('uses custom include pattern', async () => {
    const plugin = vueStoriesPlugin({ include: /\.story\.vue$/ })

    const result1 = await (plugin.transform as Function).call({}, '', 'Button.stories.vue')
    const result2 = await (plugin.transform as Function).call({}, `
<script setup lang="ts">
import Button from './Button.vue'
</script>
<template>
  <Meta title="Test" :component="Button" />
</template>
`, 'Button.story.vue')

    expect(result1).toBeUndefined()
    expect(result2).toBeDefined()
  })

  it('includes h import from vue', async () => {
    const plugin = vueStoriesPlugin()
    const code = `
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

    const result = await (plugin.transform as Function).call({}, code, 'Button.stories.vue')

    expect(result.code).toContain('import { h } from \'vue\'')
  })
})
