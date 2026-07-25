import process from 'node:process'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // VUE_ROUTER=4 runs the tests against vue-router 4 (dev dependency vue-router-4)
  resolve: {
    alias: process.env.VUE_ROUTER === '4'
      ? { 'vue-router': 'vue-router-4' }
      : {},
  },
  test: {
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
  },
})
