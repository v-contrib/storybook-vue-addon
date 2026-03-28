import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { vueStoriesPlugin } from '../vite-plugin'
import * as fs from 'node:fs'

// Mock the fs module
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}))

describe('vueStoriesPlugin', () => {
  const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a Vite plugin object', () => {
    const plugin = vueStoriesPlugin()

    expect(plugin.name).toBe('vite-plugin-vue-stories')
    expect(plugin.enforce).toBe('pre')
    expect(typeof plugin.load).toBe('function')
  })

  it('transforms .svue files', async () => {
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
    mockReadFileSync.mockReturnValue(code)

    const plugin = vueStoriesPlugin()
    const result = (plugin.load as Function).call({ error: vi.fn() }, 'Button.svue')

    expect(result).toBeDefined()
    expect(result.code).toContain('title: \'Test/Button\'')
    expect(result.code).toContain('export const Default')
    expect(result.code).toContain('export default')
  })

  it('ignores non-.svue files', async () => {
    const plugin = vueStoriesPlugin()

    const result = (plugin.load as Function).call({ error: vi.fn() }, 'Button.vue')

    expect(result).toBeNull()
    expect(mockReadFileSync).not.toHaveBeenCalled()
  })

  it('ignores regular .stories.ts files', async () => {
    const plugin = vueStoriesPlugin()

    const result = (plugin.load as Function).call({ error: vi.fn() }, 'Button.stories.ts')

    expect(result).toBeNull()
    expect(mockReadFileSync).not.toHaveBeenCalled()
  })

  it('uses custom include pattern', async () => {
    const code = `
<script setup lang="ts">
import Button from './Button.vue'
</script>
<template>
  <Meta title="Test" :component="Button" />
</template>
`
    mockReadFileSync.mockReturnValue(code)

    const plugin = vueStoriesPlugin({ include: /\.story\.vue$/ })

    const result1 = (plugin.load as Function).call({ error: vi.fn() }, 'Button.svue')
    const result2 = (plugin.load as Function).call({ error: vi.fn() }, 'Button.story.vue')

    expect(result1).toBeNull()
    expect(result2).toBeDefined()
  })

  it('includes h import from vue', async () => {
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
    mockReadFileSync.mockReturnValue(code)

    const plugin = vueStoriesPlugin()
    const result = (plugin.load as Function).call({ error: vi.fn() }, 'Button.svue')

    expect(result.code).toContain('import { h } from \'vue\'')
  })

  it('handles query strings in file paths', async () => {
    const code = `
<script setup lang="ts">
import Button from './Button.vue'
</script>
<template>
  <Meta title="Test" :component="Button" />
</template>
`
    mockReadFileSync.mockReturnValue(code)

    const plugin = vueStoriesPlugin()
    const result = (plugin.load as Function).call({ error: vi.fn() }, 'Button.svue?import')

    expect(result).toBeDefined()
    expect(mockReadFileSync).toHaveBeenCalledWith('Button.svue', 'utf-8')
  })
})
