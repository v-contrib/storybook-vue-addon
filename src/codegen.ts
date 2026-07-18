import type { ParsedResult, ParsedStoryResult } from './parse'
import type { SourcePart } from './story-content'
import { toValidIdentifier } from './identifier'
import { needsStoriesSfc, SLOTS_PROP, STORIES_SFC_SUFFIX, STORY_PROP } from './stories-sfc'

export interface GenerateCSFOptions {
  /**
   * Import path of the stories component (see buildStoriesSfc).
   * @default `./stories${STORIES_SFC_SUFFIX}`
   */
  storiesImport?: string
}

/** Local name of the imported stories component */
const STORIES_COMPONENT = '__VueCsfStories'

/**
 * Splits args into props and slots, like Storybook's own Vue render: args whose
 * argType is in the "slots" category (from docgen) fill the component's slots.
 * With Storybook 11's server-side docgen the preview has no docgen argTypes;
 * there, like Storybook, args that are not declared props of the component
 * (and not on* listeners) are slots.
 * Empty values leave the slot alone; objects are shown as JSON.
 */
const RENDER_HELPERS = `function __vueCsfSplitArgs(args, context) {
  const argTypes = __vueCsfArgTypes(context)
  const declared = __vueCsfDeclaredProps(context?.component)
  const isSlot = name => argTypes[name]?.table?.category === 'slots'
    || (declared !== undefined && !declared.has(__vueCsfCamelize(name)) && !/^on[A-Z]/.test(name))
  const props = {}
  const slots = {}
  for (const [name, value] of Object.entries(args || {})) {
    if (!isSlot(name))
      props[name] = value
    else if (value !== undefined && value !== null && value !== '')
      slots[name] = typeof value === 'function' ? value : () => __vueCsfSlotContent(value)
  }
  return { props, slots }
}

function __vueCsfDeclaredProps(component) {
  if (!globalThis.FEATURES?.docgenServer || !component)
    return undefined
  const props = component.props
  return new Set((Array.isArray(props) ? props : Object.keys(props || {})).map(__vueCsfCamelize))
}

function __vueCsfCamelize(name) {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

// Storybook 11 with server-side docgen throws when the context of beforeEach
// (which emits the Code panel snippet) is asked for argTypes
function __vueCsfArgTypes(context) {
  try {
    return context?.argTypes || {}
  }
  catch {
    return {}
  }
}

function __vueCsfSlotContent(value) {
  return typeof value === 'object' && !Array.isArray(value) && !value.__v_isVNode
    ? JSON.stringify(value)
    : value
}`

/**
 * Helpers for the docs snippet of stories with content. They turn current arg
 * values into template attributes and text, close to Storybook's own Vue snippet.
 */
const SOURCE_HELPERS = `function __vueCsfAttr(name, value) {
  if (value === undefined || value === null || value === false || typeof value === 'function')
    return ''
  if (value === true)
    return ' ' + name
  if (typeof value === 'string')
    return ' ' + name + '="' + value.replace(/"/g, '&quot;') + '"'
  return ' :' + name + '="' + JSON.stringify(value).replace(/"/g, "'") + '"'
}

function __vueCsfAttrs(args) {
  return Object.entries(args || {}).map(([name, value]) => __vueCsfAttr(name, value)).join('')
}

function __vueCsfText(value) {
  if (value === undefined || value === null)
    return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function __vueCsfDedent(code) {
  const lines = code.split('\\n')
  const indents = lines.filter(line => line.trim()).map(line => line.match(/^ */)[0].length)
  const min = indents.length ? Math.min(...indents) : 0
  return lines.map(line => line.slice(min)).join('\\n').trim()
}`

export function generateCSF(parsed: ParsedResult, options: GenerateCSFOptions = {}): string {
  const lines: string[] = []
  const usesStoriesSfc = parsed.stories.some(needsStoriesSfc)

  // Add Vue's h import for render functions
  lines.push('import { h } from \'vue\'')

  if (usesStoriesSfc) {
    const path = options.storiesImport ?? `./stories${STORIES_SFC_SUFFIX}`
    lines.push(`import ${STORIES_COMPONENT} from '${path}'`)
  }

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

  if (parsed.stories.length > 0) {
    lines.push(RENDER_HELPERS)
    lines.push('')
    lines.push(SOURCE_HELPERS)
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
  // - Snippets are Vue templates; the default (jsx) can't highlight `#slot` attributes.
  // - Storybook's "save story" (Controls) rewrites the story file as CSF
  //   JavaScript, which fails on a .stories.vue file; hide it.
  // User meta parameters take precedence.
  const p = parsed.meta.parametersRef
  if (p) {
    lines.push(`  parameters: {`)
    lines.push(`    ...${p},`)
    lines.push(`    docs: { ...${p}?.docs, source: { language: 'html', ...${p}?.docs?.source } },`)
    lines.push(`    controls: { disableSaveFromUI: true, ...${p}?.controls },`)
    lines.push(`  },`)
  }
  else {
    lines.push(`  parameters: { docs: { source: { language: 'html' } }, controls: { disableSaveFromUI: true } },`)
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

  // Render function. Like Storybook's default Vue render, return a render
  // function rather than a VNode: Storybook updates args in place when a
  // control changes, and only a render function re-reads them.
  const compiled = needsStoriesSfc(story)
  if (compiled) {
    // Story content is compiled into the stories component; it gets args as a prop
    lines.push(`  render: (args, context) => () => {`)
    lines.push(`    const { props, slots } = __vueCsfSplitArgs(args, context)`)
    lines.push(`    return h(${STORIES_COMPONENT}, { args: props, ${SLOTS_PROP}: slots, ${STORY_PROP}: '${storyName}' })`)
    lines.push(`  },`)
  }
  else if (story.hasArgsSlot || (story.slotContent && componentRef)) {
    // Only the meta component: static props are already the story's args
    lines.push(`  render: (args, context) => () => {`)
    lines.push(`    const { props, slots } = __vueCsfSplitArgs(args, context)`)
    lines.push(`    return h(${componentRef || 'Component'}, props, slots)`)
    lines.push(`  },`)
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

  // Docs snippet. Never a static docs.source.code: Storybook shows that
  // verbatim and stops following the args. originalSource is the story as
  // written; a transform fills in the current args (slot args are not
  // attributes, so they are left out). Storybook 11 with the docgen server
  // has no snippet of its own for these stories and transforms originalSource.
  const source = docsSource(story, componentRef, compiled)
  if (source) {
    if (story.parametersRef) {
      const p = story.parametersRef
      lines.push(`  parameters: { ...${p}, docs: { ...${p}?.docs, source: { ${source}, ...${p}?.docs?.source } } },`)
    }
    else {
      lines.push(`  parameters: { docs: { source: { ${source} } } },`)
    }
  }
  else if (story.parametersRef) {
    lines.push(`  parameters: ${story.parametersRef},`)
  }

  lines.push('}')
  return lines.join('\n')
}

/**
 * `docs.source` properties of a story: originalSource and a transform, or
 * undefined when there is nothing to show.
 */
function docsSource(story: ParsedStoryResult, componentRef: string | undefined, compiled: boolean): string | undefined {
  const content = story.content
  const props = `const args = __vueCsfSplitArgs(context.args, context).props`
  if (compiled) {
    return `originalSource: '${escapeString(content!.originalSource)}',\n    transform: (_code, context) => {\n      ${props}\n      return ${sourceExpression(content!.sourceParts)}\n    }`
  }
  const tag = content?.tag ?? componentRef
  if (!tag)
    return undefined
  // Simple story: the meta component with args as attributes. Only replace our
  // own originalSource; Storybook 10's Vue renderer emits a richer snippet.
  const original = content?.originalSource ?? `<${tag} />`
  return `originalSource: '${escapeString(original)}',\n    transform: (code, context) => {\n      if (code !== context.parameters?.docs?.source?.originalSource)\n        return code\n      ${props}\n      return '<${escapeString(tag)}' + __vueCsfAttrs(args) + ' />'\n    }`
}

/** `args.items[0].name` -> `args?.items?.[0]?.name` */
function optionalPath(path: string): string {
  return path.replace(/\.(?=[A-Z_$])/gi, '?.').replace(/\[/g, '?.[')
}

function escapeTemplateLiteral(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

/** JS expression building the docs snippet from `args` */
function sourceExpression(parts: SourcePart[]): string {
  const body = parts.map((part) => {
    switch (part.kind) {
      case 'text':
        return escapeTemplateLiteral(part.text)
      case 'attrs':
        // A `${…}` placeholder inside the generated template literal
        // eslint-disable-next-line no-template-curly-in-string
        return '${__vueCsfAttrs(args)}'
      case 'attr':
        return `\${__vueCsfAttr('${part.name}', ${optionalPath(part.path)})}`
      case 'interp':
        return `\${__vueCsfText(${optionalPath(part.path)})}`
      default:
        return ''
    }
  }).join('')
  return `__vueCsfDedent(\`${body}\`)`
}

function formatKey(key: string): string {
  return /^[A-Z_$][\w$]*$/i.test(key)
    ? key
    : `'${escapeString(key)}'`
}

function escapeString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, '\\\'').replace(/\n/g, '\\n')
}

function formatObject(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj)
    .map(([k, v]) => `${formatKey(k)}: ${formatValue(v)}`)
    .join(', ')
  return `{ ${entries} }`
}

function formatValue(value: unknown): string {
  if (typeof value === 'string')
    return `'${escapeString(value)}'`
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
