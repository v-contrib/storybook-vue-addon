<script setup lang="ts">
import AppNav from './AppNav.vue'
import { routes } from './routes'

const argTypes = {
  page: {
    control: 'select',
    options: ['intro', 'api', 'faq'],
  },
}
</script>

<template>
  <!-- Every story gets its own router with these routes -->
  <Meta title="Example/AppNav" :component="AppNav" :router="{ routes }" :tags="['autodocs']" />

  <Story name="Home">
    <AppNav brand="Acme" />
  </Story>

  <!-- Story router options override the meta ones -->
  <Story name="About Page" :router="{ initialRoute: '/about' }">
    <AppNav brand="Acme" />
  </Story>

  <!-- The route follows the page arg (try it in Controls) -->
  <Story
    name="Docs From Args"
    :args="{ page: 'intro' }"
    :arg-types="argTypes"
    :router="{ initialRoute: (args) => `/docs/${args.page}` }"
  >
    <template #default>
      <AppNav brand="Acme docs" />
    </template>
  </Story>
</template>
