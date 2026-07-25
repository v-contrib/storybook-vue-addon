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
    expect(result.stories[0].args).toEqual({ label: 'Hello' })
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
