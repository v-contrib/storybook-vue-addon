import type { ParsedResult, ParsedStoryResult } from './parse'

export function generateCSF(parsed: ParsedResult): string {
  const lines: string[] = []

  // Add Vue's h import for render functions
  lines.push('import { h } from \'vue\'')

  // Add original imports
  for (const imp of parsed.imports) {
    lines.push(imp.trim())
  }

  lines.push('')

  // Add script setup code (variables, argTypes, etc.)
  if (parsed.scriptSetup.trim()) {
    lines.push(parsed.scriptSetup)
    lines.push('')
  }

  // Generate default export (meta)
  lines.push('export default {')
  lines.push(`  title: '${parsed.meta.title}',`)

  if (parsed.meta.componentRef) {
    lines.push(`  component: ${parsed.meta.componentRef},`)
  }
  if (parsed.meta.argTypesRef) {
    lines.push(`  argTypes: ${parsed.meta.argTypesRef},`)
  }
  if (parsed.meta.argsRef) {
    lines.push(`  args: ${parsed.meta.argsRef},`)
  }
  if (parsed.meta.decoratorsRef) {
    lines.push(`  decorators: ${parsed.meta.decoratorsRef},`)
  }
  if (parsed.meta.parametersRef) {
    lines.push(`  parameters: ${parsed.meta.parametersRef},`)
  }
  if (parsed.meta.tags) {
    lines.push(`  tags: [${parsed.meta.tags.map(t => `'${t}'`).join(', ')}],`)
  }

  lines.push('}')
  lines.push('')

  // Generate story exports
  for (const story of parsed.stories) {
    lines.push(generateStory(story, parsed.meta.componentRef))
    lines.push('')
  }

  // Add HMR support
  lines.push('if (import.meta.hot) {')
  lines.push('  import.meta.hot.accept()')
  lines.push('}')

  return lines.join('\n')
}

function generateStory(story: ParsedStoryResult, componentRef?: string): string {
  const storyName = toValidIdentifier(story.name)
  const lines: string[] = []

  // Handle story extension
  if (story.extendsStory) {
    const baseStory = toValidIdentifier(story.extendsStory)
    lines.push(`export const ${storyName} = {`)
    lines.push(`  ...${baseStory},`)

    if (story.args || story.argsRef) {
      const argsValue = story.argsRef || JSON.stringify(story.args)
      lines.push(`  args: { ...${baseStory}.args, ...${argsValue} },`)
    }

    if (story.decoratorsRef) {
      lines.push(`  decorators: ${story.decoratorsRef},`)
    }
    if (story.parametersRef) {
      lines.push(`  parameters: ${story.parametersRef},`)
    }
    if (story.playRef) {
      lines.push(`  play: ${story.playRef},`)
    }

    lines.push('}')
    return lines.join('\n')
  }

  lines.push(`export const ${storyName} = {`)

  // Args
  const args = story.args || story.staticProps
  if (Object.keys(args).length > 0 || story.argsRef) {
    if (story.argsRef) {
      lines.push(`  args: ${story.argsRef},`)
    }
    else {
      lines.push(`  args: ${formatObject(args)},`)
    }
  }

  // Render function. Static props are already the story's args, so both kinds
  // of story render from args. Like Storybook's default Vue render, return a
  // render function rather than a VNode: Storybook updates args in place when a
  // control changes, and only a render function re-reads them.
  if (story.hasArgsSlot || (story.slotContent && componentRef)) {
    lines.push(`  render: (args) => () => h(${componentRef || 'Component'}, args),`)
  }

  // Optional properties
  if (story.decoratorsRef) {
    lines.push(`  decorators: ${story.decoratorsRef},`)
  }
  if (story.playRef) {
    lines.push(`  play: ${story.playRef},`)
  }
  if (story.testsRef) {
    lines.push(`  tests: ${story.testsRef},`)
  }

  // No static docs.source.code: Storybook generates the snippet from the
  // current args, and skips that whenever source.code is set
  if (story.parametersRef) {
    lines.push(`  parameters: ${story.parametersRef},`)
  }

  lines.push('}')
  return lines.join('\n')
}

function toValidIdentifier(name: string): string {
  return name
    .replace(/[^a-z0-9]/gi, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

function formatObject(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj)
    .map(([k, v]) => `${k}: ${formatValue(v)}`)
    .join(', ')
  return `{ ${entries} }`
}

function formatValue(value: unknown): string {
  if (typeof value === 'string')
    return `'${value}'`
  if (typeof value === 'boolean')
    return String(value)
  if (typeof value === 'number')
    return String(value)
  if (value === null)
    return 'null'
  if (value === undefined)
    return 'undefined'
  if (Array.isArray(value))
    return `[${value.map(formatValue).join(', ')}]`
  if (typeof value === 'object')
    return formatObject(value as Record<string, unknown>)
  return String(value)
}
