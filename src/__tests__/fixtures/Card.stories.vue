<script setup lang="ts">
import Badge from './Badge.vue'
import Card from './Card.vue'

const note: string = 'typed note'
const tags: string[] = ['a', 'b']
</script>

<template>
  <Meta title="Fixtures/Card" :component="Card" />

  <Story name="Static Slots">
    <Card title="Static title" elevated>
      <template #header>
        <strong>Header slot</strong>
        <Badge text="new" />
      </template>
      <p>Body {{ note }}</p>
      <ul>
        <li v-for="tag in tags" :key="tag">
          {{ tag }}
        </li>
      </ul>
      <template #footer="{ year }">
        Footer {{ year }}
      </template>
    </Card>
  </Story>

  <Story name="Args Slots" :args="{ title: 'From args', elevated: false }">
    <template #default="{ args }">
      <Card v-bind="args">
        <template #header>
          Header for {{ args.title }}
        </template>
        <p v-if="args.elevated" class="raised">
          Raised
        </p>
        Body
      </Card>
    </template>
  </Story>

  <Story name="Multiple Roots">
    <Card title="One" />
    <Card title="Two" />
  </Story>

  <Story name="Simple">
    <Card title="Plain" />
  </Story>
</template>

<style>
.badge { color: red; }
</style>
