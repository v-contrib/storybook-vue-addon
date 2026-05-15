import { describe, expect, it } from 'vitest'
import { parseStoriesVue } from '../parse'
import { buildStoriesSfc } from '../stories-sfc'

function storiesFile(stories: string, script = 'import Card from \'./Card.vue\'', lang = ''): string {
  return `<script setup${lang
    ? ` lang="${lang}"`
    : ''}>
${script}
</script>

<template>
  <Meta title="Test/Card" :component="Card" />
${stories}
</template>
`
}

function storyOf(stories: string) {
  return parseStoriesVue(storiesFile(stories)).stories[0]
}

describe('story content analysis', () => {
  it.each([
    ['static attributes', '<Story name="S"><Card title="Hi" elevated /></Story>'],
    ['v-bind="args"', '<Story name="S" :args="{ title: \'Hi\' }"><template #default="{ args }"><Card v-bind="args" /></template></Story>'],
    ['kebab-case tag', '<Story name="S"><card title="Hi" /></Story>'],
  ])('treats the meta component with %s as simple', (_name, story) => {
    expect(storyOf(story).content?.simple).toBe(true)
  })

  it.each([
    ['slot content', '<Story name="S"><Card title="Hi">Body</Card></Story>'],
    ['a named slot', '<Story name="S"><Card><template #header>H</template></Card></Story>'],
    ['another bound prop', '<Story name="S"><Card :title="label" /></Story>'],
    ['two roots', '<Story name="S"><Card /><Card /></Story>'],
    ['another element', '<Story name="S"><div><Card /></div></Story>'],
  ])('compiles a story with %s', (_name, story) => {
    expect(storyOf(story).content?.simple).toBe(false)
  })

  it('has no content for an empty story', () => {
    expect(storyOf('<Story name="S" :args="{ title: \'Hi\' }" />').content).toBeUndefined()
  })

  it('moves root attributes of a static story into args and binds them', () => {
    const story = storyOf('<Story name="S"><Card title="Hi" aria-label="Card" elevated>Body</Card></Story>')

    expect(story.staticProps).toEqual({ 'title': 'Hi', 'aria-label': 'Card', 'elevated': true })
    expect(story.content?.template).toBe('<VueCsfRoot v-bind="args">Body</VueCsfRoot>')
  })

  it('leaves non-component roots and bound attributes alone', () => {
    const story = storyOf('<Story name="S"><div class="wrap"><Card :title="label" /></div></Story>')

    expect(story.staticProps).toEqual({})
    expect(story.content?.template).toBe('<div class="wrap"><Card :title="label" /></div>')
  })

  it('uses the args slot content for args stories', () => {
    const story = storyOf(`<Story name="S" :args="{ title: 'Hi' }">
    <template #default="{ args }">
      <Card v-bind="args">{{ args.title }}</Card>
    </template>
  </Story>`)

    // The meta component renders through the root wrapper; the snippet keeps the tag
    expect(story.content?.template).toBe('<VueCsfRoot v-bind="args">{{ args.title }}</VueCsfRoot>')
    expect(story.content?.sourceParts).toEqual([
      { kind: 'text', text: '      <Card' },
      { kind: 'attrs' },
      { kind: 'text', text: '>' },
      { kind: 'interp', path: 'args.title' },
      { kind: 'text', text: '</Card>' },
    ])
  })

  it('marks single bound args in the docs snippet', () => {
    const story = storyOf(`<Story name="S"><template #default="{ args }"><Card :title="args.title" :count="other">x</Card></template></Story>`)

    expect(story.content?.sourceParts).toContainEqual({ kind: 'attr', name: 'title', path: 'args.title' })
    // Only args paths become placeholders
    expect(story.content?.sourceParts.filter(p => p.kind !== 'text')).toHaveLength(1)
  })
})

describe('buildStoriesSfc', () => {
  it('is null when every story is simple', () => {
    expect(buildStoriesSfc(parseStoriesVue(storiesFile('<Story name="A"><Card title="Hi" /></Story>')))).toBeNull()
  })

  it('combines the script setup, one branch per compiled story and the styles', () => {
    const source = `${storiesFile(`  <Story name="With Slot"><Card>Body</Card></Story>
  <Story name="Simple"><Card title="Hi" /></Story>
  <Story name="Two"><Card /><Card /></Story>`, 'import Card from \'./Card.vue\'\nconst note: string = \'x\'', 'ts')}
<style scoped>
.card { color: red; }
</style>
`
    expect(buildStoriesSfc(parseStoriesVue(source))).toBe(`<script setup lang="ts">
import Card from './Card.vue'
const note: string = 'x'

const __vueCsfProps = defineProps(['args', 'vueCsfStory', 'vueCsfSlots'])
import { h as __vueCsfH } from 'vue'
const VueCsfRoot = Object.assign(
  (_props, { attrs, slots }) => __vueCsfH(Card, attrs, {
    ...Object.fromEntries(Object.entries(slots).filter(([name]) => name !== '_')),
    ...__vueCsfProps.vueCsfSlots,
  }),
  { inheritAttrs: false },
)
</script>

<template>
<template v-if="vueCsfStory === 'WithSlot'">
<VueCsfRoot v-bind="args">Body</VueCsfRoot>
</template>
<template v-else-if="vueCsfStory === 'Two'">
<VueCsfRoot /><VueCsfRoot />
</template>
</template>

<style scoped>
.card { color: red; }
</style>
`)
  })
})
