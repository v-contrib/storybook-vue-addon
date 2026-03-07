import type { Plugin } from 'vite'
import type { TransformResult } from './types'
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
  const { include = /\.stories\.vue$/ } = options

  return {
    name: 'vite-plugin-vue-stories',

    enforce: 'pre',

    async transform(code: string, id: string): Promise<TransformResult | undefined> {
      if (!include.test(id)) {
        return undefined
      }

      try {
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
