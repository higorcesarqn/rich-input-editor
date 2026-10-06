import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { Doc, Line, Suggestion } from '../types'
import { complete, type Entry, mentionAt, withDirs } from './complete'

const PANE = 'rich-input'
const EMPTY: Doc = { lines: [{ id: 0, text: '' }], nextId: 1, active: 0, epoch: 0, sug: null }
const doc = atom({ plugin: 'rich-input', key: 'doc' } as const, EMPTY)

/** Folders the fallback walk skips: build output and dependencies. */
const SKIPPED = new Set(['.git', 'node_modules', 'dist', 'build', 'out', 'target', '.next', '.venv', 'venv', '__pycache__', '.cache'])
const WALK_LIMIT = 5000
const INDEX_TTL_MS = 15_000
const MENU_SIZE = 9
/** The most rows the pane asks for; below it the pane is as tall as its content. */
const PANE_ROWS = 20
/** The width from which the fullscreen layout docks a pane beside the transcript. */
const DOCK_COLUMNS = 110

type $ = EngineInterface

let index: { root: string; at: number; entries: Entry[] } | null = null
let isSending = false

/**
 * The field the active line is edited in, and the row each other line is
 * drawn as. A field keeps what the person last left in it (an Enter empties
 * it) over the text drawn, so each turn of a line as the active one takes a
 * fresh field (`epoch`), which starts from the line's text.
 */
const editKey = (id: number, epoch: number) => `edit:${id}:${epoch}`
const lineKey = (id: number) => `line:${id}`
const textOf = (d: Doc) =>
  d.lines
    .map(l => l.text)
    .join('\n')
    .replace(/\n+$/, '')
const indexOf = (d: Doc, id: number) => d.lines.findIndex(l => l.id === id)

/**
 * Where the pane goes and, when it lands above the prompt, why: the dock
 * beside the transcript needs the fullscreen layout and 110 columns.
 */
function placementOf(p: { isFullscreen: boolean; columns: number }): string {
  if (!p.isFullscreen) {
    return 'above the prompt: docking on the right needs the fullscreen layout (try CLAUDE_CODE_NO_FLICKER=1)'
  }
  if (p.columns < DOCK_COLUMNS) {
    return `above the prompt: docking on the right needs ${DOCK_COLUMNS} columns, this terminal has ${p.columns}`
  }
  return `on the right (${p.columns} columns)`
}

/** The doc for a text, one fresh line id per line. */
function docOf(text: string, epoch: number): Doc {
  const lines: Line[] = (text === '' ? [''] : text.split(/\r?\n/)).map((t, id) => ({ id, text: t }))
  return { lines, nextId: lines.length, active: lines[lines.length - 1]!.id, epoch, sug: null }
}

/** The project's files and folders: git's list, else a bounded walk. */
async function entries($: $): Promise<Entry[]> {
  const root = await $.session.cwd()
  const now = await $.clock.now()
  if (index !== null && index.root === root && now - index.at < INDEX_TTL_MS) return index.entries

  let files: string[] | null = null
  try {
    const git = await $.process.run(
      ['git', '-c', 'core.quotepath=off', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { cwd: root, timeoutMs: 5000 },
    )
    if (git.exitCode === 0) files = git.stdout.split('\0').filter(f => f !== '')
  } catch {
    files = null
  }
  files ??= await walk($, root)
  index = { root, at: now, entries: withDirs(files) }
  return index.entries
}

async function walk($: $, root: string): Promise<string[]> {
  const files: string[] = []
  const queue = ['']
  while (queue.length > 0 && files.length < WALK_LIMIT) {
    const dir = queue.shift()!
    let listed
    try {
      listed = await $.fs.list(dir === '' ? root : `${root}/${dir}`)
    } catch {
      continue
    }
    for (const entry of listed) {
      const path = dir === '' ? entry.name : `${dir}/${entry.name}`
      if (entry.kind === 'dir') {
        if (!SKIPPED.has(entry.name)) {
          queue.push(path)
          files.push(`${path}/`)
        }
      } else {
        files.push(path)
      }
    }
  }
  return files
}

/** The completions for the mention a line ends in, or null outside one. */
async function suggestionsFor($: $, line: number, text: string): Promise<Doc['sug']> {
  const m = mentionAt(text, text.length)
  if (m === null) return null
  const items = complete(await entries($), m.query)
  return items.length === 0 ? null : { line, query: m.query, items }
}

/** Opens the editor with what the prompt box holds, moving it out of the box. */
async function openEditor($: $, extra = '') {
  const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
  if (!isOpen) {
    const box = await $.prompt.read()
    const text = [box.text, extra].filter(t => t !== '').join(' ')
    await update($, doc, d => docOf(text, d.epoch + 1))
    // The pane takes the keyboard only over an empty composer.
    if (box.text !== '') await $.prompt.fill({ text: '', mode: 'replace' })
  }
  await $.ui.open({ id: PANE, title: 'Rich Input', focus: true, closeOnEscape: true, rows: PANE_ROWS })
  void entries($).catch(() => undefined)
}

/** Closes the editor; with a text, puts it in the prompt box to be sent. */
async function closeEditor($: $, text: string | null) {
  isSending = text !== null
  await $.ui.close({ id: PANE })
  isSending = false
  if (text === null) return
  await update($, doc, () => EMPTY)
  const filled = await $.prompt.fill({ text, mode: 'replace' })
  if (filled.isFilled) $.ui.toast('Text is in the prompt: press Enter to send (@ references are resolved on send)')
}

async function send($: $) {
  await closeEditor($, textOf(await read($, doc)))
}

/** Moves the keyboard to one of the pane's elements; a refused move keeps it. */
async function focus($: $, key: string) {
  try {
    await $.ui.focus({ requestId: PANE, key })
  } catch {
    // The ring stays where it was: the edit itself has landed.
  }
}

/** A line's text changed: a paste with newlines splits it into several. */
async function changeLine($: $, id: number, value: string) {
  const parts = value.split(/\r?\n/)
  const before = await read($, doc)
  const lastId = parts.length > 1 ? before.nextId + parts.length - 2 : id
  const sug = await suggestionsFor($, lastId, parts[parts.length - 1]!)
  await update($, doc, d => {
    const at = indexOf(d, id)
    if (at < 0) return d
    const added = parts.slice(1).map((text, k) => ({ id: d.nextId + k, text }))
    const lines = [...d.lines]
    lines.splice(at, 1, { id, text: parts[0]! }, ...added)
    const epoch = added.length > 0 ? d.epoch + 1 : d.epoch
    return { lines, nextId: d.nextId + added.length, active: lastId, epoch, sug }
  })
  if (parts.length > 1) await focus($, editKey(lastId, (await read($, doc)).epoch))
}

/** Enter on a line: takes the first completion, or opens a new line below. */
async function submitLine($: $, id: number, value: string) {
  const d = await read($, doc)
  if (d.sug !== null && d.sug.line === id) return accept($, id, d.sug.items[0]!)
  const newId = d.nextId
  await update($, doc, cur => {
    const at = indexOf(cur, id)
    if (at < 0) return cur
    const lines = [...cur.lines]
    lines[at] = { id, text: value }
    lines.splice(at + 1, 0, { id: newId, text: '' })
    return { lines, nextId: newId + 1, active: newId, epoch: cur.epoch + 1, sug: null }
  })
  await focus($, editKey(newId, (await read($, doc)).epoch))
}

/** Puts a completion in place of the line's `@query`; a folder opens its own. */
async function accept($: $, id: number, choice: Suggestion) {
  const d = await read($, doc)
  const line = d.lines[indexOf(d, id)]?.text ?? ''
  const m = mentionAt(line, line.length)
  if (m === null) return
  const next = line.slice(0, m.start) + choice.insert + (choice.isDir ? '' : ' ') + line.slice(m.end)
  const sug = choice.isDir ? await suggestionsFor($, id, next) : null
  await update($, doc, cur => ({
    ...cur,
    lines: cur.lines.map(l => (l.id === id ? { id, text: next } : l)),
    active: id,
    epoch: cur.epoch + 1,
    sug,
  }))
  await focus($, sug !== null ? 'sug:0' : editKey(id, (await read($, doc)).epoch))
}

/** Makes another line the one being edited, and gives its field the keyboard. */
async function editLine($: $, id: number) {
  await update($, doc, d => (d.active === id ? d : { ...d, active: id, epoch: d.epoch + 1, sug: null }))
  await focus($, editKey(id, (await read($, doc)).epoch))
}

async function deleteLine($: $) {
  const d = await read($, doc)
  const at = Math.max(0, indexOf(d, d.active))
  const lines = d.lines.length > 1 ? d.lines.filter((_, i) => i !== at) : [{ id: d.nextId, text: '' }]
  const active = lines[Math.max(0, at - 1)]!.id
  await update($, doc, cur => ({ lines, nextId: d.nextId + 1, active, epoch: cur.epoch + 1, sug: null }))
  await focus($, editKey(active, (await read($, doc)).epoch))
}

export const register: Register = (on, options) => {
  const openAction = typeof options.shortcutAction === 'string' ? options.shortcutAction : 'app:toggleReplTab'
  const sendAction = typeof options.sendAction === 'string' ? options.sendAction : 'app:toggleDiffPreSession'
  const showBand = options.showBand !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'rich',
      description: 'Open Rich Input: a multi-line editor with @file and @folder completion',
      argumentHint: '[text]',
    })
    return next(e)
  })

  on('command.run', { command: 'rich' }, async ($, e) => {
    await openEditor($, e.args.trim())
    return { text: `Rich Input opened ${placementOf(e.presentation)}.` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!showBand || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row">
        <Button key="open-rich" label="✎ Rich input" plain dimColor action={openAction} onPress={() => openEditor($)} />
        <Text dimColor> Alt+R or /rich</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    if (!('Input' in ui)) return <Text>This surface can't draw the editor; use the prompt.</Text>

    const d = await read($, doc)
    const width = String(d.lines.length).length
    // Every line is drawn, always, keyed by its id: the surface keeps each
    // field (and the person's typing in it) with its own line.
    const rows: RenderElement[] = []
    d.lines.forEach((line, i) => {
      const gutter = `${String(i + 1).padStart(width)} │`
      if (line.id !== d.active) {
        // A field without the focus is not drawn with its text on every
        // terminal, so only the active line is a field: the others are rows
        // the ring walks, and Enter (or a click) on one edits it.
        rows.push(
          <Box flexDirection="row">
            <Text dimColor>{gutter}</Text>
            <Button key={lineKey(line.id)} plain label={line.text === '' ? ' ' : line.text} onPress={() => editLine($, line.id)} />
          </Box>,
        )
        return
      }
      const isMenu = d.sug !== null && d.sug.line === line.id
      rows.push(
        <ui.Input
          key={editKey(line.id, d.epoch)}
          label={gutter}
          value={line.text}
          placeholder={d.lines.length === 1 ? 'Write your prompt… @ mentions files and folders' : undefined}
          submitLabel={isMenu ? 'accept' : 'new line'}
          autoFocus
          onInput={value => changeLine($, line.id, value)}
          onSubmit={value => submitLine($, line.id, value)}
        />,
      )
      if (isMenu) {
        d.sug!.items.slice(0, MENU_SIZE).forEach((choice, j) =>
          rows.push(
            <Box paddingLeft={width + 2}>
              <Button
                key={`sug:${j}`}
                plain
                hotkey={String(j + 1)}
                dimColor={!choice.isDir}
                label={choice.label}
                onPress={() => accept($, line.id, choice)}
              />
            </Box>,
          ),
        )
      }
    })

    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Button key="send" label="Send to prompt" variant="primary" action={sendAction} onPress={() => send($)} />
          <Text> </Text>
          <Button key="delete-line" label="Delete line" onPress={() => deleteLine($)} />
          <Text> </Text>
          <Button key="cancel" label="Cancel" role="dismiss" onPress={() => closeEditor($, null)} />
          <Text dimColor wrap="truncate-end">
            {'  '}Enter new line · Tab @ suggestions · Ctrl+S send · Esc leave
          </Text>
        </Box>
        {rows}
      </Box>
    )
  })

  // Walking the ring (Tab, the arrows) onto another line's row edits that line.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const moved = await next(e)
    const id = e.element?.startsWith('line:') ? Number(e.element.slice(5)) : NaN
    if (moved.deny === undefined && e.origin.kind === 'person' && Number.isInteger(id)) void editLine($, id)
    return moved
  })

  // Closing without sending (Esc, the close mark, Cancel) hands the draft
  // back to the prompt box, so nothing typed is lost.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (isSending || e.origin.kind === 'unload') return closed
    const text = textOf(await read($, doc))
    if (text !== '') await $.prompt.fill({ text, mode: 'replace' })
    return closed
  })
}
