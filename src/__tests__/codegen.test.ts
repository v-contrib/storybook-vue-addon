import type { ParsedResult } from '../parse'
import { describe, expect, it } from 'vitest'
import { generateCSF } from '../codegen'

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
      stories: [{
        name: 'Primary',
        staticProps: { label: 'Click me', primary: true },
        hasArgsSlot: false,
        slotContent: '<Button label="Click me" primary />',
      }],
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
      stories: [{
        name: 'Playground',
        args: { label: 'Hello' },
        hasArgsSlot: true,
        staticProps: {},
        slotContent: '<Button v-bind="args" />',
      }],
      scriptSetup: '',
      imports: ['import Button from \'./Button.vue\''],
    }

    const result = generateCSF(parsed)

    expect(result).toContain('export const Playground')
    expect(result).toContain('render: (args)')
    expect(result).toContain('label: \'Hello\'')
  })

  it('converts story names to valid identifiers', () => {
    const parsed: ParsedResult = {
      meta: { title: 'Test' },
      stories: [{
        name: 'With Icon',
        staticProps: {},
        hasArgsSlot: false,
        slotContent: '',
      }],
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
      stories: [{
        name: 'WithPlay',
        playRef: 'clickButton',
        staticProps: { label: 'Click' },
        hasArgsSlot: false,
        slotContent: '<Button label="Click" />',
      }],
      scriptSetup: '',
      imports: [],
    }

    const result = generateCSF(parsed)

    expect(result).toContain('play: clickButton')
  })
})
