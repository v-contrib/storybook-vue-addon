import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'preset': 'src/preset.ts',
    'vite-plugin': 'src/vite-plugin.ts',
    // Storybook 11 loads it in its docgen worker thread (see preset.ts)
    'docgen-worker': 'src/docgen-worker.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  external: ['vue', 'vite', 'storybook', '@vue/compiler-sfc'],
  treeshake: true,
})
