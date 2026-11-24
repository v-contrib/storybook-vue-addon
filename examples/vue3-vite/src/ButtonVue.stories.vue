<script setup lang="ts">
import { fn } from 'storybook/test'
import Button from './Button.vue'

const argTypes = {
  size: {
    control: 'select',
    options: ['small', 'medium', 'large'],
  },
  backgroundColor: { control: 'color' },
}

const defaultArgs = {
  primary: false,
  onClick: fn(),
}
</script>

<template>
  <Meta
    title="Example/ButtonVue"
    :component="Button"
    :arg-types="argTypes"
    :args="defaultArgs"
    :tags="['autodocs']"
  />

  <!-- Static story - props become args -->
  <Story name="Primary">
    <Button label="Button" primary />
  </Story>

  <!-- Interactive story with Controls -->
  <Story name="Secondary" :args="{ primary: false, label: 'Button' }">
    <template #default="{ args }">
      <Button v-bind="args" />
    </template>
  </Story>

  <!-- Size variants -->
  <Story name="Large" :args="{ label: 'Button', size: 'large' }">
    <template #default="{ args }">
      <Button v-bind="args" />
    </template>
  </Story>

  <Story name="Small" :args="{ label: 'Button', size: 'small' }">
    <template #default="{ args }">
      <Button v-bind="args" />
    </template>
  </Story>
</template>
