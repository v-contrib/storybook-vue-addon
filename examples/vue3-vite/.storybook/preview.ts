import addonDocs from '@storybook/addon-docs'
import { definePreview } from '@storybook/vue3-vite'

export default definePreview({
  addons: [
    addonDocs(),
  ],
})
