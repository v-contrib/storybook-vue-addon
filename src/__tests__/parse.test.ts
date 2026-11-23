import { describe, expect, it } from 'vitest'
import { parseStoriesVue } from '../parse'

describe('parseStoriesVue', () => {
  it('parses Meta component props', () => {
    const code = `
<script setup lang="ts">
import Button from './Button.vue'
</script>

<template>
  <Meta title="Example/Button" :component="Button" />
</template>
`
    const result = parseStoriesVue(code)

    expect(result.meta.title).toBe('Example/Button')
    expect(result.meta.componentRef).toBe('Button')
  })

  it('parses Story components with static props', () => {
    const code = `
<script setup lang="ts">
import Button from './Button.vue'
</script>

<template>
  <Meta title="Example/Button" :component="Button" />
  <Story name="Primary">
    <Button label="Click me" primary />
  </Story>
</template>
`
    const result = parseStoriesVue(code)

    expect(result.stories).toHaveLength(1)
    expect(result.stories[0].name).toBe('Primary')
    expect(result.stories[0].staticProps).toEqual({
      label: 'Click me',
      primary: true,
    })
  })

  it('parses Story with scoped slot args', () => {
    const code = `
<script setup lang="ts">
import Button from './Button.vue'
</script>

<template>
  <Meta title="Example/Button" :component="Button" />
  <Story name="Playground" :args="{ label: 'Hello' }">
    <template #default="{ args }">
      <Button v-bind="args" />
    </template>
  </Story>
</template>
`
    const result = parseStoriesVue(code)

    expect(result.stories[0].hasArgsSlot).toBe(true)
    expect(result.stories[0].argsRef).toBe('{ label: \'Hello\' }')
  })

  it('extracts imports from script setup', () => {
    const code = `
<script setup lang="ts">
import Button from './Button.vue'
import { ref } from 'vue'
</script>

<template>
  <Meta title="Example/Button" :component="Button" />
</template>
`
    const result = parseStoriesVue(code)

    expect(result.imports).toHaveLength(2)
    expect(result.imports.some(i => i.includes('Button') && i.includes('./Button.vue'))).toBe(true)
    expect(result.imports.some(i => i.includes('ref') && i.includes('vue'))).toBe(true)
  })

  it('parses Meta with argTypes reference', () => {
    const code = `
<script setup lang="ts">
import Button from './Button.vue'

const argTypes = {
  label: { control: 'text' },
}
</script>

<template>
  <Meta title="Example/Button" :component="Button" :arg-types="argTypes" />
</template>
`
    const result = parseStoriesVue(code)

    expect(result.meta.argTypesRef).toBe('argTypes')
  })

  it('parses Meta with tags array', () => {
    const code = `
<script setup lang="ts">
import Button from './Button.vue'
</script>

<template>
  <Meta title="Example/Button" :component="Button" :tags="['autodocs']" />
</template>
`
    const result = parseStoriesVue(code)

    expect(result.meta.tags).toEqual(['autodocs'])
  })

  it('parses Story with extends prop', () => {
    const code = `
<script setup lang="ts">
import Button from './Button.vue'
</script>

<template>
  <Meta title="Example/Button" :component="Button" />
  <Story name="Primary" :args="{ primary: true }">
    <template #default="{ args }">
      <Button v-bind="args" />
    </template>
  </Story>
  <Story name="PrimaryDisabled" extends="Primary" :args="{ disabled: true }">
    <template #default="{ args }">
      <Button v-bind="args" />
    </template>
  </Story>
</template>
`
    const result = parseStoriesVue(code)

    expect(result.stories[1].extendsStory).toBe('Primary')
  })

  it('parses Story with play function reference', () => {
    const code = `
<script setup lang="ts">
import Button from './Button.vue'

async function clickButton({ canvas, userEvent }) {
  await userEvent.click(canvas.getByRole('button'))
}
</script>

<template>
  <Meta title="Example/Button" :component="Button" />
  <Story name="WithPlay" :play="clickButton">
    <Button label="Click me" />
  </Story>
</template>
`
    const result = parseStoriesVue(code)

    expect(result.stories[0].playRef).toBe('clickButton')
  })

  it('keeps bound prop expressions as written, also with identifiers', () => {
    const result = parseStoriesVue(`<script setup>
import Button from './Button.vue'
const label = 'Hi'
const routes = []
</script>
<template>
  <Meta title="T" :component="Button" :args="{ label }" :router="{ routes, initialRoute: '/' }" />
  <Story name="A" :args="{ label, size: 'small' }" :router="{ initialRoute: (args) => \`/\${args.page}\` }"><Button /></Story>
  <Story name="B" router><Button /></Story>
</template>`)

    expect(result.meta.argsRef).toBe('{ label }')
    expect(result.meta.routerRef).toBe('{ routes, initialRoute: \'/\' }')
    expect(result.stories[0].argsRef).toBe('{ label, size: \'small\' }')
    // eslint-disable-next-line no-template-curly-in-string
    expect(result.stories[0].routerRef).toBe('{ initialRoute: (args) => `/${args.page}` }')
    expect(result.stories[1].routerRef).toBe('true')
  })
})

describe('parseStoriesVue slot forms', () => {
  const file = (story: string): string => `<script setup>
import Button from './Button.vue'
</script>
<template>
  <Meta title="T" :component="Button" />
  ${story}
</template>`

  it.each([
    ['#default="{ args }"', '<template #default="{ args }"><Button v-bind="args" /></template>'],
    ['v-slot:default="{ args }"', '<template v-slot:default="{ args }"><Button v-bind="args" /></template>'],
    ['v-slot="{ args }"', '<template v-slot="{ args }"><Button v-bind="args" /></template>'],
    ['#default without slot props', '<template #default><Button label="x" /></template>'],
  ])('accepts %s', (_form, content) => {
    const [story] = parseStoriesVue(file(`<Story name="A">${content}</Story>`)).stories

    expect(story.hasArgsSlot).toBe(true)
    expect(story.content?.simple).toBe(true)
  })

  it.each([
    ['v-slot on <Story> itself', '<Story name="A" v-slot="{ args }"><Button v-bind="args" /></Story>', /<template #default="\{ args \}">/],
    ['#default on <Story> itself', '<Story name="A" #default="{ args }"><Button v-bind="args" /></Story>', /<template #default="\{ args \}">/],
    ['slot props other than { args }', '<Story name="A"><template #default="props"><Button v-bind="props.args" /></template></Story>', /\{ args \}/],
    ['a named slot', '<Story name="A"><template #header>Hi</template></Story>', /#header/],
  ])('reports %s', (_form, story, message) => {
    expect(() => parseStoriesVue(file(story))).toThrow(message)
  })

  describe('unknown props', () => {
    const parse = (meta: string, story = ''): unknown => parseStoriesVue(`<template>
  <Meta ${meta} />
  <Story name="A"${story}><div /></Story>
</template>`)

    it('accepts every documented prop', () => {
      expect(() => parse(
        'title="T" router :component="C" :args="{}" :arg-types="{}" :argTypes="{}" :decorators="[]" :parameters="{}" :tags="[]"',
        ' :args="{}" :arg-types="{}" :decorators="[]" :parameters="{}" :play="p" :tests="t" :router="{}" :tags="[]"',
      )).not.toThrow()
      expect(() => parse('title="T"', ' router')).not.toThrow()
    })

    it('reports unknown props on <Meta> and <Story>', () => {
      expect(() => parse('title="T" :parameter="{}"')).toThrow('<Meta>: unknown prop :parameter. Known: title, router, :component')
      expect(() => parse('title="T"', ' foo="1"')).toThrow('<Story name="A">: unknown prop foo.')
      expect(() => parse('title="T"', ' v-if="ok"')).toThrow('<Story name="A">: unknown prop v-if.')
      expect(() => parse('title="T"', ' v-bind="all"')).toThrow('<Story name="A">: unknown prop v-bind.')
    })

    it('hints at the fix for props from other formats and static/bound mix-ups', () => {
      expect(() => parseStoriesVue('<template><Meta title="T" /><Story title="A"><div /></Story></template>'))
        .toThrow('<Story>: unknown prop title (use name="…" for the story name)')
      expect(() => parse('name="T"')).toThrow('unknown prop name (use title="…" for the title)')
      expect(() => parse(':title="t"')).toThrow('unknown prop :title (title is a static attribute: title="…")')
      expect(() => parse('title="T"', ' tags="wip"')).toThrow('unknown prop tags (tags take an array: :tags="[\'…\']")')
    })
  })

  it('points storybook-vue-addon files at the new syntax', () => {
    expect(() => parseStoriesVue('<template><Stories title="T"><Story title="A"><div /></Story></Stories></template>'))
      .toThrow('<Stories> is storybook-vue-addon syntax: use a self-closing <Meta title="…" :component="…" /> followed by the <Story> elements')
    expect(() => parseStoriesVue('<template><Meta title="T" /></template>\n<docs>\n# Docs\n</docs>'))
      .toThrow('<docs> blocks are not supported')
  })
})
