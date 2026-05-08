import type { ParsedResult, ParsedStoryResult, SfcBlock } from './parse'
import { toValidIdentifier } from './identifier'

/**
 * The stories component of `Foo.stories.vue` is the virtual module
 * `Foo.stories.vue.__stories__.vue`, compiled by @vitejs/plugin-vue.
 */
export const STORIES_SFC_SUFFIX = '.__stories__.vue'

/** Prop that selects which story the stories component renders */
export const STORY_PROP = 'vueCsfStory'

/**
 * Stories rendered by the stories component: those with content beyond the
 * meta component with attributes.
 */
export function needsStoriesSfc(story: ParsedStoryResult): boolean {
  return !!story.content && !story.content.simple
}

function attrsToString(attrs: Record<string, string | true>): string {
  return Object.entries(attrs)
    .map(([name, value]) => value === true
      ? ` ${name}`
      : ` ${name}="${value}"`)
    .join('')
}

function block(tag: string, b: SfcBlock): string {
  return `<${tag}${attrsToString(b.attrs)}>${b.content}</${tag}>`
}

/**
 * Build the SFC source of the stories component: the file's own `<script setup>`
 * (so story templates see its imports and variables), `args` and the story
 * selector as props, one template branch per story, and the file's styles.
 * Returns null when no story needs it.
 */
export function buildStoriesSfc(parsed: ParsedResult): string | null {
  const stories = parsed.stories.filter(needsStoriesSfc)
  if (stories.length === 0)
    return null

  const blocks = parsed.blocks ?? { styles: [] }
  const parts: string[] = []

  if (blocks.script)
    parts.push(block('script', blocks.script))

  const setup: SfcBlock = blocks.scriptSetup ?? {
    content: '',
    attrs: { setup: true },
  }
  parts.push(block('script', {
    attrs: setup.attrs,
    content: `${setup.content}\ndefineProps(['args', '${STORY_PROP}'])\n`,
  }))

  const branches = stories.map((story, i) => {
    const directive = i === 0
      ? 'v-if'
      : 'v-else-if'
    const name = toValidIdentifier(story.name)
    return `<template ${directive}="${STORY_PROP} === '${name}'">\n${story.content!.template}\n</template>`
  })
  parts.push(`<template>\n${branches.join('\n')}\n</template>`)

  for (const style of blocks.styles)
    parts.push(block('style', style))

  return `${parts.join('\n\n')}\n`
}
