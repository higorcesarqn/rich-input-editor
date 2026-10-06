import { expect, mock, test } from 'claude-code/testing'
import type { Mounted } from 'claude-code/testing'
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

type Pane = Mounted<'terminal', 'Pane'>

/** The one field the pane draws: the active line's. */
async function field(ui: Pane) {
  const fields = await ui.findAll({ type: 'Input' })
  expect(fields).toHaveLength(1)
  return fields[0]!
}

/** Types into the active line: an edit, or with `enter` the Enter key. */
async function type(ui: Pane, text: string, enter = false) {
  await ui.input({ key: (await field(ui)).key!, text, kind: enter ? 'submit' : 'change' })
}

test('@ completes folder by folder, Enter opens a line, Send hands the text to the prompt', async ($, on) => {
  const filled: string[] = []
  engine(on, filled)
  const ui = await $.ui.mount(PANE)

  await type(ui, 'Fix @')
  expect((await ui.findAll({ type: 'Button', text: /\/$/ })).map(b => b.text)).toEqual(['docs/', 'src/'])

  await ui.press({ key: 'sug:1' })
  expect(await ui.find({ key: 'sug:0', text: 'src/lib/' })).toBeDefined()

  await ui.press({ key: 'sug:0' })
  await ui.press({ key: 'sug:0' })
  expect((await field(ui)).text).toBe('Fix @src/lib/parse.ts ')
  expect(await ui.find({ key: 'sug:0' })).toBeUndefined()

  await type(ui, 'Fix @src/lib/parse.ts ', true)
  await type(ui, 'ok')
  await ui.press({ key: 'send' })

  expect(filled).toEqual(['Fix @src/lib/parse.ts \nok'])
})

test('Enter on a line with completions open takes the first one', async ($, on) => {
  const filled: string[] = []
  engine(on, filled)
  const ui = await $.ui.mount(PANE)

  await type(ui, 'see @pri')
  await type(ui, 'see @pri', true)
  expect((await field(ui)).text).toBe('see @src/lib/print.ts ')
  expect(await ui.find({ key: 'line:1' })).toBeUndefined()
})

test('only the active line is a field; the others are drawn with their text', async ($, on) => {
  const filled: string[] = []
  engine(on, filled)
  const ui = await $.ui.mount(PANE)

  await type(ui, 'one', true)
  await type(ui, 'two', true)
  expect((await ui.find({ key: 'line:0' }))?.text).toBe('one')
  expect((await ui.find({ key: 'line:1' }))?.text).toBe('two')
  expect((await field(ui)).text).toBe('')
})

test('going back to a line after Enter edits it from its text, in a fresh field', async ($, on) => {
  const filled: string[] = []
  engine(on, filled)
  const ui = await $.ui.mount(PANE)

  await type(ui, 'abc', true)
  const first = (await field(ui)).key
  await ui.press({ key: 'line:0' })
  const back = await field(ui)
  expect(back.text).toBe('abc')
  expect(back.key).not.toBe(first)
  expect(back.key).toMatch(/^edit:0:/)

  await type(ui, 'abXc')
  await ui.press({ key: 'send' })
  expect(filled).toEqual(['abXc'])
})

test('a pasted text with newlines becomes several lines', async ($, on) => {
  const filled: string[] = []
  engine(on, filled)
  const ui = await $.ui.mount(PANE)

  await type(ui, 'one\ntwo\nthree')
  expect((await field(ui)).text).toBe('three')

  await ui.press({ key: 'delete-line' })
  await ui.press({ key: 'send' })
  expect(filled).toEqual(['one\ntwo'])
})

test('Enter in the middle opens a line there and keeps the lines around it', async ($, on) => {
  const filled: string[] = []
  engine(on, filled)
  const ui = await $.ui.mount(PANE)

  await type(ui, 'first\nsecond')
  await ui.press({ key: 'line:0' })
  await type(ui, 'first', true)
  expect((await ui.find({ key: 'line:0' }))?.text).toBe('first')
  expect((await ui.find({ key: 'line:1' }))?.text).toBe('second')

  await type(ui, 'middle')
  await ui.press({ key: 'send' })
  expect(filled).toEqual(['first\nmiddle\nsecond'])
})


test('/rich says where the pane goes and why it is not docked', async ($, on) => {
  const filled: string[] = []
  engine(on, filled)
  on('ui.panes', () => ({ value: [] }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const run = (isFullscreen: boolean, columns: number) =>
    $.command.run({ command: 'rich', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen, columns } })

  expect((await run(true, 160)).text).toBe('Rich Input opened on the right (160 columns).')
  expect((await run(true, 98)).text).toContain('needs 110 columns, this terminal has 98')
  expect((await run(false, 160)).text).toContain('needs the fullscreen layout')
})
