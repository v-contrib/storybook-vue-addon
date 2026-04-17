import type { Plugin } from 'vite'
import { generateCSF } from './codegen'
import { parseStoriesVue } from './parse'

/**
 * Story files handled by default: `*.stories.vue` and `*.svue`.
 */
export const STORY_FILE_PATTERN = /\.(?:stories\.vue|svue)$/

export interface VueStoriesPluginOptions {
  /**
   * File pattern to match story files
   * @default /\.(?:stories\.vue|svue)$/
   */
  include?: RegExp
}

/**
 * Plugins that transform every `*.vue` id. A story file ending in `.vue` must
 * not reach them: by then it is CSF JavaScript, not a Vue SFC.
 */
const VUE_PLUGIN = 'vite:vue'
const VUE_DOCGEN_PLUGINS = [
  'storybook:vue-docgen-plugin',
  'storybook:vue-component-meta-plugin',
]

type TransformHandler = Extract<NonNullable<Plugin['transform']>, (...args: any[]) => any>

function cleanPath(id: string): string {
  return id.split('?', 1)[0]
}

function ensureArray<T>(value: T | readonly T[] | undefined | null): T[] {
  if (value == null)
    return []
  return Array.isArray(value)
    ? [...value]
    : [value as T]
}

/**
 * Wrap a plugin's transform hook so that it skips story files.
 */
function skipStoryFiles(plugin: Plugin, isStory: (id: string) => boolean): void {
  const transform = plugin.transform
  if (!transform)
    return

  const original: TransformHandler = typeof transform === 'function'
    ? transform
    : transform.handler
  const handler: TransformHandler = function (this: any, code, id, ...rest) {
    if (isStory(id))
      return null
    return original.call(this, code, id, ...rest)
  }

  plugin.transform = typeof transform === 'function'
    ? handler
    : { ...transform, handler }
}

export function vueStoriesPlugin(options: VueStoriesPluginOptions = {}): Plugin {
  const { include = STORY_FILE_PATTERN } = options
  const isStory = (id: string): boolean => include.test(cleanPath(id))

  return {
    name: 'vite-plugin-vue-stories',

    // Run before @vitejs/plugin-vue and the other .vue transforms
    enforce: 'pre',

    configResolved(config) {
      for (const plugin of config.plugins) {
        if (plugin.name === VUE_PLUGIN) {
          // Preferred: plugin-vue's own exclude option
          try {
            if (plugin.api && 'exclude' in plugin.api) {
              plugin.api.exclude = [
                ...ensureArray(plugin.api.exclude),
                include,
              ]
              continue
            }
          }
          catch {
            // The setter throws once plugin-vue's options hook has run
          }
          skipStoryFiles(plugin, isStory)
        }
        else if (VUE_DOCGEN_PLUGINS.includes(plugin.name)) {
          skipStoryFiles(plugin, isStory)
        }
      }
    },

    transform(code, id) {
      const [file, query = ''] = id.split('?', 2)
      // `?vue&type=…` ids are plugin-vue sub-requests, not story modules
      if (!include.test(file) || /(?:^|&)vue\b/.test(query))
        return null

      try {
        return {
          code: generateCSF(parseStoriesVue(code)),
          map: null,
        }
      }
      catch (error) {
        const message = error instanceof Error
          ? error.message
          : String(error)
        this.error(`Failed to transform ${id}: ${message}`)
      }
    },
  }
}

export default vueStoriesPlugin
