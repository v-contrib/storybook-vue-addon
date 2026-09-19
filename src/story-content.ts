import type {
  AttributeNode,
  DirectiveNode,
  ElementNode,
  SimpleExpressionNode,
  TemplateChildNode,
} from '@vue/compiler-core'

/**
 * Piece of a story's docs snippet. Placeholders are filled from the current
 * args when Storybook shows the snippet.
 */
export type SourcePart
  = | { kind: 'text', text: string }
    /** `v-bind="args"`: every arg as an attribute */
    | { kind: 'attrs' }
    /** `:name="args.path"` */
    | { kind: 'attr', name: string, path: string }
    /** `{{ args.path }}` */
    | { kind: 'interp', path: string }

export interface StoryContent {
  /**
   * Only the meta component, without children, with static attributes or
   * `v-bind="args"`. Rendered as `h(Component, args)` with Storybook's own snippet.
   */
  simple: boolean
  /** Template for the compiled stories component; `args` is a prop there */
  template: string
  /** Docs snippet of the template, with placeholders for bound args */
  sourceParts: SourcePart[]
  /** The story content as written, dedented (`docs.source.originalSource`) */
  originalSource: string
  /** Tag of the root element of a simple story, as written */
  tag?: string
  /**
   * Static attributes of the root element when it is the meta component in a
   * static or simple story. They become the story's args (`:args` on top); in
   * a static story the template binds them.
   */
  rootArgs?: Record<string, unknown>
}

/**
 * Tag the meta component gets at the root of a compiled story. The stories
 * component defines it as a wrapper that adds slots set from Controls.
 */
export const ROOT_COMPONENT = 'VueCsfRoot'

const NODE_ELEMENT = 1
const NODE_TEXT = 2
const NODE_COMMENT = 3
const NODE_INTERPOLATION = 5
const PROP_ATTRIBUTE = 6
const PROP_DIRECTIVE = 7

/** `args`, `args.label`, `args.items[0]` */
const ARGS_PATH = /^args(?:\.[A-Z_$][\w$]*|\[\d+\])*$/i

interface Edit {
  start: number
  end: number
  text: string
  part?: SourcePart
}

function isElement(node: TemplateChildNode): node is ElementNode {
  return node.type === NODE_ELEMENT
}

/** Comments and whitespace-only text don't count as content */
function isSignificant(node: TemplateChildNode): boolean {
  if (node.type === NODE_COMMENT)
    return false
  if (node.type === NODE_TEXT)
    return node.content.trim() !== ''
  return true
}

function kebabCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function isComponentTag(tag: string, componentRef?: string): boolean {
  return !!componentRef && (tag === componentRef || tag === kebabCase(componentRef))
}

function expressionOf(dir: DirectiveNode): string | undefined {
  return dir.exp?.type === 4
    ? (dir.exp as SimpleExpressionNode).content.trim()
    : undefined
}

function staticArgName(dir: DirectiveNode): string | undefined {
  if (dir.arg?.type !== 4)
    return undefined
  const arg = dir.arg as SimpleExpressionNode
  return arg.isStatic ? arg.content : undefined
}

function isBindAllArgs(prop: ElementNode['props'][number]): boolean {
  return prop.type === PROP_DIRECTIVE
    && prop.name === 'bind'
    && !prop.arg
    && expressionOf(prop) === 'args'
}

/** Start of a prop including the whitespace before it, so removing it leaves no gap */
function startWithLeadingSpace(source: string, offset: number): number {
  let start = offset
  while (start > 0 && /\s/.test(source[start - 1]))
    start--
  return start
}

/**
 * The `<template #default="{ args }">` child of a `<Story>`, if any.
 */
export function findArgsSlot(story: ElementNode): ElementNode | undefined {
  return story.children.find(
    (child): child is ElementNode =>
      isElement(child)
      && child.tag === 'template'
      && child.props.some(
        p => p.type === PROP_DIRECTIVE
          && p.name === 'slot'
          && staticArgName(p) === 'default',
      ),
  )
}

/**
 * Analyse the content of a `<Story>` from the raw (untransformed) template AST.
 * Returns undefined when the story has no content.
 */
export function analyzeStoryContent(
  story: ElementNode,
  source: string,
  componentRef?: string,
): StoryContent | undefined {
  const argsSlot = findArgsSlot(story)
  const nodes = (argsSlot ? argsSlot.children : story.children).filter(isSignificant)
  if (nodes.length === 0)
    return undefined

  const start = nodes[0].loc.start.offset
  const end = nodes.at(-1)!.loc.end.offset
  const root = nodes.length === 1 && isElement(nodes[0])
    ? nodes[0]
    : undefined
  const rootIsComponent = !!root && isComponentTag(root.tag, componentRef)

  const simple = rootIsComponent
    && root!.children.every(child => !isSignificant(child))
    && root!.props.every(p => p.type === PROP_ATTRIBUTE || isBindAllArgs(p))

  const templateEdits: Edit[] = []
  const sourceEdits: Edit[] = []
  let rootArgs: Record<string, unknown> | undefined

  // Static story whose root is the meta component: its attributes become args
  if (!argsSlot && rootIsComponent && !simple) {
    rootArgs = {}
    for (const prop of root!.props) {
      if (prop.type !== PROP_ATTRIBUTE)
        continue
      const attr = prop as AttributeNode
      rootArgs[attr.name] = attr.value ? attr.value.content : true
      const edit = {
        start: startWithLeadingSpace(source, attr.loc.start.offset),
        end: attr.loc.end.offset,
        text: '',
      }
      templateEdits.push(edit)
      sourceEdits.push({ ...edit })
    }
    const afterTag = root!.loc.start.offset + 1 + root!.tag.length
    templateEdits.push({ start: afterTag, end: afterTag, text: ' v-bind="args"' })
    sourceEdits.push({
      start: afterTag,
      end: afterTag,
      text: '',
      part: { kind: 'attrs' },
    })
  }
  // A simple story renders the component from args: its attributes are args
  else if (simple) {
    rootArgs = {}
    for (const prop of root!.props) {
      if (prop.type === PROP_ATTRIBUTE)
        rootArgs[prop.name] = prop.value ? prop.value.content : true
    }
  }

  // The meta component at the root renders through the wrapper (template only;
  // the docs snippet keeps the real tag)
  for (const node of nodes) {
    if (!isElement(node) || !isComponentTag(node.tag, componentRef))
      continue
    const open = node.loc.start.offset + 1
    templateEdits.push({ start: open, end: open + node.tag.length, text: ROOT_COMPONENT })
    const close = source.lastIndexOf(`</${node.tag}`, node.loc.end.offset)
    if (close > node.loc.start.offset)
      templateEdits.push({ start: close + 2, end: close + 2 + node.tag.length, text: ROOT_COMPONENT })
  }

  // Docs snippet placeholders for args bindings anywhere in the content
  const visit = (node: TemplateChildNode): void => {
    if (node.type === NODE_INTERPOLATION) {
      const exp = node.content.type === 4
        ? (node.content as SimpleExpressionNode).content.trim()
        : ''
      if (ARGS_PATH.test(exp)) {
        sourceEdits.push({
          start: node.loc.start.offset,
          end: node.loc.end.offset,
          text: '',
          part: { kind: 'interp', path: exp },
        })
      }
      return
    }
    if (!isElement(node))
      return
    for (const prop of node.props) {
      if (prop.type !== PROP_DIRECTIVE || prop.name !== 'bind')
        continue
      const exp = expressionOf(prop)
      const name = staticArgName(prop)
      const at = {
        start: startWithLeadingSpace(source, prop.loc.start.offset),
        end: prop.loc.end.offset,
        text: '',
      }
      if (!prop.arg && exp === 'args') {
        sourceEdits.push({
          ...at,
          part: { kind: 'attrs' },
        })
      }
      else if (name && exp && ARGS_PATH.test(exp)) {
        sourceEdits.push({
          ...at,
          part: { kind: 'attr', name, path: exp },
        })
      }
    }
    node.children.forEach(visit)
  }
  nodes.forEach(visit)

  // Keep the original indentation of the first line, so the snippet can be dedented
  const indent = ' '.repeat(nodes[0].loc.start.column - 1)

  return {
    simple,
    template: applyEdits(source, start, end, templateEdits),
    sourceParts: toSourceParts(source, start, end, sourceEdits, indent),
    originalSource: dedent(indent + source.slice(start, end)),
    tag: simple ? root!.tag : undefined,
    rootArgs,
  }
}

/** Remove the common indentation of the non-empty lines, and trim */
export function dedent(code: string): string {
  const lines = code.split('\n')
  const indents = lines.filter(line => line.trim()).map(line => line.match(/^ */)![0].length)
  const min = indents.length
    ? Math.min(...indents)
    : 0
  return lines.map(line => line.slice(min)).join('\n').trim()
}

/** By position; an insertion sorts before a removal starting at the same offset */
function sortEdits(edits: Edit[]): Edit[] {
  return [...edits].sort((a, b) => a.start - b.start || a.end - b.end)
}

function applyEdits(source: string, start: number, end: number, edits: Edit[]): string {
  let out = ''
  let pos = start
  for (const edit of sortEdits(edits)) {
    out += source.slice(pos, edit.start) + edit.text
    pos = edit.end
  }
  return out + source.slice(pos, end)
}

function toSourceParts(source: string, start: number, end: number, edits: Edit[], indent: string): SourcePart[] {
  const parts: SourcePart[] = []
  const text = (value: string): void => {
    if (!value)
      return
    const last = parts.at(-1)
    if (last?.kind === 'text')
      last.text += value
    else
      parts.push({ kind: 'text', text: value })
  }

  text(indent)
  let pos = start
  for (const edit of sortEdits(edits)) {
    text(source.slice(pos, edit.start))
    text(edit.text)
    if (edit.part)
      parts.push(edit.part)
    pos = edit.end
  }
  text(source.slice(pos, end))
  return parts
}
