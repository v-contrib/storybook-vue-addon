import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'preset': 'src/preset.ts',
    'vite-plugin': 'src/vite-plugin.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  external: ['vue', 'vite', 'storybook', '@vue/compiler-sfc'],
  treeshake: true,
})
