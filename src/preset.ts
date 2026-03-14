import { vueStoriesPlugin } from './vite-plugin'

export function viteFinal(config: any): any {
  config.plugins = config.plugins || []
  config.plugins.push(vueStoriesPlugin())
  return config
}

export const previewAnnotations: string[] = []

export const managerEntries: string[] = []
