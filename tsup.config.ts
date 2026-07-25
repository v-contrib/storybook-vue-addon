import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'preset': 'src/preset.ts',
    'vite-plugin': 'src/vite-plugin.ts',
    // Storybook 11 loads it in its docgen worker thread (see preset.ts)
    'docgen-worker': 'src/docgen-worker.ts',
    // Router helper; the only entry that imports vue-router
    'router': 'src/router.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  external: [
    'vue',
    'vue-router',
    'vite',
    'storybook',
    /^storybook\//,
    '@vue/compiler-sfc',
  ],
  treeshake: true,
})
