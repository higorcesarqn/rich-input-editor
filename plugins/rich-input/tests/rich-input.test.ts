import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { complete, mentionAt, withDirs } from '../hooks/complete'

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

function engine(on: On, filled: string[]) {
  mock.clock(on)
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
}

test('@ completes folder by folder, Enter opens a line, Send hands the text to the prompt', async ($, on) => {
  const filled: string[] = []
  engine(on, filled)
  const ui = await $.ui.mount(PANE)

  await ui.input({ key: 'edit:0', text: 'Fix @', kind: 'change' })
  expect((await ui.findAll({ type: 'Button', text: /\/$/ })).map(b => b.text)).toEqual(['docs/', 'src/'])

  await ui.press({ key: 'sug:1' })
  expect(await ui.find({ key: 'sug:0', text: 'src/lib/' })).toBeDefined()

  await ui.press({ key: 'sug:0' })
  await ui.press({ key: 'sug:0' })
  expect((await ui.find({ key: 'edit:0' }))?.text).toBe('Fix @src/lib/parse.ts ')
  expect(await ui.find({ key: 'sug:0' })).toBeUndefined()

  await ui.input({ key: 'edit:0', text: 'Fix @src/lib/parse.ts ' })
  await ui.input({ key: 'edit:1', text: 'ok', kind: 'change' })
  await ui.press({ key: 'send' })

  expect(filled).toEqual(['Fix @src/lib/parse.ts \nok'])
})

test('Enter on a line with completions open takes the first one', async ($, on) => {
  const filled: string[] = []
  engine(on, filled)
  const ui = await $.ui.mount(PANE)

  await ui.input({ key: 'edit:0', text: 'see @pri', kind: 'change' })
  await ui.input({ key: 'edit:0', text: 'see @pri' })
  expect((await ui.find({ key: 'edit:0' }))?.text).toBe('see @src/lib/print.ts ')
  expect(await ui.find({ key: 'line:1' })).toBeUndefined()
})

test('only the active line is a field; the others are drawn with their text', async ($, on) => {
  const filled: string[] = []
  engine(on, filled)
  const ui = await $.ui.mount(PANE)

  await ui.input({ key: 'edit:0', text: 'one' })
  await ui.input({ key: 'edit:1', text: 'two' })
  expect((await ui.findAll({ type: 'Input' })).map(i => i.key)).toEqual(['edit:2'])
  expect((await ui.find({ key: 'line:0' }))?.text).toBe('one')
  expect((await ui.find({ key: 'line:1' }))?.text).toBe('two')

  await ui.press({ key: 'line:0' })
  expect((await ui.findAll({ type: 'Input' })).map(i => [i.key, i.text])).toEqual([['edit:0', 'one']])
})

test('a pasted text with newlines becomes several lines', async ($, on) => {
  const filled: string[] = []
  engine(on, filled)
  const ui = await $.ui.mount(PANE)

  await ui.input({ key: 'edit:0', text: 'one\ntwo\nthree', kind: 'change' })
  expect((await ui.find({ key: 'edit:2' }))?.text).toBe('three')

  await ui.press({ key: 'delete-line' })
  await ui.press({ key: 'send' })
  expect(filled).toEqual(['one\ntwo'])
})

test('Enter in the middle opens a line there and keeps the lines around it', async ($, on) => {
  const filled: string[] = []
  engine(on, filled)
  const ui = await $.ui.mount(PANE)

  await ui.input({ key: 'edit:0', text: 'first\nsecond', kind: 'change' })
  await ui.press({ key: 'line:0' })
  await ui.input({ key: 'edit:0', text: 'first' })
  expect((await ui.find({ key: 'line:0' }))?.text).toBe('first')
  expect((await ui.find({ key: 'line:1' }))?.text).toBe('second')

  await ui.input({ key: 'edit:2', text: 'middle', kind: 'change' })
  await ui.press({ key: 'send' })
  expect(filled).toEqual(['first\nmiddle\nsecond'])
})
