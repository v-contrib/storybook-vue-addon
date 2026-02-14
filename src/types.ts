import type { Component } from 'vue'

export interface MetaProps {
  title: string
  component?: Component
  argTypes?: Record<string, ArgType>
  args?: Record<string, unknown>
  decorators?: Decorator[]
  parameters?: Record<string, unknown>
  tags?: string[]
}

export interface StoryProps {
  name: string
  args?: Record<string, unknown>
  argTypes?: Record<string, ArgType>
  decorators?: Decorator[]
  parameters?: Record<string, unknown>
  play?: PlayFunction
  tests?: Record<string, TestFunction>
  extends?: string
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

export interface ParsedMeta extends MetaProps {
  imports: ImportStatement[]
  setupCode: string[]
}

export interface ParsedStory extends StoryProps {
  slotContent: string | null
  hasArgsSlot: boolean
  staticProps: Record<string, unknown>
}

export interface ImportStatement {
  source: string
  specifiers: Array<{
    imported: string
    local: string
    isDefault: boolean
  }>
}

export interface TransformResult {
  code: string
  map?: unknown
}
