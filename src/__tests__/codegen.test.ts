import type { ParsedResult } from '../parse'
import { transformWithOxc } from 'vite'
import { describe, expect, it } from 'vitest'
import { effect, h, reactive } from 'vue'
import { generateCSF } from '../codegen'
import { componentImportSource } from '../docgen-worker'
import { parseStoriesVue } from '../parse'

/**
 * Evaluate generated CSF (no imports) and return its exports.
 * `scope` provides identifiers the code references, e.g. the component.
 */
function evaluateCSF(code: string, scope: Record<string, unknown>): Record<string, any> {
  const body = code
    .replace(/^import \{ h as __vueCsfH \} from 'vue'$/m, '')
    .replace(/^export default /m, 'exports.default = ')
    .replace(/^export const (\w+) = /gm, 'const $1 = exports.$1 = ')
    .replace(/^export \{ (.*) \}$/m, (_, list: string) =>
      `Object.assign(exports, { ${list.replace(/(\w+) as (\w+)/g, '$2: $1')} })`)
  const exports: Record<string, any> = {}
  // eslint-disable-next-line no-new-func
  new Function('exports', '__vueCsfH', ...Object.keys(scope), body)(exports, h, ...Object.values(scope))
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
  argsRef: '{ label: \'Hello\' }',
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

    expect(Primary.parameters.layout).toBe('centered')
    expect(Primary.parameters.docs.source.originalSource).toBe('<Button />')
  })

  it.each([
    ['Storybook 11', 'docgenServer'],
    ['Storybook 10.6 with experimentalDocgenServer', 'experimentalDocgenServer'],
  ])('on %s (server-side docgen) treats args that are not props as slots', (_version, flag) => {
    const { Primary } = evaluateCSF(generateCSF(parsedWith(staticStory)), { Button })
    const args = {
      'label': 'Hi',
      'header': 'Header',
      'onClick': () => {},
      'background-color': 'red',
    }
    const render = (): any => Primary.render(args, { argTypes: {}, component: Button })()

    // Storybook 10: docgen argTypes mark slots; without them everything is a prop
    expect(Object.keys(render().props)).toEqual([
      'label',
      'header',
      'onClick',
      'background-color',
    ])

    const features = (globalThis as any).FEATURES
    ;(globalThis as any).FEATURES = { [flag]: true }
    try {
      const vnode = render()
      // Like Storybook 11's own Vue render: declared props and on* listeners stay props
      expect(Object.keys(vnode.props)).toEqual(['label', 'onClick'])
      // (Vue adds _ctx to normalized slots)
      expect(Object.keys(vnode.children).filter(key => key !== '_ctx')).toEqual(['header', 'background-color'])
    }
    finally {
      (globalThis as any).FEATURES = features
    }
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
    expect(result).toContain('title: "Example/Button"')
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

    expect(result).toContain('__vueCsfStory_Primary as Primary')
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
          argsRef: '{ label: \'Hello\' }',
          hasArgsSlot: true,
          staticProps: {},
          slotContent: '<Button v-bind="args" />',
        },
      ],
      scriptSetup: '',
      imports: ['import Button from \'./Button.vue\''],
    }

    const result = generateCSF(parsed)

    expect(result).toContain('__vueCsfStory_Playground as Playground')
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

    expect(result).toContain('__vueCsfStory_WithIcon as WithIcon')
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
          argsRef: '{ primary: true }',
          hasArgsSlot: true,
          staticProps: {},
          slotContent: '<Button v-bind="args" />',
        },
        {
          name: 'PrimaryDisabled',
          argsRef: '{ disabled: true }',
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

    expect(result).toContain('__vueCsfStory_PrimaryDisabled as PrimaryDisabled')
    expect(result).toContain('...__vueCsfStory_Primary,')
  })

  it('leaves HMR to Storybook (no self-accepting module, also for .svue)', () => {
    const parsed: ParsedResult = {
      meta: { title: 'Test' },
      stories: [],
      scriptSetup: '',
      imports: [],
    }

    expect(generateCSF(parsed)).not.toContain('import.meta.hot')
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
    expect(code).toContain('return __vueCsfH(__VueCsfStories, { args: props, vueCsfSlots: slots, vueCsfStory: \'Slots\' })')
    expect(code).toContain('return __vueCsfH(Card, props, slots)')
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
    expect(Slots.parameters.docs.source.originalSource).toBe('<Card title="Hi">Body</Card>')

    // Storybook 11 (server-side docgen): the beforeEach context that emits the
    // Code panel snippet throws on argTypes
    const beforeEachContext = {
      args: { title: 'Bye' },
      parameters: Plain.parameters,
      get argTypes(): never {
        throw new Error('ArgTypesRemovedFromStoryContextError')
      },
    }
    expect(Slots.parameters.docs.source.transform('', beforeEachContext)).toBe('<Card title="Bye">Body</Card>')
    expect(Plain.parameters.docs.source.transform('<Card title="Hi" />', beforeEachContext)).toBe('<Card title="Bye" />')
    expect(Plain.parameters.docs.source.originalSource).toBe('<Card title="Hi" />')
    expect(Plain.parameters.docs.source.transform('<Card title="Hi" />', {
      args: { title: 'Bye', count: 2 },
      parameters: Plain.parameters,
    })).toBe('<Card title="Bye" :count="2" />')
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
  })
})

describe('generateCSF router prop', () => {
  const source = (meta: string, stories: string): string => `<script setup>
import Card from './Card.vue'
const routes = [{ path: '/' }]
const extra = (story) => story
</script>
<template>
  <Meta title="Test/Card" :component="Card"${meta} />
${stories}
</template>
`
  /** Evaluates the CSF with withRouter replaced by a stub that records its arguments */
  function routerArgs(code: string): Record<string, any> {
    const exports = evaluateCSF(code.replace(/^import .*$/gm, ''), {
      Card: Button,
      __VueCsfStories: {},
      __vueCsfWithRouter: (...options: unknown[]) => ({ withRouter: options }),
    })
    return Object.fromEntries(Object.entries(exports)
      .filter(([name]) => name !== 'default')
      .map(([name, story]) => [name, story.decorators]))
  }

  it('merges the meta router into every story, story options last', () => {
    const code = generateCSF(parseStoriesVue(source(
      ' :router="{ routes, initialRoute: \'/\' }"',
      `  <Story name="Home"><Card /></Story>
  <Story name="About" :router="{ initialRoute: '/about' }" :decorators="[extra]"><Card /></Story>`,
    )))

    expect(code).toContain('import { withRouter as __vueCsfWithRouter } from \'@v-contrib/storybook-vue-addon/router\'')
    const decorators = routerArgs(code)
    const meta = {
      routes: [
        { path: '/' },
      ],
      initialRoute: '/',
    }
    expect(decorators.Home).toEqual([
      {
        withRouter: [meta],
      },
    ])
    // The router decorator wraps the story's own decorators
    expect(decorators.About).toHaveLength(2)
    expect(decorators.About[1]).toEqual({
      withRouter: [
        meta,
        { initialRoute: '/about' },
      ],
    })
  })

  it('supports a router on a story only, and a bare router attribute', () => {
    const code = generateCSF(parseStoriesVue(source('', `  <Story name="Plain"><Card /></Story>
  <Story name="Routed" router><Card /></Story>`)))

    const decorators = routerArgs(code)
    expect(decorators.Plain).toBeUndefined()
    expect(decorators.Routed).toEqual([
      {
        withRouter: [undefined, true],
      },
    ])
  })

  it('keeps the router on extends stories: meta, base and own options, around their decorators', () => {
    const code = generateCSF(parseStoriesVue(source(
      ' :router="{ routes }"',
      `  <Story name="Base" :router="{ initialRoute: '/a' }" :decorators="[extra]"><Card /></Story>
  <Story name="Same" extends="Base" />
  <Story name="Decorated" extends="Base" :decorators="[extra, extra]" />
  <Story name="Moved" extends="Base" :router="{ initialRoute: '/b' }" />
  <Story name="Deeper" extends="Moved" router />`,
    )))
    const decorators = routerArgs(code)
    const meta = {
      routes: [
        { path: '/' },
      ],
    }
    const extra = decorators.Base[0]

    expect(decorators.Base).toEqual([
      extra,
      {
        withRouter: [
          meta,
          { initialRoute: '/a' },
        ],
      },
    ])
    expect(decorators.Same).toEqual(decorators.Base)
    expect(decorators.Decorated).toEqual([
      extra,
      extra,
      {
        withRouter: [
          meta,
          { initialRoute: '/a' },
        ],
      },
    ])
    expect(decorators.Moved).toEqual([
      extra,
      {
        withRouter: [
          meta,
          { initialRoute: '/a' },
          { initialRoute: '/b' },
        ],
      },
    ])
    expect(decorators.Deeper).toEqual([
      extra,
      {
        withRouter: [
          meta,
          { initialRoute: '/a' },
          { initialRoute: '/b' },
          true,
        ],
      },
    ])
  })

  it('gives an extends story its own router and decorators without a meta router', () => {
    const code = generateCSF(parseStoriesVue(source('', `  <Story name="Base"><Card /></Story>
  <Story name="Routed" extends="Base" router :decorators="[extra]" />`)))
    const decorators = routerArgs(code)

    expect(decorators.Base).toBeUndefined()
    expect(decorators.Routed).toEqual([
      expect.any(Function),
      {
        withRouter: [undefined, true],
      },
    ])
  })

  it('does not import the router helper when no story uses it', () => {
    const code = generateCSF(parseStoriesVue(source('', '  <Story name="Plain"><Card /></Story>')))

    expect(code).not.toContain('storybook-vue-addon/router')
    expect(code).not.toContain('__vueCsfWithRouter')
  })
})

describe('generateCSF extends', () => {
  it('passes :tests on an extends story through', () => {
    const code = generateCSF(parseStoriesVue(`<script setup>
import Card from './Card.vue'
const checks = [() => {}]
</script>
<template>
  <Meta title="T" :component="Card" />
  <Story name="Base"><Card /></Story>
  <Story name="Checked" extends="Base" :tests="checks" />
</template>`)).replace(/^import .*$/gm, '')
    const { Checked } = evaluateCSF(code, { Card: Button })

    expect(Checked.tests).toHaveLength(1)
  })

  it('reports extends of a story further down', () => {
    expect(() => parseStoriesVue(`<template>
  <Meta title="T" />
  <Story name="Early" extends="Late" />
  <Story name="Late"><div /></Story>
</template>`)).toThrow(/Late/)
  })
})

describe('generateCSF story argTypes', () => {
  it('passes arg-types on a Story through, also on extends stories', () => {
    const code = generateCSF(parseStoriesVue(`<script setup>
import Card from './Card.vue'
const pageTypes = { page: { control: 'select', options: ['a', 'b'] } }
</script>
<template>
  <Meta title="T" :component="Card" />
  <Story name="Base" :arg-types="pageTypes"><Card /></Story>
  <Story name="More" extends="Base" :arg-types="{ size: { control: 'radio' } }" />
</template>
`)).replace(/^import .*$/gm, '')
    const { Base, More } = evaluateCSF(code, { Card: Button, __VueCsfStories: {} })

    expect(Base.argTypes).toEqual({
      page: {
        control: 'select',
        options: ['a', 'b'],
      },
    })
    expect(More.argTypes).toEqual({
      page: {
        control: 'select',
        options: ['a', 'b'],
      },
      size: { control: 'radio' },
    })
  })
})

/** Generated CSF of a story file, checked by a real JS/TS parser (also for redeclarations) */
async function compileStoryFile(source: string): Promise<string> {
  const code = generateCSF(parseStoriesVue(source))
  await transformWithOxc(code, 'story.ts', { lang: 'ts' })
  return code
}

describe('generateCSF imports and names', () => {
  it('compiles when the story file imports h from vue itself', async () => {
    const code = await compileStoryFile(`<script setup>
import { h } from 'vue'
import Card from './Card.vue'
const icon = () => h('i')
</script>
<template>
  <Meta title="T" :component="Card" />
  <Story name="A"><Card title="x" /></Story>
</template>`)

    const { A } = evaluateCSF(code.replace(/^import .*$/gm, ''), { Card: Button, h })
    expect(A.render({ title: 'x' }, {})().type).toBe(Button)
  })

  it('compiles a story named like an import, and both stay usable', async () => {
    const code = await compileStoryFile(`<script setup>
import Button from './Button.vue'
</script>
<template>
  <Meta title="T" :component="Button" />
  <Story name="Button"><Button label="x" /></Story>
  <Story name="More" extends="Button" :args="{ primary: true }" />
</template>`)

    const exports = evaluateCSF(code.replace(/^import .*$/gm, ''), { Button })
    expect(exports.default.component).toBe(Button)
    expect(exports.Button.args).toEqual({ label: 'x' })
    expect(exports.More.args).toEqual({ label: 'x', primary: true })
  })

  it('keeps imports and code of a plain <script> block', async () => {
    const code = await compileStoryFile(`<script>
import Card from './Card.vue'
const defaults = { title: 'From script' }
</script>
<template>
  <Meta title="T" :component="Card" :args="defaults" />
  <Story name="A"><Card /></Story>
</template>`)

    expect(code).toContain('import Card from \'./Card.vue\'')
    const exports = evaluateCSF(code.replace(/^import .*$/gm, ''), { Card: Button })
    expect(exports.default.args).toEqual({ title: 'From script' })
  })

  it('takes imports from both script blocks once', async () => {
    const code = await compileStoryFile(`<script>
import Card from './Card.vue'
</script>
<script setup>
import Card from './Card.vue'
import { ref } from 'vue'
</script>
<template>
  <Meta title="T" :component="Card" />
  <Story name="A"><Card /></Story>
</template>`)

    expect(code.match(/import Card from/g)).toHaveLength(1)
    expect(code).toContain('import { ref } from \'vue\'')
  })

  it('reports exports in a plain <script> block', () => {
    expect(() => parseStoriesVue(`<script>
export const x = 1
</script>
<template><Meta title="T" /></template>`)).toThrow(/export/)
  })

  it('finds the component import with a trailing comment', () => {
    const parsed = parseStoriesVue(`<script setup>
import Card from './Card.vue' // the card
</script>
<template><Meta title="T" :component="Card" /></template>`)

    expect(componentImportSource(parsed)).toBe('./Card.vue')
  })

  it('leaves import lines inside template literals alone', async () => {
    const source = `<script setup>
import Card from './Card.vue'
const snippet = \`
import Other from './Other.vue'
\`
</script>
<template>
  <Meta title="T" :component="Card" :args="{ snippet }" />
  <Story name="A"><Card /></Story>
</template>`
    const code = await compileStoryFile(source)

    expect(parseStoriesVue(source).imports).toEqual(['import Card from \'./Card.vue\''])
    const exports = evaluateCSF(code.replace(/^import (?:Card|\{).*$/gm, ''), { Card: Button })
    expect(exports.default.args.snippet).toContain('import Other from')
  })
})

describe('generateCSF args', () => {
  const file = (stories: string): string => `<script setup>
import Card from './Card.vue'
</script>
<template>
  <Meta title="T" :component="Card" />
${stories}
</template>`
  const argsOf = (source: string): Record<string, any> => {
    const code = generateCSF(parseStoriesVue(source)).replace(/^import .*$/gm, '')
    const exports = evaluateCSF(code, { Card: Button, __VueCsfStories: {} })
    return Object.fromEntries(Object.entries(exports)
      .filter(([name]) => name !== 'default')
      .map(([name, story]) => [name, story.args]))
  }

  it('does not run :args expressions while parsing', () => {
    const g = globalThis as Record<string, unknown>
    delete g.vueCsfArgsRan
    parseStoriesVue(file('  <Story name="A" :args="{ a: (globalThis.vueCsfArgsRan = true) }"><Card /></Story>'))

    expect(g.vueCsfArgsRan).toBeUndefined()
  })

  it('keeps static attributes of a component in #default, with :args on top', () => {
    expect(argsOf(file(`  <Story name="A" :args="{ page: 'intro' }">
    <template #default>
      <Card brand="Acme docs" />
    </template>
  </Story>
  <Story name="B" :args="{ label: 'from args' }">
    <template #default="{ args }">
      <Card v-bind="args" size="small" label="static" />
    </template>
  </Story>`))).toEqual({
      A: { brand: 'Acme docs', page: 'intro' },
      B: { size: 'small', label: 'from args' },
    })
  })

  it('merges :args over the attributes of a static story', () => {
    expect(argsOf(file(`  <Story name="Simple" :args="{ primary: true }"><Card label="Hi" /></Story>
  <Story name="Slotted" :args="{ label: 'Args' }"><Card label="Hi" size="small">Body</Card></Story>`))).toEqual({
      Simple: { label: 'Hi', primary: true },
      Slotted: { label: 'Args', size: 'small' },
    })
  })
})

describe('generateCSF escaping and names', () => {
  const file = (meta: string, stories: string): string => `<script setup>
import Card from './Card.vue'
</script>
<template>
  <Meta ${meta} :component="Card" />
${stories}
</template>`
  const load = async (source: string): Promise<Record<string, any>> => {
    const code = await compileStoryFile(source)
    return evaluateCSF(code.replace(/^import .*$/gm, ''), { Card: Button, __VueCsfStories: {} })
  }

  it('compiles files with CRLF line endings', async () => {
    const source = file('title="T"', `  <Story name="A">
    <Card label="x">
      Body
    </Card>
  </Story>`).replace(/\n/g, '\r\n')
    const { A } = await load(source)

    expect(A.parameters.docs.source.originalSource).toBe('<Card label="x">\n  Body\n</Card>')
  })

  it('escapes quotes in title and tags', async () => {
    const meta = await load(file('title="Bob\'s \\ stories" :tags="[\'dev\', &quot;it\'s&quot;]"', '  <Story name="A"><Card /></Story>'))

    expect(meta.default.title).toBe('Bob\'s \\ stories')
    expect(meta.default.tags).toEqual(['dev', 'it\'s'])
  })

  it('reads an empty tags array as no tags, and reports tags it cannot read', async () => {
    expect((await load(file('title="T" :tags="[]"', ''))).default.tags).toEqual([])
    expect(() => parseStoriesVue(file('title="T" :tags="[myTag]"', ''))).toThrow(/tags/)
  })

  it('puts story tags on the story; an extends story keeps its base tags unless it has its own', async () => {
    const mod = await load(file('title="T" :tags="[\'autodocs\']"', `  <Story name="A" :tags="['!test', 'wip']"><Card /></Story>
  <Story name="B" extends="A" />
  <Story name="C" extends="A" :tags="['slow']" />
  <Story name="D"><Card /></Story>`))

    expect(mod.default.tags).toEqual(['autodocs'])
    expect(mod.A.tags).toEqual(['!test', 'wip'])
    expect(mod.B.tags).toEqual(['!test', 'wip'])
    expect(mod.C.tags).toEqual(['slow'])
    expect(mod.D.tags).toBeUndefined()
  })

  it('reports story tags it cannot read', () => {
    expect(() => parseStoriesVue(file('title="T"', '  <Story name="A" :tags="\'wip\'"><Card /></Story>')))
      .toThrow('<Story name="A" :tags="\'wip\'">: tags must be an array of strings')
  })

  it('leaves out a missing title, so Storybook titles the file from its path', async () => {
    const { default: meta } = await load(file('', '  <Story name="A"><Card /></Story>'))

    expect(meta).not.toHaveProperty('title')
  })

  it('exports a story whose name starts with a digit', async () => {
    const exports = await load(file('title="T"', '  <Story name="1st try"><Card /></Story>'))

    expect(exports._1stTry).toBeDefined()
  })

  it.each([
    ['without a name', '<Story><Card /></Story>', /name/],
    ['with a name without letters or digits', '<Story name="日本"><Card /></Story>', /日本/],
    ['with the same export name as another', '<Story name="With Icon"><Card /></Story><Story name="with-icon"><Card /></Story>', /WithIcon/],
    ['extending an unknown story', '<Story name="A" extends="Nope" />', /Nope/],
  ])('reports a story %s', (_case, stories, message) => {
    expect(() => parseStoriesVue(file('title="T"', stories))).toThrow(message)
  })
})

describe('generateCSF story order, names and parameters', () => {
  const source = `<script setup>
import Card from './Card.vue'
let metaCalls = 0
let storyCalls = 0
const metaParams = () => ({ calls: ++metaCalls, docs: { description: { component: 'C' } } })
const storyParams = () => ({ calls: ++storyCalls, docs: { description: { story: 'S' } } })
</script>
<template>
  <Meta title="T" :component="Card" :parameters="metaParams()" />
  <Story name="zebra crossing" :parameters="storyParams()"><Card>Body</Card></Story>
  <Story name="Apple"><Card /></Story>
  <Story name="Apple pie" extends="Apple" />
</template>`
  const load = (): Record<string, any> => evaluateCSF(
    generateCSF(parseStoriesVue(source)).replace(/^import .*$/gm, ''),
    { Card: Button, __VueCsfStories: {} },
  )

  it('keeps the file order of stories for Docs pages', () => {
    expect(load().__namedExportsOrder).toEqual(['ZebraCrossing', 'Apple', 'ApplePie'])
  })

  it('gives every story its name as written', () => {
    const { ZebraCrossing, Apple, ApplePie } = load()

    expect([ZebraCrossing.name, Apple.name, ApplePie.name]).toEqual(['zebra crossing', 'Apple', 'Apple pie'])
  })

  it('evaluates a parameters expression once', () => {
    const { default: meta, ZebraCrossing } = load()

    expect(meta.parameters.calls).toBe(1)
    expect(meta.parameters.docs.description.component).toBe('C')
    expect(ZebraCrossing.parameters.calls).toBe(1)
    expect(ZebraCrossing.parameters.docs.description.story).toBe('S')
    expect(ZebraCrossing.parameters.docs.source.originalSource).toBe('<Card>Body</Card>')
  })
})
