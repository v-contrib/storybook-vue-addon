<script setup lang="ts">
defineProps<{ title?: string, elevated?: boolean }>()
</script>

<template>
  <article :class="elevated ? 'card elevated' : 'card'">
    <header>
      <slot name="header">
        {{ title }}
      </slot>
    </header>
    <section><slot /></section>
    <footer><slot name="footer" :year="2026" /></footer>
  </article>
</template>
