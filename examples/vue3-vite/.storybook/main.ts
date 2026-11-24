import { defineMain } from '@storybook/vue3-vite/node'

export default defineMain({
  stories: [
    '../src/**/*.stories.ts',
    '../src/**/*.stories.vue',
  ],
  addons: [
    '@storybook/addon-docs',
    '@v-contrib/storybook-vue-addon',
  ],
  framework: '@storybook/vue3-vite',
})
