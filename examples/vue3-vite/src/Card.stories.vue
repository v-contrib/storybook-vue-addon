<script setup lang="ts">
import Button from './Button.vue'
import Card from './Card.vue'

const features: string[] = ['Named slots', 'Scoped slots', 'Any markup']
</script>

<template>
  <Meta
    title="Example/Card"
    :component="Card"
    :tags="['autodocs']"
  />

  <!-- Static story: the root attributes become args, so Controls work -->
  <Story name="With Slots">
    <Card title="Card title" elevated>
      <template #header>
        Slots in a .stories.vue file
      </template>
      <ul>
        <li v-for="feature in features" :key="feature">
          {{ feature }}
        </li>
      </ul>
      <template #footer="{ year }">
        © {{ year }} <Button label="Read more" size="small" />
      </template>
    </Card>
  </Story>

  <!-- Args story: args can be used inside slot content -->
  <Story name="Playground" :args="{ title: 'Playground', elevated: false }">
    <template #default="{ args }">
      <Card v-bind="args">
        <template #header>
          {{ args.title }}
        </template>
        <p v-if="args.elevated">
          This card is elevated.
        </p>
        <p v-else>
          Turn on "elevated" in Controls.
        </p>
      </Card>
    </template>
  </Story>

  <!-- No slot content: rendered from args, like a .stories.ts story -->
  <Story name="Title Only">
    <Card title="Just a title" />
  </Story>
</template>
