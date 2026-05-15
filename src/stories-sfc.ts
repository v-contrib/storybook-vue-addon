import type { ParsedResult, ParsedStoryResult, SfcBlock } from './parse'
import { toValidIdentifier } from './identifier'
import { ROOT_COMPONENT } from './story-content'

/**
 * The stories component of `Foo.stories.vue` is the virtual module
 * `Foo.stories.vue.__stories__.vue`, compiled by @vitejs/plugin-vue.
 */
export const STORIES_SFC_SUFFIX = '.__stories__.vue'

/** Prop that selects which story the stories component renders */
export const STORY_PROP = 'vueCsfStory'

/** Prop with the slots set from Controls, as slot functions */
export const SLOTS_PROP = 'vueCsfSlots'

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
  const componentRef = parsed.meta.componentRef
  // The meta component at a story's root: its slots from the template, with
  // slots set from Controls on top (like Storybook's own Vue render)
  const root = componentRef
    ? `import { h as __vueCsfH } from 'vue'
const ${ROOT_COMPONENT} = Object.assign(
  (_props, { attrs, slots }) => __vueCsfH(${componentRef}, attrs, {
    ...Object.fromEntries(Object.entries(slots).filter(([name]) => name !== '_')),
    ...__vueCsfProps.${SLOTS_PROP},
  }),
  { inheritAttrs: false },
)
`
    : ''
  parts.push(block('script', {
    attrs: setup.attrs,
    content: `${setup.content}\nconst __vueCsfProps = defineProps(['args', '${STORY_PROP}', '${SLOTS_PROP}'])\n${root}`,
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
