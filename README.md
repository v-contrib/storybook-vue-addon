# @v-contrib/storybook-vue-addon

[![CI](https://github.com/v-contrib/storybook-vue-addon/actions/workflows/ci.yml/badge.svg)](https://github.com/v-contrib/storybook-vue-addon/actions/workflows/ci.yml)

Write Storybook stories as Vue Single File Components.

This addon turns `.stories.vue` (or `.svue`) files into Storybook CSF (Component Story Format), so you write stories with Vue templates and `<script setup>` instead of JavaScript objects.

## Features

- **Vue syntax**: stories are `<Meta>` and `<Story>` elements in a `<template>`, with `<script setup>` (TypeScript too) for imports and data
- **Any story content**: Vue compiles the story templates, so named and scoped slots, `v-if`/`v-for`, nested components and several root elements work
- **Args and Controls**: static attributes of the component become args; a `#default="{ args }"` slot gives the template the current args; slots can be set from Controls
- **All story annotations**: args, arg types, decorators, parameters, tags, play functions and extending another story
- **Docs**: autodocs, the props table, and code snippets ("Show code" and the Code panel) that show the story template with the current args filled in
- **Router helper**: give a story its own vue-router (4 or 5) with a `router` prop, including routes driven by args
- **Storybook 10 and 11**: including server-side component docs (Storybook 11, and Storybook 10.6+ with `features.experimentalDocgenServer`)

## Requirements

- Vue 3.5+
- Storybook 10 or 11, with the `@storybook/vue3-vite` framework
- Vite 8+
- `@vitejs/plugin-vue` 6+ in your Vite config (already there in a Vue + Vite project); it compiles story content
- `vue-router` 4 or 5, only for the router helper (optional)

## Installation

```bash
npm install @v-contrib/storybook-vue-addon
```

## Configuration

Add the addon and the story file globs to your Storybook configuration:

```typescript
// .storybook/main.ts
import type { StorybookConfig } from '@storybook/vue3-vite'

const config: StorybookConfig = {
  stories: [
    '../src/**/*.mdx',
    '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    '../src/**/*.stories.vue', // Vue SFC stories
    '../src/**/*.svue', // the same, short extension
  ],
  addons: [
    '@storybook/addon-docs',
    '@v-contrib/storybook-vue-addon',
  ],
  framework: '@storybook/vue3-vite',
}

export default config
```

The addon keeps `@vitejs/plugin-vue` and Storybook's Vue docgen away from story files, so they don't clash with your normal `.vue` components.

## Usage

A stories file has one `<Meta>`, which says where the stories go in the sidebar and which component they document, followed by a `<Story>` per variant. Anything you import or declare in `<script setup>` can be used in the stories and in the bound props of `<Meta>` and `<Story>`.

```vue
<!-- Card.stories.vue -->
<script setup lang="ts">
import Card from './Card.vue'

const items = ['a', 'b']
</script>

<template>
  <Meta title="Components/Card" :component="Card" />
  <Story name="Default">
    <Card title="Hello" />
  </Story>
  <Story name="WithList">
    <Card title="List">
      <li v-for="item in items" :key="item">
        {{ item }}
      </li>
    </Card>
  </Story>
</template>
```

`<Meta>` and `<Story>` take more props. A fuller example:

```vue
<!-- Button.stories.vue -->
<script setup lang="ts">
import { expect, fn, userEvent, within } from 'storybook/test'
import Button from './Button.vue'

const argTypes = {
  size: {
    control: 'select',
    options: ['small', 'medium', 'large'],
  },
  backgroundColor: { control: 'color' },
}

// Wraps every story; a decorator returns a component with a <story /> slot
const centered = () => ({ template: '<div style="padding: 2rem"><story /></div>' })
</script>

<template>
  <Meta
    title="Components/Button"
    :component="Button"
    :args="{ onClick: fn() }"
    :arg-types="argTypes"
    :decorators="[centered]"
    :parameters="{ layout: 'centered' }"
    :tags="['autodocs']"
  />

  <!-- The component's attributes become the story's args, so Controls work -->
  <Story name="Primary">
    <Button label="Button" primary />
  </Story>

  <!-- With #default="{ args }" the template gets the current args -->
  <Story name="Large" :args="{ label: 'Button', size: 'large' }">
    <template #default="{ args }">
      <Button v-bind="args" />
    </template>
  </Story>

  <!-- Another story's annotations, with some args changed -->
  <Story name="Small" extends="Large" :args="{ size: 'small' }" />

  <!-- A play function runs after the story renders (interaction tests) -->
  <Story
    name="Clicked"
    :args="{ label: 'Click me' }"
    :play="async ({ canvasElement, args }) => {
      await userEvent.click(within(canvasElement).getByRole('button'))
      await expect(args.onClick).toHaveBeenCalled()
    }"
  >
    <template #default="{ args }">
      <Button v-bind="args" />
    </template>
  </Story>
</template>
```

`<Story>` takes the same annotations as `<Meta>` (`args`, `arg-types`, `decorators`, `parameters`), and its values apply to that story only. With `autodocs` in the tags, Storybook adds a Docs page with the component's props table.

A story can contain anything a Vue template can: slot content, other components, data from `<script setup>`, `v-if`/`v-for` and several root elements. `args` can be used anywhere in the template, also inside slot content:

```vue
<!-- Card.stories.vue -->
<script setup lang="ts">
import Button from './Button.vue'
import Card from './Card.vue'

const features: string[] = ['Named slots', 'Scoped slots', 'Any markup']
</script>

<template>
  <Meta title="Components/Card" :component="Card" :tags="['autodocs']" />

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

  <Story name="Playground" :args="{ title: 'Playground', elevated: false }">
    <template #default="{ args }">
      <Card v-bind="args">
        <template #header>
          {{ args.title }}
        </template>
        <p v-if="args.elevated">
          This card is elevated.
        </p>
      </Card>
    </template>
  </Story>
</template>
```

Because `Card` is at the root of "With Slots", its `title` and `elevated` attributes are args and show up in Controls. The component's slots (`header`, `default`, `footer`) are listed in Controls too; a value set there replaces that slot's content. "Show code" on the Docs page and the Code panel show the story's template, with the current values filled in where it binds args: changing `title` in Controls updates the root component's attributes or `v-bind="args"`, and `{{ args.title }}`.

Components that use `<RouterLink>`, `<RouterView>`, `useRoute()` or `this.$route` need a router. The `router` prop gives each story its own one (install `vue-router` 4 or 5 in your project). On `<Meta>` it applies to all stories, and a story's `router` options override the meta ones. An `initialRoute` function gets the story's args, so the route follows Controls:

```vue
<!-- AppNav.stories.vue -->
<script setup lang="ts">
import AppNav from './AppNav.vue'
import { routes } from './routes'
</script>

<template>
  <Meta title="Components/AppNav" :component="AppNav" :router="{ routes }" />

  <Story name="Home">
    <AppNav />
  </Story>

  <Story name="About" :router="{ initialRoute: '/about' }">
    <AppNav />
  </Story>

  <Story
    name="Docs"
    :args="{ page: 'intro' }"
    :arg-types="{ page: { control: 'select', options: ['intro', 'api'] } }"
    :router="{ initialRoute: (args) => `/docs/${args.page}` }"
  >
    <AppNav />
  </Story>
</template>
```

Every story starts at its initial route with a fresh router and memory history, so routes, guards and history don't carry over between stories (also not between the stories on a Docs page), and the preview URL doesn't change. Navigations show up in the Actions panel as `router:navigate`. `router` without a value (`<Story name="X" router>`) uses the defaults: a catch-all route, so any link works. See [Router options](#router-options) for `beforeEach`, extra router options and turning logging off.

The router wraps the story's own decorators, so those can use it, but `<Meta>` decorators wrap the router. When a layout decorator on `<Meta>` needs the router, add the router yourself as the last `<Meta>` decorator instead of using the `router` prop; Storybook applies decorators in order, so the last one wraps the others:

```vue
<script setup lang="ts">
import { withRouter } from '@v-contrib/storybook-vue-addon/router'
import AppNav from './AppNav.vue'
import { withLayout } from './decorators'
import { routes } from './routes'
</script>

<template>
  <Meta title="Components/AppNav" :component="AppNav" :decorators="[withLayout, withRouter({ routes })]" />
</template>
```

All stories in that file then share these router options; don't also use the `router` prop there, or the stories get a second router inside the layout. `withRouter` is also how CSF stories (`*.stories.ts`) get a router:

```ts
import { withRouter } from '@v-contrib/storybook-vue-addon/router'

export default {
  component: AppNav,
  decorators: [
    withRouter({ routes, initialRoute: '/about' }),
  ],
}
```

Everything above works the same in files with the shorter `.svue` extension.

## Examples

Runnable Storybook projects in this repository that use the addon from source:

| Example                                    | Storybook | vue-router | Run                    | Build                        |
| ------------------------------------------ | --------- | ---------- | ---------------------- | ---------------------------- |
| [`examples/vue3-vite`](examples/vue3-vite) | 10        | 4          | `npm run example:vite` | `npm run example:vite:build` |
| [`examples/vue3-beta`](examples/vue3-beta) | 11 beta   | 5          | `npm run example:beta` | `npm run example:beta:build` |

Run the scripts from the repository root after `npm install`; they build the addon first.

## API Reference

### Meta

The first element of the template.

| Prop         | Type                         | Description                                                                                                                   |
| ------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `title`      | `string`                     | Static. The story's location in the sidebar (e.g. `"Components/Button"`); without it, Storybook titles the file from its path |
| `component`  | `Component`                  | The component being documented                                                                                                |
| `args`       | `Record<string, unknown>`    | Default args for all stories                                                                                                  |
| `arg-types`  | `Record<string, ArgType>`    | Controls configuration for args                                                                                               |
| `decorators` | `Decorator[]`                | Wrappers for all stories                                                                                                      |
| `parameters` | `Record<string, unknown>`    | Storybook parameters                                                                                                          |
| `tags`       | `string[]`                   | Tags, e.g. `['autodocs']`; an array of string literals                                                                        |
| `router`     | `RouterStoryOptions \| true` | A router for every story (see [Router options](#router-options))                                                              |

### Story

| Prop         | Type                         | Description                                                                                                                                         |
| ------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`       | `string`                     | **Required**, static. The story name in the sidebar                                                                                                 |
| `args`       | `Record<string, unknown>`    | Args of this story                                                                                                                                  |
| `arg-types`  | `Record<string, ArgType>`    | Controls configuration for this story                                                                                                               |
| `decorators` | `Decorator[]`                | Decorators of this story                                                                                                                            |
| `parameters` | `Record<string, unknown>`    | Parameters of this story                                                                                                                            |
| `play`       | `PlayFunction`               | Interaction test function                                                                                                                           |
| `tags`       | `string[]`                   | Tags of this story, combined with the meta tags; `'!test'` drops the meta's `test` tag for this story only. An array of string literals             |
| `extends`    | `string`                     | Name of an earlier story whose annotations this story starts from; its own `args` and `arg-types` are merged over them, its own `tags` replace them |
| `router`     | `RouterStoryOptions \| true` | A router for this story; its options are merged over the meta options (and those of the story it extends)                                           |

The story content is either the template itself, where the attributes of the `<Meta>` component at its root become args, or a `<template #default="{ args }">` that receives the current args. A story's `args` are merged over those attributes.

### Router options

`withRouter(...options)` from `@v-contrib/storybook-vue-addon/router` returns a decorator; several option objects are merged left to right. The `router` prop takes the same options.

| Option          | Default                                  | Description                                                                                                           |
| --------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `routes`        | one catch-all route that renders nothing | Routes of the story's router                                                                                          |
| `initialRoute`  | `'/'`                                    | Where the story starts: a path or route location, or a function of the story's args (the route then follows Controls) |
| `beforeEach`    |                                          | Global navigation guard                                                                                               |
| `routerOptions` |                                          | More `createRouter` options, e.g. `linkActiveClass`                                                                   |
| `logNavigation` | `true`                                   | Log navigations to the Actions panel as `router:navigate`                                                             |

## Migrating

### From [storybook-vue-addon](https://github.com/tobiasdiez/storybook-vue-addon)

| storybook-vue-addon                                                                  | This addon                                                                             |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `addons: ['storybook-vue-addon']`                                                    | `addons: ['@v-contrib/storybook-vue-addon']`                                           |
| `<Stories title :component>` around the stories                                      | A self-closing `<Meta title :component />`, stories after it                           |
| `<Story title="…">`                                                                  | `<Story name="…">`                                                                     |
| `<docs>` block with MDX                                                              | A Storybook MDX file                                                                   |
| `:component="resolveComponent('Card')"`                                              | `import Card from './Card.vue'` and `:component="Card"`                                |
| Story ids from the story title (`--withlist`)                                        | Story ids from the export name (`--with-list`)                                         |
| `v-model` on a `const`                                                               | `v-model` on a `ref`                                                                   |
| Stories are not tested                                                               | Stories run as tests with `@storybook/addon-vitest`, skip one with `:tags="['!test']"` |
| Excluding `.stories.vue` from `@vitejs/plugin-vue`, Vue Macros or the Vitest project | Remove the exclude                                                                     |

### From [storybook-vue3-router](https://github.com/NickMcBurney/storybook-vue3-router)

| storybook-vue3-router                                               | This addon                                                                              |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `vueRouter(routes, { initialRoute, beforeEach, vueRouterOptions })` | `withRouter({ routes, initialRoute, beforeEach, routerOptions })`, or the `router` prop |
| `asyncVueRouter(...)` with a `<Suspense>` decorator                 | `withRouter(...)`, the route view fills in when navigation finishes                     |
| `mockRouter({ meta, params, query })` with `path`/`name` args       | `initialRoute: args => ...`, a real router so `useRoute()` works                        |
| Route logging with `beforeEach` and `action()`                      | `logNavigation`, on by default                                                          |
| One router per app, hash history                                    | One router per story, memory history                                                    |

## Limitations and caveats

Story files:

- `title` on `<Meta>` and `name` on `<Story>` are static attributes (not `:title`), and `:tags` is an array of string literals.
- Props that `<Meta>` or `<Story>` does not know (see the [API Reference](#api-reference)) are reported as errors, so a typo like `:parameter` does not go unnoticed.
- Story names must be unique after conversion to an export name (`"Docs From Args"` becomes `DocsFromArgs`, `"1st try"` becomes `_1stTry`) and need at least one ASCII letter or digit. `extends` refers to a story by name, and that story must come earlier in the file.
- A plain `<script>` block may hold imports and code next to `<script setup>`, but no exports: every export of the generated module is a story.
- `args`, `vueCsfStory`, `vueCsfSlots`, `VueCsfRoot` and names starting with `__vueCsf` are reserved in `<script setup>`.
- `<script setup>` runs twice: once for the story metadata, once for the compiled story templates. Avoid side effects there.
- A story's content is either the `<Story>` children or one `<template #default="{ args }">` (also written `v-slot="{ args }"`), whose only slot prop is `args`. Other forms, such as a slot directive on `<Story>` itself or a named slot, are reported as errors.

Args, Controls and snippets:

- A slot value set in Controls fills that slot of the `<Meta>` component at the story's root and replaces what the template puts there, as Storybook's own Vue render does. Values a scoped slot receives from the component (like `year` in `#footer="{ year }"`) can't be set from Controls.
- With server-side docgen (Storybook 11, or 10.6+ with `features.experimentalDocgenServer`), args that are not declared props of the component (and not `on*` listeners), such as `class` or `data-*`, are treated as slots, as Storybook 11's own Vue render does.
- Snippets fill in args only where the template binds them (`v-bind="args"`, `:title="args.title"`, `{{ args.title }}`); the rest of the template is shown as written. Slot args are left out.
- Saving args from Controls back into a `.stories.vue` file is not implemented, so Storybook's "Save story" button is hidden for these stories (`controls.disableSaveFromUI`).

Storybook 11 and server-side docgen:

- Supported and tested against the 11 beta, and against Storybook 10.6 with `features.experimentalDocgenServer: true` in `.storybook/main.ts`.
- Server-side component docs only read CSF story files, so for each `.stories.vue` file the addon writes a small CSF file with the imports and `component` to `node_modules/.cache/storybook-vue-addon/docgen/`.

Router helper:

- `vue-router` is an optional peer dependency; install it to use the helper.
- `<Meta>` decorators wrap the router and can't use it (see [Usage](#usage) for the alternative). A story with `extends` adds its `router` options to those of the story it extends.
- If your preview setup already installs a router on the app, the story's router is provided to the story only, and `this.$route` in the Options API still refers to the app's router.

## Standalone Vite Plugin

The Storybook addon adds this plugin for you. To use it on its own:

```typescript
// vite.config.ts
import { vueStoriesPlugin } from '@v-contrib/storybook-vue-addon'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vueStoriesPlugin(), // before the vue plugin
    vue(),
  ],
})
```

Options:

```typescript
vueStoriesPlugin({
  include: /\.(?:stories\.vue|svue)$/, // story files (this is the default)
})
```

## How It Works

1. The Vite plugin transforms `.stories.vue` and `.svue` files into CSF JavaScript: `<Meta>` becomes the default export and each `<Story>` a named export with a render function that renders from args. Stories are declared under internal names and exported by their export name, so a story can be named like an import.
2. A story that is only the meta component with attributes renders as `h(Component, args)`. Storybook 10 generates its code snippet; on Storybook 11 the addon does.
3. Other story content is compiled by `@vitejs/plugin-vue` into one stories component per file (the virtual module `Foo.stories.vue.__stories__.vue`), which receives `args` as a prop.
   The story file itself is JavaScript by then, so the addon keeps `@vitejs/plugin-vue`, Storybook's Vue docgen plugins and [Vue Macros](https://vue-macros.dev) away from it; they still process the stories component. Plugins that transform JavaScript, such as `unplugin-auto-import` and `unplugin-vue-components`, keep working on both: a story file can use auto-imported APIs and components.
4. The addon's indexer registers the stories in the sidebar.
5. On Storybook 11 (and 10.6+ with `features.experimentalDocgenServer`), component docs come from server-side docgen, which only reads CSF story files. The addon writes a small CSF file per stories file to `node_modules/.cache/storybook-vue-addon/docgen/` and points Storybook's Vue docgen at it.
6. A `router` prop becomes a `withRouter(...)` decorator on each story.

Input:

```vue
<script setup lang="ts">
import Button from './Button.vue'
</script>

<template>
  <Meta title="Button" :component="Button" />
  <Story name="Primary">
    <Button label="Click" primary />
  </Story>
</template>
```

Output (the `__vueCsf*` helpers are emitted in the same module; abridged):

```javascript
import { h as __vueCsfH } from 'vue'
import Button from './Button.vue'

export default {
  title: "Button",
  component: Button,
  parameters: { docs: { source: { language: 'html' } }, controls: { disableSaveFromUI: true } },
}

const __vueCsfStory_Primary = {
  args: { label: 'Click', primary: true },
  render: (args, context) => () => {
    const { props, slots } = __vueCsfSplitArgs(args, context)
    return __vueCsfH(Button, props, slots)
  },
  parameters: {
    docs: {
      source: {
        originalSource: '<Button label="Click" primary />',
        transform: (code, context) => { /* fills in the current args */ },
      },
    },
  },
}

export { __vueCsfStory_Primary as Primary }
```

## License

[MPL-2.0](https://www.mozilla.org/en-US/MPL/2.0/)
