<script setup lang="ts">
// ref and Pill are not imported: unplugin-auto-import and unplugin-vue-components provide them
const count = ref(3)
</script>

<template>
  <Meta title="Fixtures/Macros" />

  <Story name="Auto Imported">
    <Pill :label="`count ${count}`">
      <template #suffix="{ mark }">
        {{ mark }}
      </template>
    </Pill>
  </Story>
</template>
