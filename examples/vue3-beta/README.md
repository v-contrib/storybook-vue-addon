# Example: Storybook 11 beta + Vite

The same stories as [`examples/vue3-vite`](../vue3-vite), on the Storybook 11 beta (`storybook@next`), to try the addon against the upcoming major version:

- `src/ButtonVue.stories.vue`: static stories (attributes become args) and an args story
- `src/Button.stories.ts`: the same Button as a regular CSF story
- `src/Card.stories.vue`: named, default and scoped slots, components and variables from `<script setup>`

Run it from the repository root, which builds the addon first:

```sh
npm install
npm run example:beta         # Storybook dev server on http://localhost:6007
npm run example:beta:build   # static build in examples/vue3-beta/storybook-static
```
