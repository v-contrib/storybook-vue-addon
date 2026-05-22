import type { ParsedResult } from '../parse'
import { describe, expect, it } from 'vitest'
import { effect, h, reactive } from 'vue'
import { generateCSF } from '../codegen'
import { parseStoriesVue } from '../parse'

/**
 * Evaluate generated CSF (no imports) and return its exports.
 * `scope` provides identifiers the code references, e.g. the component.
 */
function evaluateCSF(code: string, scope: Record<string, unknown>): Record<string, any> {
  const body = code
    .replace(/^import \{ h \} from 'vue'$/m, '')
    .replace('if (import.meta.hot) {\n  import.meta.hot.accept()\n}', '')
    .replace(/^export default /m, 'exports.default = ')
    .replace(/^export const (\w+) = /gm, 'exports.$1 = ')
  const exports: Record<string, any> = {}
  // eslint-disable-next-line no-new-func
  new Function('exports', 'h', ...Object.keys(scope), body)(exports, h, ...Object.values(scope))
  return exports
}

const Button = {
  name: 'Button',
  props: ['label', 'primary', 'size'],
}

function parsedWith(story: ParsedResult['stories'][number]): ParsedResult {
  return {
    meta: { title: 'Example/Button', componentRef: 'Button' },
    stories: [story],
    scriptSetup: '',
    imports: [],
  }
}

const staticStory = {
  name: 'Primary',
  staticProps: { label: 'Click me', primary: true },
  hasArgsSlot: false,
  slotContent: '<Button label="Click me" primary />',
}

const argsStory = {
  name: 'Playground',
  args: { label: 'Hello' },
  hasArgsSlot: true,
  staticProps: {},
  slotContent: '<Button v-bind="args" />',
}

describe('generateCSF stories work with Storybook controls', () => {
  it.each([
    ['static', staticStory],
    ['args slot', argsStory],
  ])('%s story renders from args', (_kind, story) => {
    const { Primary, Playground } = evaluateCSF(generateCSF(parsedWith(story)), { Button })
    const exported = Primary ?? Playground

    // Storybook marks a story as an args story when render takes args
    expect(exported.render.length).toBeGreaterThan(0)

    // Like Storybook's default render: return a render function, not a VNode,
    // so the mounted story re-renders when the Controls panel updates args
    const args = reactive({ ...exported.args })
    const renderFn = exported.render(args)
    expect(typeof renderFn).toBe('function')

    let label: unknown
    effect(() => {
      label = renderFn().props.label
    })
    expect(label).toBe(exported.args.label)

    args.label = 'Changed by control'
    expect(label).toBe('Changed by control')
  })

  it.each([
    ['static', staticStory],
    ['args slot', argsStory],
  ])('%s story leaves docs source to Storybook', (_kind, story) => {
    const { Primary, Playground } = evaluateCSF(generateCSF(parsedWith(story)), { Button })
    const exported = Primary ?? Playground

    // A static source.code makes Storybook skip generating the snippet from args
    expect(exported.parameters?.docs?.source?.code).toBeUndefined()
  })

  it('keeps user parameters', () => {
    const code = generateCSF(parsedWith({ ...staticStory, parametersRef: 'storyParams' }))
    const { Primary } = evaluateCSF(code, {
      Button,
      storyParams: { layout: 'centered' },
    })

    expect(Primary.parameters).toEqual({ layout: 'centered' })
  })
})

describe('generateCSF', () => {
  it('generates default export with meta', () => {
    const parsed: ParsedResult = {
      meta: {
        title: 'Example/Button',
        componentRef: 'Button',
      },
      stories: [],
      scriptSetup: '',
      imports: ['import Button from \'./Button.vue\''],
    }

    const result = generateCSF(parsed)

    expect(result).toContain('import Button from \'./Button.vue\'')
    expect(result).toContain('title: \'Example/Button\'')
    expect(result).toContain('component: Button')
    expect(result).toContain('export default')
  })

  it('generates story with static args', () => {
    const parsed: ParsedResult = {
      meta: {
        title: 'Example/Button',
        componentRef: 'Button',
      },
      stories: [
        {
          name: 'Primary',
          staticProps: { label: 'Click me', primary: true },
          hasArgsSlot: false,
          slotContent: '<Button label="Click me" primary />',
        },
      ],
      scriptSetup: '',
      imports: ['import Button from \'./Button.vue\''],
    }

    const result = generateCSF(parsed)

    expect(result).toContain('export const Primary')
    expect(result).toContain('label: \'Click me\'')
    expect(result).toContain('primary: true')
    expect(result).toContain('render:')
  })

  it('generates story with args slot', () => {
    const parsed: ParsedResult = {
      meta: {
        title: 'Example/Button',
        componentRef: 'Button',
      },
      stories: [
        {
          name: 'Playground',
          args: { label: 'Hello' },
          hasArgsSlot: true,
          staticProps: {},
          slotContent: '<Button v-bind="args" />',
        },
      ],
      scriptSetup: '',
      imports: ['import Button from \'./Button.vue\''],
    }

    const result = generateCSF(parsed)

    expect(result).toContain('export const Playground')
    expect(result).toContain('render: (args, context)')
    expect(result).toContain('label: \'Hello\'')
  })

  it('converts story names to valid identifiers', () => {
    const parsed: ParsedResult = {
      meta: { title: 'Test' },
      stories: [
        {
          name: 'With Icon',
          staticProps: {},
          hasArgsSlot: false,
          slotContent: '',
        },
      ],
      scriptSetup: '',
      imports: [],
    }

    const result = generateCSF(parsed)

    expect(result).toContain('export const WithIcon')
  })

  it('includes script setup code in output', () => {
    const parsed: ParsedResult = {
      meta: { title: 'Test' },
      stories: [],
      scriptSetup: 'const argTypes = { label: { control: \'text\' } }',
      imports: [],
    }

    const result = generateCSF(parsed)

    expect(result).toContain('const argTypes = { label: { control: \'text\' } }')
  })

  it('generates meta with argTypes reference', () => {
    const parsed: ParsedResult = {
      meta: {
        title: 'Test',
        argTypesRef: 'argTypes',
      },
      stories: [],
      scriptSetup: '',
      imports: [],
    }

    const result = generateCSF(parsed)

    expect(result).toContain('argTypes: argTypes')
  })

  it('generates story with extends', () => {
    const parsed: ParsedResult = {
      meta: {
        title: 'Test',
        componentRef: 'Button',
      },
      stories: [
        {
          name: 'Primary',
          args: { primary: true },
          hasArgsSlot: true,
          staticProps: {},
          slotContent: '<Button v-bind="args" />',
        },
        {
          name: 'PrimaryDisabled',
          args: { disabled: true },
          extendsStory: 'Primary',
          hasArgsSlot: true,
          staticProps: {},
          slotContent: '<Button v-bind="args" />',
        },
      ],
      scriptSetup: '',
      imports: [],
    }

    const result = generateCSF(parsed)

    expect(result).toContain('export const PrimaryDisabled')
    expect(result).toContain('...Primary')
  })

  it('adds HMR support', () => {
    const parsed: ParsedResult = {
      meta: { title: 'Test' },
      stories: [],
      scriptSetup: '',
      imports: [],
    }

    const result = generateCSF(parsed)

    expect(result).toContain('import.meta.hot')
    expect(result).toContain('accept()')
  })

  it('generates story with play function reference', () => {
    const parsed: ParsedResult = {
      meta: {
        title: 'Test',
        componentRef: 'Button',
      },
      stories: [
        {
          name: 'WithPlay',
          playRef: 'clickButton',
          staticProps: { label: 'Click' },
          hasArgsSlot: false,
          slotContent: '<Button label="Click" />',
        },
      ],
      scriptSetup: '',
      imports: [],
    }

    const result = generateCSF(parsed)

    expect(result).toContain('play: clickButton')
  })
})

describe('generateCSF stories with content', () => {
  const source = `<script setup>
import Card from './Card.vue'
const storyParams = { layout: 'centered', docs: { description: { story: 'Hi' } } }
</script>
<template>
  <Meta title="Test/Card" :component="Card" />
  <Story name="Slots" :parameters="storyParams"><Card title="Hi">Body</Card></Story>
  <Story name="Plain"><Card title="Hi" /></Story>
</template>
`

  it('renders through the stories component and keeps simple stories as they were', () => {
    const code = generateCSF(parseStoriesVue(source), { storiesImport: './Card.stories.vue.__stories__.vue' })

    expect(code).toContain('import __VueCsfStories from \'./Card.stories.vue.__stories__.vue\'')
    expect(code).toContain('return h(__VueCsfStories, { args: props, vueCsfSlots: slots, vueCsfStory: \'Slots\' })')
    expect(code).toContain('return h(Card, props, slots)')
  })

  it('merges the docs transform into user parameters', () => {
    const code = generateCSF(parseStoriesVue(source))
      .replace(/^import .*$/gm, '')
    const { Slots, Plain } = evaluateCSF(code, { Card: Button, __VueCsfStories: {} })

    expect(Slots.parameters.layout).toBe('centered')
    expect(Slots.parameters.docs.description).toEqual({ story: 'Hi' })
    expect(Slots.parameters.docs.source.transform('', {
      args: { title: 'Bye' },
    })).toBe('<Card title="Bye">Body</Card>')
    expect(Plain.parameters).toBeUndefined()
  })

  it('sets meta parameters for .stories.vue, keeping user meta parameters', () => {
    const code = generateCSF(parseStoriesVue(source)).replace(/^import .*$/gm, '')
    const withMeta = generateCSF(parseStoriesVue(source.replace(':component="Card"', ':component="Card" :parameters="metaParams"')))
      .replace(/^import .*$/gm, '')

    // Snippets are Vue templates (html highlighting); Storybook's "save story"
    // rewrites CSF JavaScript and can't write a .stories.vue file
    expect(evaluateCSF(code, { Card: Button, __VueCsfStories: {} }).default.parameters).toEqual({
      docs: {
        source: { language: 'html' },
      },
      controls: { disableSaveFromUI: true },
    })
    expect(evaluateCSF(withMeta, {
      Card: Button,
      __VueCsfStories: {},
      metaParams: {
        layout: 'centered',
        docs: {
          source: { language: 'tsx' },
        },
        controls: { expanded: true },
      },
    }).default.parameters).toEqual({
      layout: 'centered',
      docs: {
        source: { language: 'tsx' },
      },
      controls: { disableSaveFromUI: true, expanded: true },
    })
  })

  it('does not emit the stories import when no story needs it', () => {
    const code = generateCSF(parseStoriesVue(source.replace(/<Story name="Slots".*<\/Story>\n/, '')))

    expect(code).not.toContain('__VueCsfStories')
    expect(code).not.toContain('__vueCsfAttrs')
  })
})
