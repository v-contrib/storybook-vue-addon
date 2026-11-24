# Example: Storybook 10 + Vite

Vue 3 stories written as `.stories.vue` files, next to a regular CSF story for comparison:

- `src/ButtonVue.stories.vue`: static stories (attributes become args) and an args story
- `src/Button.stories.ts`: the same Button as a regular CSF story
- `src/Card.stories.vue`: named, default and scoped slots, components and variables from `<script setup>`

Run it from the repository root, which builds the addon first:

```sh
npm install
npm run example:vite         # Storybook dev server on http://localhost:6006
npm run example:vite:build   # static build in examples/vue3-vite/storybook-static
```
