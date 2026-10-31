import type { Plugin } from 'vite'
import type { ParsedResult } from './parse'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { transformWithOxc } from 'vite'
import { generateCSF } from './codegen'
import { parseStoriesVue } from './parse'
import { buildStoriesSfc, STORIES_SFC_SUFFIX } from './stories-sfc'
import { STORY_FILE_PATTERN } from './story-file'

export { STORY_FILE_PATTERN }

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

/** Script language that needs transpiling, or undefined for plain JS */
function scriptLang(parsed: ParsedResult): 'ts' | 'tsx' | 'jsx' | undefined {
  const lang = parsed.blocks?.scriptSetup?.attrs.lang ?? parsed.blocks?.script?.attrs.lang
  return lang === 'ts' || lang === 'tsx' || lang === 'jsx'
    ? lang
    : undefined
}

export function vueStoriesPlugin(options: VueStoriesPluginOptions = {}): Plugin {
  const { include = STORY_FILE_PATTERN } = options
  const isStory = (id: string): boolean => include.test(cleanPath(id))
  /** Story file behind a stories component id, or undefined */
  const storyFileOf = (id: string): string | undefined => {
    const file = cleanPath(id)
    if (!file.endsWith(STORIES_SFC_SUFFIX))
      return undefined
    const storyFile = file.slice(0, -STORIES_SFC_SUFFIX.length)
    return include.test(storyFile)
      ? storyFile
      : undefined
  }
  let root = process.cwd()

  return {
    name: 'vite-plugin-vue-stories',

    // Run before @vitejs/plugin-vue and the other .vue transforms
    enforce: 'pre',

    configResolved(config) {
      root = config.root
      // Docgen plugins must skip story files and their stories components (no file on disk)
      const skipForDocgen = (id: string): boolean => isStory(id) || !!storyFileOf(id)

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
          skipStoryFiles(plugin, skipForDocgen)
        }
      }
    },

    // `./Foo.stories.vue.__stories__.vue` is virtual: it has no file on disk
    // Keeps the query: plugin-vue's `?vue&type=style…` sub-requests must reach it
    resolveId(id, importer) {
      if (!storyFileOf(id))
        return null
      const file = cleanPath(id)
      const query = id.slice(file.length)
      if (importer && file.startsWith('.'))
        return resolve(dirname(cleanPath(importer)), file) + query
      if (existsSync(storyFileOf(file)!))
        return file + query
      // Root-relative URL requested by the browser in dev
      const fromRoot = join(root, file)
      return existsSync(storyFileOf(fromRoot)!)
        ? fromRoot + query
        : null
    },

    load(id) {
      const storyFile = storyFileOf(id)
      // `?vue&type=style…` sub-requests are served by plugin-vue
      if (!storyFile || /[?&]vue\b/.test(id))
        return null

      this.addWatchFile(storyFile)
      const sfc = buildStoriesSfc(parseStoriesVue(readFileSync(storyFile, 'utf-8')))
      if (!sfc)
        this.error(`${storyFile} has no stories with content to compile`)
      return sfc
    },

    // A story file change must also update its stories component
    hotUpdate({ file, modules }) {
      if (!include.test(file))
        return
      const storiesModule = this.environment.moduleGraph.getModuleById(file + STORIES_SFC_SUFFIX)
      if (!storiesModule)
        return
      this.environment.moduleGraph.invalidateModule(storiesModule)
      return [...modules, storiesModule]
    },

    async transform(code, id) {
      const [file, query = ''] = id.split('?', 2)
      // `?vue&type=…` ids are plugin-vue sub-requests, not story modules
      if (!include.test(file) || /(?:^|&)vue\b/.test(query))
        return null

      try {
        const parsed = parseStoriesVue(code)
        const csf = generateCSF(parsed, {
          storiesImport: `./${basename(file)}${STORIES_SFC_SUFFIX}`,
        })
        const lang = scriptLang(parsed)
        if (!lang)
          return { code: csf, map: null }

        // The CSF module carries the file's script code; JSX uses Vue's runtime
        const result = await transformWithOxc(csf, `${file}.${lang}`, {
          lang,
          jsx: { runtime: 'automatic', importSource: 'vue' },
        })
        return { code: result.code, map: null }
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
