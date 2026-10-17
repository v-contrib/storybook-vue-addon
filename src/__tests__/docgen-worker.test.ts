import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { buildDocgenShim, componentImportSource, createDocgenProvider } from '../docgen-worker'
import { parseStoriesVue } from '../parse'
import { experimental_docgenProvider, experimental_indexers } from '../preset'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const cardStoriesPath = join(fixtures, 'Card.stories.vue')
const cardStories = readFileSync(cardStoriesPath, 'utf-8')

function stories(script: string): string {
  return `<script setup>\n${script}\n</script>\n<template>\n  <Meta title="T" :component="Card" />\n  <Story name="A"><Card /></Story>\n</template>\n`
}

describe('componentImportSource', () => {
  it.each([
    ['import Card from \'./Card.vue\'', './Card.vue'],
    ['import { Card } from \'@/components\'', '@/components'],
    ['import { Thing as Card, Other } from "./lib"', './lib'],
    ['import Other, { Card } from \'./both\'', './both'],
  ])('finds the meta component in %s', (script, expected) => {
    expect(componentImportSource(parseStoriesVue(stories(`import Badge from './Badge.vue'\n${script}`)))).toBe(expected)
  })

  it('is undefined when the component is not imported', () => {
    expect(componentImportSource(parseStoriesVue(stories('const Card = {}')))).toBeUndefined()
  })
})

describe('buildDocgenShim', () => {
  it('is CSF with the story file imports (relative to the shim) and the meta component', () => {
    expect(buildDocgenShim(cardStories, cardStoriesPath, join(fixtures, 'cache', 'docgen'))).toBe([
      'import Badge from \'../../Badge.vue\'',
      'import Card from \'../../Card.vue\'',
      '',
      'export default { title: "Fixtures/Card", component: Card }',
      '',
    ].join('\n'))
  })

  it('leaves out a missing title', () => {
    const source = '<script setup>\nimport Card from \'./Card.vue\'\n</script>\n<template>\n  <Meta :component="Card" />\n</template>\n'
    expect(buildDocgenShim(source, '/project/A.stories.vue', '/project/cache')).toContain('export default { component: Card }')
  })

  it('keeps bare and aliased imports', () => {
    const shim = buildDocgenShim(stories('import { Card } from \'@/components\''), '/project/src/A.stories.vue', '/project/cache')
    expect(shim).toContain('import { Card } from \'@/components\'')
  })

  it('is undefined without a meta component', () => {
    const source = '<template>\n  <Meta title="T" />\n  <Story name="A"><p /></Story>\n</template>\n'
    expect(buildDocgenShim(source, '/project/A.stories.vue', '/project/cache')).toBeUndefined()
  })
})

describe('createDocgenProvider (Storybook 11 docgen worker)', () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'vue-csf-docgen-'))
  afterAll(() => rmSync(cacheDir, { recursive: true, force: true }))
  const provider = createDocgenProvider({ cwd: fixtures, cacheDir })

  it('passes other story files on unchanged', async () => {
    const next = vi.fn(async () => ({ id: 'x' }))
    const input = {
      entry: { id: 'x--a', type: 'story', importPath: './Button.stories.ts' },
    }

    expect(await provider(next)(input)).toEqual({ id: 'x' })
    expect(next).toHaveBeenCalledWith(input)
  })

  it.each([
    [
      'story',
      { id: 'fixtures-card--a', type: 'story', importPath: './Card.stories.vue' },
    ],
    [
      'docs',
      {
        id: 'fixtures-card--docs',
        type: 'docs',
        storiesImports: ['./Card.stories.vue'],
      },
    ],
  ])('hands a %s entry of a .stories.vue file on with a CSF shim as story file', async (_kind, entry) => {
    const next = vi.fn(async ({ entry }: any) => ({ id: 'fixtures-card', path: entry.importPath ?? entry.storiesImports[0] }))
    const payload = await provider(next)({ entry })

    const passed = next.mock.calls[0][0].entry
    const shimPath = passed.importPath ?? passed.storiesImports[0]
    expect(passed.id).toBe(entry.id)
    // @storybook/vue3 only reads files that look like CSF story files
    expect(shimPath).toMatch(/\/Card-[0-9a-f]{8}\.stories\.js$/)
    expect(readFileSync(resolve(fixtures, shimPath), 'utf-8')).toContain('component: Card')
    // The payload points back at the real story file
    expect(payload).toEqual({ id: 'fixtures-card', path: './Card.stories.vue' })
  })

  it('falls back to the next provider when the file cannot be used', async () => {
    const next = vi.fn(async () => undefined)
    const input = {
      entry: { id: 'missing--a', type: 'story', importPath: './Missing.stories.vue' },
    }

    expect(await provider(next)(input)).toBeUndefined()
    expect(next).toHaveBeenCalledWith(input)
  })
})

describe('preset (Storybook 11)', () => {
  it('registers the docgen worker after the existing providers', async () => {
    const vue = { moduleSpecifier: '/vue/docgen-worker.js' }
    const providers = await experimental_docgenProvider([vue])

    expect(providers[0]).toBe(vue)
    expect(providers[1].moduleSpecifier).toMatch(/docgen-worker\.js$/)
  })

  it('indexes stories with the meta component as rawComponentPath', async () => {
    const [indexer] = await experimental_indexers([])
    const entries = await indexer.createIndex(cardStoriesPath, {})

    expect(entries.every((entry: any) => entry.rawComponentPath === './Card.vue')).toBe(true)
  })
})
