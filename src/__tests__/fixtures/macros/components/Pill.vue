<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <span class="pill">{{ label }}<slot name="suffix" mark="!" /></span>
</template>
