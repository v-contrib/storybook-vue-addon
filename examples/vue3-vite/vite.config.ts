import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
  ],
  resolve: {
    // The addon comes from the repository root (file:../..), which has its
    // own vue-router; use this example's copy everywhere, as an app would
    dedupe: ['vue', 'vue-router'],
  },
})
