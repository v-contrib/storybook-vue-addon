import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { componentImportSource } from './docgen-worker'
import { toValidIdentifier } from './identifier'
import { parseStoriesVue } from './parse'
import { STORY_FILE_PATTERN, vueStoriesPlugin } from './vite-plugin'

export function viteFinal(config: any): any {
  config.plugins = config.plugins || []

  // Add our plugin first
  config.plugins.unshift(vueStoriesPlugin())

  // The plugin itself keeps @vitejs/plugin-vue and Storybook's docgen
  // plugins away from *.stories.vue files (see its configResolved hook)

  return config
}

export const previewAnnotations: string[] = []

export const managerEntries: string[] = []

// Storybook indexer for *.stories.vue and *.svue files
// In Storybook, experimental_indexers must be an async function returning Promise<Indexer[]>
export async function experimental_indexers(existingIndexers: any[] = []): Promise<any[]> {
  return [
    {
      test: STORY_FILE_PATTERN,
      createIndex: async (fileName: string, _options: any) => {
        const code = readFileSync(fileName, 'utf-8')
        const parsed = parseStoriesVue(code)
        // Storybook 11 records it as the entry's componentPath
        const rawComponentPath = componentImportSource(parsed)

        return parsed.stories.map((story) => {
          const exportName = toValidIdentifier(story.name)

          return {
            exportName,
            name: story.name,
            // Without a title, Storybook titles the file from its path
            title: parsed.meta.title,
            type: 'story' as const,
            tags: parsed.meta.tags || [],
            importPath: fileName,
            ...(rawComponentPath && { rawComponentPath }),
          }
        })
      },
    },
    ...existingIndexers,
  ]
}

/**
 * Storybook 11 (server-side docgen): lets the component docs provider see the
 * meta component of .stories.vue files (see docgen-worker.ts). It must come
 * after @storybook/vue3's provider so it runs first. Storybook 10 ignores it.
 */
export async function experimental_docgenProvider(existing: Array<{ moduleSpecifier: string }> = []): Promise<Array<{ moduleSpecifier: string }>> {
  return [
    ...existing,
    {
      moduleSpecifier: fileURLToPath(new URL('./docgen-worker.js', import.meta.url)),
    },
  ]
}
