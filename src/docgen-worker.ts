/**
 * Storybook 11 docgen worker provider for .stories.vue / .svue files.
 *
 * With server-side docgen (Storybook 11), component docs and Controls come
 * from docgen providers that run in a worker thread. @storybook/vue3's provider
 * only reads CSF story files (`*.stories.{js,ts}`): it parses the story file
 * and follows the `component` of its default export to the .vue file. It
 * skips .stories.vue files, so their components get no docs.
 *
 * This provider runs before it. For a .stories.vue entry it writes a small CSF
 * shim with the story file's imports and `export default { component }`, and
 * hands the entry on with the shim as its story file. Storybook 10 never loads
 * this module.
 */
import type { ParsedResult } from './parse'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { parseStoriesVue } from './parse'
import { STORY_FILE_PATTERN } from './story-file'

/** The part of a Storybook index entry that docgen uses */
export interface DocgenEntry {
  id: string
  type: string
  title?: string
  importPath?: string
  storiesImports?: string[]
  [key: string]: unknown
}

export interface DocgenInput {
  entry: DocgenEntry
  [key: string]: unknown
}

type Docgen = (input: DocgenInput) => Promise<any>

export interface DocgenProviderOptions {
  /** Project root that import paths are relative to. Default: process.cwd() */
  cwd?: string
  /** Where the CSF shims are written. Default: <cwd>/node_modules/.cache/storybook-vue-addon/docgen */
  cacheDir?: string
}

/** The story file of an entry, as Storybook's docgen picks it */
function storyImportPath(entry: DocgenEntry): string | undefined {
  if (entry.type === 'story')
    return entry.importPath
  return entry.storiesImports?.[0]
}

/** Import source of the meta component, e.g. `./Card.vue` */
export function componentImportSource(parsed: ParsedResult): string | undefined {
  const component = parsed.meta.componentRef
  if (!component)
    return undefined
  for (const statement of parsed.imports) {
    // `import <clause> from '<source>'`
    const from = statement.lastIndexOf(' from ')
    if (!statement.startsWith('import ') || from < 0)
      continue
    const clause = statement.slice('import '.length, from)
    const source = statement.slice(from + ' from '.length).trim().replace(/;$/, '').slice(1, -1)
    // `X`, `{ X }`, `{ Y as X }`, `* as X`: the local name is the last word of its group
    const locals = clause
      .replace(/[{}]/g, ',')
      .split(',')
      .map(part => part.trim().split(/\s+/).at(-1))
    if (locals.includes(component))
      return source
  }
  return undefined
}

/** `./Card.vue` -> `/abs/dir/Card.vue`; bare and aliased specifiers stay as they are */
function absoluteImport(statement: string, storyDir: string): string {
  return statement.replace(/(from\s+)(['"])(\.{1,2}\/[^'"]*)\2/, (_m, from: string, quote: string, path: string) =>
    `${from}${quote}${resolve(storyDir, path).replace(/\\/g, '/')}${quote}`)
}

/**
 * CSF source with the imports of a .stories.vue file and its meta component,
 * or undefined when the file has no meta component.
 */
export function buildDocgenShim(source: string, storyPath: string): string | undefined {
  const parsed = parseStoriesVue(source)
  const component = parsed.meta.componentRef
  if (!component)
    return undefined
  const storyDir = dirname(storyPath)
  return [
    ...parsed.imports.map(statement => absoluteImport(statement.trim(), storyDir)),
    '',
    `export default { title: ${JSON.stringify(parsed.meta.title)}, component: ${component} }`,
    '',
  ].join('\n')
}

function toImportPath(path: string, cwd: string): string {
  const rel = relative(cwd, path).replace(/\\/g, '/')
  return rel.startsWith('.') || isAbsolute(rel)
    ? rel
    : `./${rel}`
}

export function createDocgenProvider(options: DocgenProviderOptions = {}) {
  const cwd = options.cwd ?? process.cwd()
  const cacheDir = options.cacheDir ?? join(cwd, 'node_modules', '.cache', 'storybook-vue-addon', 'docgen')

  /** Writes the shim for a story file; returns its import path, or undefined */
  const writeShim = (importPath: string): string | undefined => {
    const storyPath = resolve(cwd, importPath)
    const shim = buildDocgenShim(readFileSync(storyPath, 'utf-8'), storyPath)
    if (!shim)
      return undefined
    // The name must look like a CSF story file for @storybook/vue3's provider
    const hash = createHash('sha1').update(storyPath).digest('hex').slice(0, 8)
    const name = basename(storyPath).replace(STORY_FILE_PATTERN, '')
    const shimPath = join(cacheDir, `${name}-${hash}.stories.js`)
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(shimPath, shim)
    return toImportPath(shimPath, cwd)
  }

  return (next: Docgen): Docgen => async (input) => {
    const importPath = storyImportPath(input.entry)
    if (!importPath || !STORY_FILE_PATTERN.test(importPath))
      return next(input)

    let shimImportPath: string | undefined
    try {
      shimImportPath = writeShim(importPath)
    }
    catch {
      shimImportPath = undefined
    }
    if (!shimImportPath)
      return next(input)

    const entry: DocgenEntry = input.entry.type === 'story'
      ? { ...input.entry, importPath: shimImportPath }
      : {
          ...input.entry,
          storiesImports: [
            shimImportPath,
            ...(input.entry.storiesImports ?? []).slice(1),
          ],
        }
    const payload = await next({ ...input, entry })
    // Point back at the real story file
    if (payload && typeof payload === 'object' && payload.path === shimImportPath)
      return { ...payload, path: importPath }
    return payload
  }
}
