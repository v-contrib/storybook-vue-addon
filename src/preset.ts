import { readFileSync } from 'node:fs'
import { parseStoriesVue } from './parse'
import { vueStoriesPlugin } from './vite-plugin'

export function viteFinal(config: any): any {
  config.plugins = config.plugins || []

  // Add our plugin first
  config.plugins.unshift(vueStoriesPlugin())

  // Configure vue plugin to exclude .stories.vue files
  // This needs to be done via the options passed to vite config
  // We can add our own vue() call with exclude pattern that will merge
  // For now, we'll just add our plugin and rely on enforce: 'pre' + transform order

  return config
}

export const previewAnnotations: string[] = []

export const managerEntries: string[] = []

// Storybook indexer for .svue files (story vue)
// In Storybook, experimental_indexers must be an async function returning Promise<Indexer[]>
export async function experimental_indexers(existingIndexers: any[] = []): Promise<any[]> {
  return [
    {
      test: /\.svue$/,
      createIndex: async (fileName: string, _options: any) => {
        const code = readFileSync(fileName, 'utf-8')
        const parsed = parseStoriesVue(code)

        return parsed.stories.map((story) => {
          // Convert story name to valid identifier for exportName
          const exportName = story.name
            .replace(/[^a-z0-9]/gi, ' ')
            .split(' ')
            .filter(Boolean)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('')

          return {
            exportName,
            name: story.name,
            title: parsed.meta.title,
            type: 'story' as const,
            tags: parsed.meta.tags || [],
            importPath: fileName,
          }
        })
      },
    },
    ...existingIndexers,
  ]
}
