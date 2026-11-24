<script setup lang="ts">
import { useRoute } from 'vue-router'

withDefaults(defineProps<{
  /** Name shown before the links */
  brand?: string
}>(), {
  brand: 'Acme',
})

// Composition API access to the story's router
const route = useRoute()
</script>

<template>
  <div class="app-nav">
    <nav class="app-nav__bar">
      <strong>{{ brand }}</strong>
      <RouterLink to="/">
        Home
      </RouterLink>
      <RouterLink to="/about">
        About
      </RouterLink>
      <RouterLink to="/docs/intro">
        Docs
      </RouterLink>
      <code class="app-nav__path">{{ route.fullPath }}</code>
    </nav>
    <main class="app-nav__page">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-nav {
  font-family: 'Nunito Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
}
.app-nav__bar {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid #ddd;
}
.app-nav__bar a.router-link-exact-active {
  font-weight: bold;
}
.app-nav__path {
  margin-left: auto;
  color: #666;
}
.app-nav__page {
  padding: 12px;
}
</style>
