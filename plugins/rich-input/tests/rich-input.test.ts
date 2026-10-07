import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { complete, rows, withDirs } from '../hooks/complete'

const FILES = ['src/app.ts', 'src/lib/parse.ts', 'src/lib/print.ts', 'docs/my notes.md', 'README.md']
const ENTRIES = withDirs(FILES)

test('@ alone lists the top level, folders first', () => {
  expect(complete(ENTRIES, '').map(s => s.label)).toEqual(['docs/', 'src/', 'README.md'])
})

test('a query with / browses that folder: subfolders and files', () => {
  expect(complete(ENTRIES, 'src/').map(s => s.insert)).toEqual(['@src/lib/', '@src/app.ts'])
  expect(complete(ENTRIES, 'src/lib/pa').map(s => s.insert)).toEqual(['@src/lib/parse.ts'])
})

test('a bare name searches the whole tree', () => {
  expect(complete(ENTRIES, 'print').map(s => s.insert)).toEqual(['@src/lib/print.ts'])
  expect(complete(ENTRIES, 'lib')[0]).toEqual({ label: 'src/lib/', insert: '@src/lib/', isDir: true })
})

test('a path with a space is quoted as the prompt box quotes it', () => {
  expect(complete(ENTRIES, 'my')[0]!.insert).toBe('@"docs/my notes.md"')
})

test('typeahead rows: a folder keeps the mention open, a file ends it', () => {
  expect(rows(ENTRIES, '@src/')).toEqual([
    { text: '@src/lib/', label: 'src/lib/', description: 'folder' },
    { text: '@src/app.ts ', label: 'src/app.ts' },
  ])
  expect(rows(ENTRIES, 'src/')).toEqual([])
})

function engine(on: On) {
  mock.clock(on)
  on('session.cwd', () => ({ value: '/proj' }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: FILES.join('\0'), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
}

test('@ in the prompt box browses folder by folder, beneath the rows already there', async ($, on) => {
  engine(on)
  on('prompt.autocomplete', () => ({ suggestions: [{ text: '@engine-row' }] }))
  const ask = (text: string) =>
    ($.prompt as unknown as Record<string, (e: unknown) => Promise<{ suggestions: { text: string }[] }>>).autocomplete!({
      text,
      cursor: text.length,
      token: text.slice(text.lastIndexOf(' ') + 1),
      start: text.lastIndexOf(' ') + 1,
    })

  expect((await ask('fix @')).suggestions.map(s => s.text)).toEqual(['@engine-row', '@docs/', '@src/', '@README.md '])
  expect((await ask('fix @src/lib/')).suggestions.map(s => s.text)).toEqual([
    '@engine-row',
    '@src/lib/parse.ts ',
    '@src/lib/print.ts ',
  ])
})

const BAND = {
  plugin: 'rich-input',
  surface: 'terminal',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 80, scroll: { offset: 0, bodyRows: 1 }, view: {} },
  viewport: { columns: 80, rows: 30 },
} as const

test('the hint above the prompt names the keys', async $ => {
  const band = await $.ui.mount(BAND)
  expect(await band.find({ type: 'Text', text: /Enter new line/ })).toBeDefined()
})

test('/rich explains the editor and where the bindings live', async $ => {
  const run = await $.command.run({
    command: 'rich',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })
  expect(run.text).toContain('Ctrl+Enter')
  expect(run.text).toContain('keybindings.json')
})
