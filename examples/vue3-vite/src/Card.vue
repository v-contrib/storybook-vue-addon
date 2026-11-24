<script setup lang="ts">
withDefaults(defineProps<{
  /** Shown in the header when no header slot is given */
  title?: string
  /** Adds a shadow */
  elevated?: boolean
}>(), {
  title: '',
  elevated: false,
})

defineSlots<{
  header?: () => any
  default?: () => any
  footer?: (props: { year: number }) => any
}>()
</script>

<template>
  <article class="storybook-card" :class="{ 'storybook-card--elevated': elevated }">
    <header class="storybook-card__header">
      <slot name="header">
        {{ title }}
      </slot>
    </header>
    <section class="storybook-card__body">
      <slot />
    </section>
    <footer class="storybook-card__footer">
      <slot name="footer" :year="new Date().getFullYear()" />
    </footer>
  </article>
</template>

<style>
.storybook-card {
  font-family: 'Nunito Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  max-width: 320px;
  overflow: hidden;
}
.storybook-card--elevated {
  box-shadow: 0 4px 12px rgb(0 0 0 / 15%);
}
.storybook-card__header {
  padding: 12px 16px;
  font-weight: 700;
  border-bottom: 1px solid #e5e7eb;
}
.storybook-card__body {
  padding: 16px;
}
.storybook-card__footer {
  padding: 8px 16px;
  font-size: 12px;
  color: #6b7280;
}
</style>
