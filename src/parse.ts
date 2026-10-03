import type { ParserPlugin } from '@babel/parser'
import type { Node, Statement, StringLiteral } from '@babel/types'
import type {
  AttributeNode,
  DirectiveNode,
  ElementNode,
  SimpleExpressionNode,
  TemplateChildNode,
} from '@vue/compiler-core'
import type { SFCBlock } from '@vue/compiler-sfc'
import type { StoryContent } from './story-content'
import { babelParse, compileTemplate, parse as parseSfc } from '@vue/compiler-sfc'
import { toValidIdentifier } from './identifier'
import { analyzeStoryContent } from './story-content'

/** A raw `<script>`/`<style>` block, as needed to rebuild an SFC */
export interface SfcBlock {
  content: string
  attrs: Record<string, string | true>
}

export interface ParsedResult {
  meta: {
    /** Absent: Storybook titles the file from its path */
    title?: string
    componentRef?: string
    argTypesRef?: string
    argsRef?: string
    decoratorsRef?: string
    parametersRef?: string
    /** `router` prop: options for the router helper (`true` for defaults) */
    routerRef?: string
    tags?: string[]
  }
  stories: ParsedStoryResult[]
  scriptSetup: string
  imports: string[]
  /** Raw blocks of the story file, used to compile story content */
  blocks?: {
    script?: SfcBlock
    scriptSetup?: SfcBlock
    styles: SfcBlock[]
  }
}

export interface ParsedStoryResult {
  name: string
  argsRef?: string
  argTypesRef?: string
  staticProps: Record<string, unknown>
  hasArgsSlot: boolean
  slotContent: string
  decoratorsRef?: string
  parametersRef?: string
  playRef?: string
  testsRef?: string
  /** `router` prop: options for the router helper (`true` for defaults) */
  routerRef?: string
  extendsStory?: string
  /** What is inside the story; absent for stories without content or with `extends` */
  content?: StoryContent
}

function toBlock(block: SFCBlock | null): SfcBlock | undefined {
  if (!block)
    return undefined
  return {
    content: block.content,
    attrs: { ...block.attrs },
  }
}

export function parseStoriesVue(code: string): ParsedResult {
  // CRLF: offsets, snippets and generated strings all assume \n
  const { descriptor, errors } = parseSfc(code.replace(/\r\n?/g, '\n'))

  if (errors.length > 0) {
    throw new Error(`Failed to parse Vue SFC: ${errors[0].message}`)
  }

  // The CSF module gets the code of both script blocks, imports hoisted
  const plain = splitImports(descriptor.script, 'plain <script>')
  const setup = splitImports(descriptor.scriptSetup, '<script setup>')
  const imports = [
    ...new Set([
      ...plain.imports,
      ...setup.imports,
    ]),
  ]
  const scriptCode = [plain.code, setup.code].filter(Boolean).join('\n\n')

  if (!descriptor.template) {
    throw new Error('Template is required in .stories.vue files')
  }

  const templateAst = compileTemplate({
    source: descriptor.template.content,
    filename: 'story.vue',
    id: 'story',
  }).ast

  if (!templateAst) {
    throw new Error('Failed to parse template AST')
  }

  // Props come from the raw AST: the compiled one turns expressions with
  // identifiers (e.g. `{ routes, initialRoute: '/' }`) into compound nodes
  const rawChildren = descriptor.template.ast?.children ?? templateAst.children
  const meta = extractMeta(rawChildren)
  const stories = extractStories(rawChildren)
  checkStoryNames(stories)

  // Story content comes from the raw AST: offsets into the original source,
  // and no compiler transforms applied
  const rawStories = (descriptor.template.ast?.children ?? []).filter(
    (child): child is ElementNode => child.type === 1 && child.tag === 'Story',
  )
  stories.forEach((story, i) => {
    if (story.extendsStory || !rawStories[i])
      return
    story.content = analyzeStoryContent(rawStories[i], descriptor.source, meta.componentRef)
    if (story.content)
      story.staticProps = story.content.rootArgs ?? {}
  })

  return {
    meta,
    stories,
    scriptSetup: scriptCode,
    imports,
    blocks: {
      script: toBlock(descriptor.script),
      scriptSetup: toBlock(descriptor.scriptSetup),
      styles: descriptor.styles.map(style => toBlock(style)!),
    },
  }
}

/**
 * Import declarations of a script block, and its code without them. A plain
 * `<script>` must not export: its code also goes into the CSF module, where
 * every export is a story.
 */
function splitImports(block: SFCBlock | null, label: string): { imports: string[], code: string } {
  if (!block)
    return { imports: [], code: '' }
  const source = block.content
  const lang = block.lang ?? ''
  const plugins: ParserPlugin[] = []
  if (lang === 'ts' || lang === 'tsx')
    plugins.push('typescript')
  if (lang === 'jsx' || lang === 'tsx')
    plugins.push('jsx')

  let body: Statement[]
  try {
    body = babelParse(source, {
      sourceType: 'module',
      plugins,
      allowAwaitOutsideFunction: true,
    }).program.body
  }
  catch (error) {
    const message = error instanceof Error
      ? error.message
      : String(error)
    throw new Error(`Failed to parse ${label}: ${message}`)
  }

  const imports: string[] = []
  let code = ''
  let pos = 0
  for (const node of body) {
    if (label.startsWith('plain') && node.type.startsWith('Export'))
      throw new Error(`A plain <script> in a story file cannot export (line ${node.loc!.start.line}): use <script setup>`)
    if (node.type !== 'ImportDeclaration')
      continue
    imports.push(source.slice(node.start!, node.end!))
    code += source.slice(pos, node.start!)
    pos = node.end!
  }
  code += source.slice(pos)
  return {
    imports,
    code: code.trim(),
  }
}

function extractMeta(children: TemplateChildNode[]): ParsedResult['meta'] {
  const metaNode = children.find(
    (child): child is ElementNode =>
      child.type === 1 && child.tag === 'Meta',
  )

  if (!metaNode) {
    throw new Error('<Meta> component is required')
  }

  const meta: ParsedResult['meta'] = {}

  for (const prop of metaNode.props) {
    if (prop.type === 6) {
      // AttributeNode
      const attr = prop as AttributeNode
      if (attr.name === 'title' && attr.value) {
        meta.title = attr.value.content
      }
      if (attr.name === 'router')
        meta.routerRef = 'true'
    }
    else if (prop.type === 7) {
      // DirectiveNode (v-bind :prop)
      const dir = prop as DirectiveNode
      if (dir.arg?.type === 4) {
        const argName = (dir.arg as SimpleExpressionNode).content
        const rawValue
          = dir.exp?.type === 4
            ? (dir.exp as SimpleExpressionNode).content
            : undefined
        // Strip _ctx. prefix that Vue compiler adds
        const value = rawValue?.replace(/^_ctx\./, '')

        if (argName === 'component')
          meta.componentRef = value
        if (argName === 'arg-types' || argName === 'argTypes')
          meta.argTypesRef = value
        if (argName === 'args')
          meta.argsRef = value
        if (argName === 'decorators')
          meta.decoratorsRef = value
        if (argName === 'parameters')
          meta.parametersRef = value
        if (argName === 'router')
          meta.routerRef = value || 'true'
        if (argName === 'tags' && value)
          meta.tags = parseTags(value)
      }
    }
  }

  return meta
}

function extractStories(children: TemplateChildNode[]): ParsedStoryResult[] {
  return children
    .filter(
      (child): child is ElementNode =>
        child.type === 1 && child.tag === 'Story',
    )
    .map(parseStoryNode)
}

function parseStoryNode(node: ElementNode): ParsedStoryResult {
  const story: ParsedStoryResult = {
    name: '',
    staticProps: {},
    hasArgsSlot: false,
    slotContent: '',
  }

  // Extract props from Story component
  for (const prop of node.props) {
    if (prop.type === 6) {
      // Static attribute
      const attr = prop as AttributeNode
      if (attr.name === 'name' && attr.value) {
        story.name = attr.value.content
      }
      if (attr.name === 'extends' && attr.value) {
        story.extendsStory = attr.value.content
      }
      if (attr.name === 'router')
        story.routerRef = 'true'
    }
    else if (prop.type === 7) {
      // Directive
      const dir = prop as DirectiveNode
      if (dir.arg?.type === 4) {
        const argName = (dir.arg as SimpleExpressionNode).content
        const rawValue
          = dir.exp?.type === 4
            ? (dir.exp as SimpleExpressionNode).content
            : undefined
        // Strip _ctx. prefix that Vue compiler adds
        const value = rawValue?.replace(/^_ctx\./, '')

        if (argName === 'args')
          story.argsRef = value
        if (argName === 'decorators')
          story.decoratorsRef = value
        if (argName === 'parameters')
          story.parametersRef = value
        if (argName === 'play')
          story.playRef = value
        if (argName === 'tests')
          story.testsRef = value
        if (argName === 'arg-types' || argName === 'argTypes')
          story.argTypesRef = value
        if (argName === 'router')
          story.routerRef = value || 'true'
      }
    }
  }

  // Check for scoped slot (args slot)
  const defaultSlot = node.children.find(
    (child): child is ElementNode =>
      child.type === 1
      && child.tag === 'template'
      && child.props.some(
        p =>
          p.type === 7
          && p.name === 'slot'
          && p.arg?.type === 4
          && (p.arg as SimpleExpressionNode).content === 'default',
      ),
  )

  if (defaultSlot) {
    story.hasArgsSlot = true
    const slotProp = defaultSlot.props.find(
      p => p.type === 7 && p.name === 'slot',
    ) as DirectiveNode | undefined

    if (slotProp?.exp?.type === 4) {
      // Has destructured args
      story.hasArgsSlot = (
        slotProp.exp as SimpleExpressionNode
      ).content.includes('args')
    }
    story.slotContent = extractSlotContent(defaultSlot)
  }
  else if (node.children.length > 0) {
    // Direct children (static story)
    story.slotContent = extractDirectContent(node)
    story.staticProps = extractStaticPropsFromContent(node.children)
  }

  return story
}

function extractSlotContent(slotNode: ElementNode): string {
  // Return the template content as string for render function
  return slotNode.children
    .map((child) => {
      if (child.type === 1) {
        return reconstructElement(child as ElementNode)
      }
      return ''
    })
    .join('')
}

function extractDirectContent(storyNode: ElementNode): string {
  return storyNode.children
    .map((child) => {
      if (child.type === 1) {
        return reconstructElement(child as ElementNode)
      }
      return ''
    })
    .join('')
}

function reconstructElement(node: ElementNode): string {
  const props = node.props
    .map((prop) => {
      if (prop.type === 6) {
        const attr = prop as AttributeNode
        if (attr.value) {
          return `${attr.name}="${attr.value.content}"`
        }
        return attr.name
      }
      else if (prop.type === 7) {
        const dir = prop as DirectiveNode
        if (dir.name === 'bind' && dir.arg?.type === 4) {
          const argName = (dir.arg as SimpleExpressionNode).content
          const value
            = dir.exp?.type === 4
              ? (dir.exp as SimpleExpressionNode).content
              : ''
          return `:${argName}="${value}"`
        }
      }
      return ''
    })
    .filter(Boolean)
    .join(' ')

  const attrs = props
    ? ` ${props}`
    : ''
  return `<${node.tag}${attrs} />`
}

function extractStaticPropsFromContent(
  children: TemplateChildNode[],
): Record<string, unknown> {
  const props: Record<string, unknown> = {}

  for (const child of children) {
    if (child.type === 1) {
      const element = child as ElementNode
      for (const prop of element.props) {
        if (prop.type === 6) {
          const attr = prop as AttributeNode
          if (attr.value) {
            props[attr.name] = attr.value.content
          }
          else {
            // Boolean prop
            props[attr.name] = true
          }
        }
      }
    }
  }

  return props
}

/**
 * `:tags` must be an array of string literals: the indexer needs the tags
 * without running the story file.
 */
function parseTags(value: string): string[] {
  let elements: Node[] | undefined
  try {
    const statement = babelParse(`(${value})`).program.body[0]
    if (statement?.type === 'ExpressionStatement' && statement.expression.type === 'ArrayExpression')
      elements = statement.expression.elements as Node[]
  }
  catch {}
  if (!elements || !elements.every(element => element?.type === 'StringLiteral'))
    throw new Error(`<Meta :tags="${value}">: tags must be an array of strings, like :tags="['autodocs']"`)
  return elements.map(element => (element as StringLiteral).value)
}

/** Every story needs a name that gives a unique export name */
function checkStoryNames(stories: ParsedStoryResult[]): void {
  const seen = new Map<string, string>()
  for (const story of stories) {
    if (!story.name)
      throw new Error('Every <Story> needs a name')
    const exportName = toValidIdentifier(story.name)
    if (!exportName)
      throw new Error(`<Story name="${story.name}">: the name needs ASCII letters or digits for its export name`)
    const other = seen.get(exportName)
    if (other !== undefined)
      throw new Error(`<Story name="${story.name}"> and <Story name="${other}"> both export as ${exportName}`)
    // The base story must come first: the extends story spreads it
    if (story.extendsStory && !seen.has(toValidIdentifier(story.extendsStory)))
      throw new Error(`<Story name="${story.name}"> extends "${story.extendsStory}", which is not a story above it in this file`)
    seen.set(exportName, story.name)
  }
}
