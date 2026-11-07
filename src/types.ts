import type { Component } from 'vue'

/**
 * `router` prop: options for `withRouter` (`RouterStoryOptions` from
 * `@v-contrib/storybook-vue-addon/router`), or `true` for the defaults.
 * Typed loosely here so this entry does not need vue-router.
 */
export type RouterProp = Record<string, unknown> | boolean

/** Props of `<Meta>` in a .stories.vue file */
export interface MetaProps {
  /** Without it, Storybook titles the file from its path */
  title?: string
  component?: Component
  argTypes?: Record<string, ArgType>
  args?: Record<string, unknown>
  decorators?: Decorator[]
  parameters?: Record<string, unknown>
  tags?: string[]
  router?: RouterProp
}

/** Props of `<Story>` in a .stories.vue file */
export interface StoryProps {
  name: string
  args?: Record<string, unknown>
  argTypes?: Record<string, ArgType>
  decorators?: Decorator[]
  parameters?: Record<string, unknown>
  play?: PlayFunction
  tests?: unknown
  extends?: string
  router?: RouterProp
}

export interface ArgType {
  control?: string | { type: string, options?: string[] }
  description?: string
  table?: Record<string, unknown>
}

export type Decorator = (story: () => Component, context: StoryContext) => Component
export type PlayFunction = (context: PlayFunctionContext) => Promise<void>
export type TestFunction = (context: TestFunctionContext) => Promise<void>

export interface StoryContext {
  args: Record<string, unknown>
  argTypes: Record<string, ArgType>
  parameters: Record<string, unknown>
}

export interface PlayFunctionContext {
  canvas: CanvasElement
  canvasElement: HTMLElement
  args: Record<string, unknown>
  userEvent: UserEvent
}

export interface TestFunctionContext extends PlayFunctionContext {
  step: (name: string, fn: () => Promise<void>) => Promise<void>
}

export interface CanvasElement {
  getByRole: (role: string, options?: Record<string, unknown>) => HTMLElement
  getByText: (text: string | RegExp) => HTMLElement
  getByTestId: (testId: string) => HTMLElement
  findByRole: (role: string, options?: Record<string, unknown>) => Promise<HTMLElement>
  findByText: (text: string | RegExp) => Promise<HTMLElement>
}

export interface UserEvent {
  click: (element: HTMLElement) => Promise<void>
  type: (element: HTMLElement, text: string) => Promise<void>
  hover: (element: HTMLElement) => Promise<void>
}
