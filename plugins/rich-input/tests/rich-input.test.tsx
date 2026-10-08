import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptAutocompleteInput, PromptAutocompleteResult, PromptEditInput, PromptEditResult } from 'claude-code'

import { isOn, parse, withRich } from '../hooks/bindings'
import { complete, rows, withDirs } from '../hooks/complete'
import { type Ed, fresh, layout, press, scrolled, textOf, withMenu } from '../hooks/editor-core'

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

/**
 * Raises a prompt event the typed kit does not list but the engine answers:
 * `autocomplete` and `edit` are raised from the prompt box, never by a plugin.
 */
function raise<I, R>($: Engine, name: 'autocomplete' | 'edit') {
  return (e: I) => ($.prompt as unknown as Record<string, (e: I) => Promise<R>>)[name]!(e)
}

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
    raise<PromptAutocompleteInput, PromptAutocompleteResult>($, 'autocomplete')({
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

test('turning rich input on adds Enter and Ctrl+Enter to the Chat block, keeping the rest', () => {
  const mine = parse(JSON.stringify({ bindings: [{ context: 'Chat', bindings: { 'ctrl+s': 'chat:submit' } }] }))!
  const on = withRich(mine, true)
  expect(on.bindings).toEqual([
    { context: 'Chat', bindings: { 'ctrl+s': 'chat:submit', enter: 'chat:newline', 'ctrl+enter': 'chat:submit' } },
  ])
  expect(isOn(on)).toBe(true)
  expect(withRich(on, false).bindings).toEqual([{ context: 'Chat', bindings: { 'ctrl+s': 'chat:submit' } }])
})

test('turning it off leaves a key the person bound elsewhere, and drops an emptied block', () => {
  const kb = parse(JSON.stringify({ bindings: [{ context: 'Chat', bindings: { enter: 'chat:newline', 'ctrl+enter': 'chat:externalEditor' } }] }))!
  expect(withRich(kb, false).bindings).toEqual([{ context: 'Chat', bindings: { 'ctrl+enter': 'chat:externalEditor' } }])
  expect(withRich(parse('{"bindings":[{"context":"Chat","bindings":{"enter":"chat:newline"}}]}'), false).bindings).toEqual([])
})

test('no file turns on into a fresh one; a file of another shape is refused', () => {
  expect(withRich(null, true).bindings).toEqual([{ context: 'Chat', bindings: { enter: 'chat:newline', 'ctrl+enter': 'chat:submit' } }])
  expect(parse('{ not json')).toBeNull()
  expect(parse('{"bindings":{}}')).toBeNull()
  expect(isOn(null)).toBe(false)
})

/** A keybindings.json held in memory, as the fs noun sees it. */
function disk(on: On, start: string | null) {
  const file = { text: start }
  mock.env(on, { HOME: '/home/me' })
  on('fs.exists', () => ({ value: file.text !== null }))
  on('fs.read', () => ({ value: file.text ?? '' }))
  on('fs.write', (_$, e) => {
    expect(e.path.replace(/\\/g, '/')).toMatch(/\/home\/me\/\.claude\/keybindings\.json$/)
    file.text = e.text
    return { value: undefined }
  })
  return file
}

const rich = ($: Engine) =>
  $.command.run({ command: 'rich', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })

const BAND = {
  plugin: 'rich-input',
  surface: 'terminal',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 80, scroll: { offset: 0, bodyRows: 1 }, view: {} },
  viewport: { columns: 80, rows: 30 },
} as const

test('/rich turns rich input on and off in keybindings.json, and the row above the prompt says which', async ($, on) => {
  const file = disk(on, null)
  const band = await $.ui.mount(BAND)
  expect((await band.find({ key: 'toggle-rich' }))?.text).toBe('✎ Rich input: off')

  expect((await rich($)).text).toContain('Rich input on')
  expect(isOn(parse(file.text!))).toBe(true)
  expect((await band.find({ key: 'toggle-rich' }))?.text).toBe('✎ Rich input: on')

  expect((await rich($)).text).toContain('Rich input off')
  expect(parse(file.text!)!.bindings).toEqual([])
})

test('a keybindings.json Rich Input cannot read is left alone', async ($, on) => {
  const file = disk(on, '{ "bindings": "oops" }')
  expect((await rich($)).text).toContain('left as it is')
  expect(file.text).toBe('{ "bindings": "oops" }')
})

test('while on, the draft takes a color and the footer names the mode', async ($, on) => {
  disk(on, null)
  on('prompt.edit', (_$, e) => ({ text: e.text + e.inputText, cursor: e.cursor + 1 }))
  const footers: (readonly string[])[] = []
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    footers.push(e.props.modes)
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.modes.join(' & ')}</Text>
  })
  await rich($)
  const box = await raise<PromptEditInput, PromptEditResult>($, 'edit')({ origin: { kind: 'composer' }, text: 'ab', cursor: 2, start: 2, end: 2, inputText: 'c' })
  expect(box.decorations).toEqual([{ start: 0, end: 3, color: 'suggestion' }])

  await $.ui.mount({ plugin: 'rich-input', surface: 'terminal', component: 'SessionMode', requestId: 'mode', props: { modes: ['focus'] } } as never)
  expect(footers.at(-1)).toEqual(['focus', 'rich input'])
})

const keys = (ed: Ed, ...ks: (string | { key: string; ctrl?: true })[]) =>
  ks.reduce((e, k) => press(e, typeof k === 'string' ? { key: k } : k), ed)
const type = (ed: Ed, text: string) => keys(ed, ...[...text])

test('the editor: Enter splits a line at the cursor, Backspace at a line start joins it back', () => {
  let ed = type(fresh(''), 'helloworld')
  ed = keys(ed, 'left', 'left', 'left', 'left', 'left', 'return')
  expect(ed.lines).toEqual(['hello', 'world'])
  expect([ed.row, ed.col]).toEqual([1, 0])
  ed = keys(ed, 'backspace')
  expect(textOf(ed)).toBe('helloworld')
  expect([ed.row, ed.col]).toEqual([0, 5])
})

test('the editor: arrows, Home, End and Delete move and edit across lines', () => {
  let ed = fresh('abc\nde')
  ed = keys(ed, 'up', 'home', 'right', 'delete')
  expect(textOf(ed)).toBe('ac\nde')
  ed = keys(ed, 'end', 'delete')
  expect(textOf(ed)).toBe('acde')
  ed = keys(ed, 'down', 'end', 'right')
  expect([ed.row, ed.col]).toEqual([0, 4])
})

test('the editor: an @ mention asks for completions; a folder taken keeps it open', () => {
  let ed = type(fresh(''), 'see @sr')
  expect([ed.query, ed.queryId]).toEqual(['sr', 3])
  ed = withMenu(ed, { queryId: ed.queryId, items: complete(ENTRIES, 'sr') })
  expect(ed.menu?.items[0]?.label).toBe('src/')
  ed = keys(ed, 'return')
  expect(textOf(ed)).toBe('see @src/')
  expect(ed.query).toBe('src/')
  ed = withMenu(ed, { queryId: ed.queryId, items: complete(ENTRIES, 'src/') })
  ed = keys(ed, 'down', 'tab')
  expect(textOf(ed)).toBe('see @src/app.ts ')
  expect(ed.menu).toBeNull()
})

test('the editor: an answer for an older query is ignored; Ctrl+S asks to send', () => {
  let ed = type(fresh(''), '@s')
  const old = ed.queryId
  ed = type(ed, 'r')
  expect(withMenu(ed, { queryId: old, items: complete(ENTRIES, 's') }).menu).toBeNull()
  expect(keys(ed, { key: 's', ctrl: true }).send).toBe(1)
})

test('the editor scrolls to keep the cursor and its menu in view', () => {
  const ed = scrolled(fresh('1\n2\n3\n4\n5\n6'), 3)
  expect(ed.top).toBe(3)
  expect(layout(ed, 3)).toEqual([
    { kind: 'line', row: 3 },
    { kind: 'line', row: 4 },
    { kind: 'line', row: 5 },
  ])
})

const PANE = {
  plugin: 'rich-input',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'rich-input-pane',
  props: {
    title: 'Rich Input',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
  viewport: { columns: 120, rows: 30 },
} as const

test('the pane editor: type, complete @, paste with a right click, Ctrl+S puts it all in the prompt', async ($, on) => {
  const filled: string[] = []
  mock.clock(on)
  on('session.cwd', () => ({ value: '/proj' }))
  on('process.run', (_$, e) => ({
    value: {
      exitCode: 0,
      stdout: e.argv[0] === 'git' ? FILES.join('\0') : 'one\r\ntwo\r\n',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('prompt.read', () => ({ value: { text: 'draft', cursor: 5 } }))
  on('prompt.fill', (_$, e) => {
    filled.push(e.text)
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))

  await $.command.run({ command: 'rich', args: 'pane', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  expect(filled).toEqual([''])
  const ui = await $.ui.mount(PANE)
  await ui.resize({ columns: 60, rows: 10, in: 'editor' })
  expect(await ui.find({ text: /Click here to start typing/, in: 'editor' })).toBeDefined()
  await ui.pointer({ type: 'down', x: 20, y: 1, button: 'left', in: 'editor' })
  expect(await ui.find({ text: /editing/, in: 'editor' })).toBeDefined()

  for (const k of [...' @sr']) await ui.key({ key: k, in: 'editor' })
  expect(await ui.find({ text: /^\s*src\/$/, in: 'editor' })).toBeDefined()
  await ui.key({ key: 'return', in: 'editor' })
  await ui.key({ key: 'return', in: 'editor' })
  await ui.key({ key: 'return', in: 'editor' })

  await ui.pointer({ type: 'down', x: 5, y: 0, button: 'right', in: 'editor' })
  await ui.key({ key: 's', ctrl: true, in: 'editor' })
  expect(filled.at(-1)).toBe('draft @src/lib/parse.ts one\ntwo')
})
