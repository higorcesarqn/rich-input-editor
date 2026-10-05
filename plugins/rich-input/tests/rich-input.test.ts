import { expect, mock, test } from 'claude-code/testing'

import { at, insert, layout, mentionAt, offsetAt, rowOf, vertical, wordLeft } from '../hooks/buffer'
import { complete, withDirs } from '../hooks/complete'

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

test('the mention under the cursor, and none mid-word', () => {
  expect(mentionAt('see @src/li', 11)).toEqual({ start: 4, end: 11, query: 'src/li' })
  expect(mentionAt('mail a@b.com', 12)).toBeNull()
  expect(mentionAt('@x y', 4)).toBeNull()
})

test('rows wrap long lines and the cursor moves between them', () => {
  const rows = layout('abcdef\nxy', 4)
  expect(rows).toEqual([
    { start: 0, end: 4 },
    { start: 4, end: 6 },
    { start: 7, end: 9 },
  ])
  expect(rowOf(rows, 4)).toBe(1)
  expect(vertical(rows, 1, 2, 1)).toBe(8)
  expect(offsetAt(rows, 2, 99)).toBe(9)
  expect(wordLeft('foo bar', 7)).toBe(4)
  expect(insert({ text: 'abc', cursor: 3, anchor: 0 }, 'z')).toEqual(at('z'))
})

const PANE = {
  plugin: 'rich-input',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'rich-input',
  props: {
    title: 'Rich Input',
    isFocused: true,
    bodyColumns: 60,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
  viewport: { columns: 80, rows: 30 },
} as const

test('@ completes folder by folder and Ctrl+S hands the text to the prompt box', async ($, on) => {
  mock.clock(on)
  const filled: string[] = []
  on('session.cwd', () => ({ value: '/proj' }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: FILES.join('\0'), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('prompt.fill', (_$, e) => {
    filled.push(e.text)
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))

  const ui = await $.ui.mount(PANE)
  await ui.resize({ columns: 60, rows: 11 })
  for (const key of 'Fix ') await ui.key({ key })
  await ui.key({ key: '@' })
  expect(await ui.find({ in: 'editor', text: 'src/' })).toBeDefined()

  await ui.key({ key: 'down' })
  await ui.key({ key: 'tab' })
  expect(await ui.find({ in: 'editor', text: 'src/lib/' })).toBeDefined()

  await ui.key({ key: 'tab' })
  await ui.key({ key: 'tab' })
  await ui.key({ key: 'return' })
  for (const key of 'ok') await ui.key({ key })
  await ui.key({ key: 's', ctrl: true })

  expect(filled).toEqual(['Fix @src/lib/parse.ts \nok'])
})
