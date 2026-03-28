import type { Plugin, ResolvedConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { generateCSF } from './codegen'
import { parseStoriesVue } from './parse'

export interface VueStoriesPluginOptions {
  /**
   * File extension pattern to match
   * @default /\.stories\.vue$/
   */
  include?: RegExp
}

export function vueStoriesPlugin(options: VueStoriesPluginOptions = {}): Plugin {
  const { include = /\.svue$/ } = options

  return {
    name: 'vite-plugin-vue-stories',

    // enforce: 'pre' ensures we run before most plugins
    enforce: 'pre',

    // Use the load hook to provide transformed content
    // This runs before transform and can replace file contents entirely
    load(id: string) {
      // Handle query strings (HMR, etc.) - check the clean path
      const cleanId = id.split('?')[0]
      if (!include.test(cleanId)) {
        return null
      }

      try {
        // Read and transform the file
        const code = readFileSync(cleanId, 'utf-8')
        const parsed = parseStoriesVue(code)
        const generated = generateCSF(parsed)

        return {
          code: generated,
          map: null,
        }
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.error(`Failed to transform ${id}: ${message}`)
      }
    },
  }
}

export default vueStoriesPlugin
