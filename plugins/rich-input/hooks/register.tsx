import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Doc, Suggestion } from '../types'
import { complete, type Entry, mentionAt, withDirs } from './complete'

const PANE = 'rich-input'
const EMPTY: Doc = { lines: [''], active: 0, sug: null }
const doc = atom({ plugin: 'rich-input', key: 'doc' } as const, EMPTY)

/** Folders the fallback walk skips: build output and dependencies. */
const SKIPPED = new Set(['.git', 'node_modules', 'dist', 'build', 'out', 'target', '.next', '.venv', 'venv', '__pycache__', '.cache'])
const WALK_LIMIT = 5000
const INDEX_TTL_MS = 15_000
const MENU_SIZE = 9
/** The pane's toolbar row, above the lines. */
const CHROME_ROWS = 1
const MIN_ROWS = 4
const MAX_ROWS = 24

type $ = EngineInterface

let index: { root: string; at: number; entries: Entry[] } | null = null
let isSending = false
let askedRows = 0

const lineKey = (i: number) => `line:${i}`
const textOf = (d: Doc) => d.lines.join('\n').replace(/\n+$/, '')
const menuRows = (d: Doc) => (d.sug === null ? 0 : Math.min(d.sug.items.length, MENU_SIZE))
const rowsFor = (d: Doc) => Math.max(MIN_ROWS, Math.min(MAX_ROWS, CHROME_ROWS + d.lines.length + menuRows(d)))

/**
 * Which lines fit in `room` rows: all of them, or a run ending at the active
 * line (so the lines above it stay in view), with a row left for each marker
 * of lines out of view.
 */
function visibleLines(total: number, active: number, room: number): { start: number; end: number } {
  if (total <= room) return { start: 0, end: total }
  const oneMarker = Math.max(1, room - 1)
  if (active >= total - oneMarker) return { start: total - oneMarker, end: total }
  if (active < oneMarker) return { start: 0, end: oneMarker }
  const shown = Math.max(1, room - 2)
  return { start: active - shown + 1, end: active + 1 }
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
    const lines = text === '' ? [''] : text.split(/\r?\n/)
    await update($, doc, () => ({ lines, active: lines.length - 1, sug: null }))
    // The pane takes the keyboard only over an empty composer.
    if (box.text !== '') await $.prompt.fill({ text: '', mode: 'replace' })
  }
  askedRows = rowsFor(await read($, doc))
  await $.ui.open({ id: PANE, title: 'Rich Input', focus: true, closeOnEscape: true, rows: askedRows })
  void entries($).catch(() => undefined)
}

/** Asks the pane for the rows its content needs as lines and completions come and go. */
async function fit($: $) {
  const rows = rowsFor(await read($, doc))
  if (rows === askedRows) return
  askedRows = rows
  await $.ui.open({ id: PANE, title: 'Rich Input', closeOnEscape: true, rows })
}

/** Closes the editor; with a text, puts it in the prompt box to be sent. */
async function closeEditor($: $, text: string | null) {
  isSending = text !== null
  await $.ui.close({ id: PANE })
  isSending = false
  if (text === null) return
  await update($, doc, () => EMPTY)
  const filled = await $.prompt.fill({ text, mode: 'replace' })
  if (filled.isFilled) $.ui.toast('Prompt no campo: Enter envia (as @referências são resolvidas no envio)')
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
async function changeLine($: $, i: number, value: string) {
  const parts = value.split(/\r?\n/)
  const last = i + parts.length - 1
  const sug = await suggestionsFor($, last, parts[parts.length - 1]!)
  await update($, doc, d => {
    const lines = [...d.lines]
    lines.splice(i, 1, ...parts)
    return { lines, active: last, sug }
  })
  await fit($)
  if (parts.length > 1) await focus($, lineKey(last))
}

/** Enter on a line: takes the first completion, or opens a new line below. */
async function submitLine($: $, i: number, value: string) {
  const d = await read($, doc)
  if (d.sug !== null && d.sug.line === i) return accept($, i, d.sug.items[0]!)
  await update($, doc, cur => {
    const lines = [...cur.lines]
    lines[i] = value
    lines.splice(i + 1, 0, '')
    return { lines, active: i + 1, sug: null }
  })
  await fit($)
  await focus($, lineKey(i + 1))
}

/** Puts a completion in place of the line's `@query`; a folder opens its own. */
async function accept($: $, i: number, choice: Suggestion) {
  const d = await read($, doc)
  const line = d.lines[i] ?? ''
  const m = mentionAt(line, line.length)
  if (m === null) return
  const next = line.slice(0, m.start) + choice.insert + (choice.isDir ? '' : ' ') + line.slice(m.end)
  const sug = choice.isDir ? await suggestionsFor($, i, next) : null
  await update($, doc, cur => {
    const lines = [...cur.lines]
    lines[i] = next
    return { lines, active: i, sug }
  })
  await fit($)
  await focus($, sug !== null ? 'sug:0' : lineKey(i))
}

async function deleteLine($: $) {
  const d = await read($, doc)
  const at = Math.min(d.active, d.lines.length - 1)
  const lines = d.lines.length > 1 ? d.lines.filter((_, i) => i !== at) : ['']
  const active = Math.max(0, at - 1)
  await update($, doc, () => ({ lines, active, sug: null }))
  await fit($)
  await focus($, lineKey(active))
}

export const register: Register = (on, options) => {
  const openAction = typeof options.shortcutAction === 'string' ? options.shortcutAction : 'app:toggleReplTab'
  const sendAction = typeof options.sendAction === 'string' ? options.sendAction : 'app:toggleDiffPreSession'
  const showBand = options.showBand !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'rich',
      description: 'Abre o Rich Input: editor multi-linha com @arquivos e @pastas',
      argumentHint: '[texto]',
    })
    return next(e)
  })

  on('command.run', { command: 'rich' }, async ($, e) => {
    await openEditor($, e.args.trim())
    return { text: 'Rich Input aberto.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!showBand || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row">
        <Button key="open-rich" label="✎ Rich input" plain dimColor action={openAction} onPress={() => openEditor($)} />
        <Text dimColor> Alt+R ou /rich</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    if (!('Input' in ui)) return <Text>Este ambiente não desenha o editor; use o prompt.</Text>

    const d = await read($, doc)
    const width = String(d.lines.length).length
    // Everything is drawn to fit the pane's rows, so the engine never scrolls
    // the lines above the cursor out of view.
    const room = Math.max(1, e.props.scroll.bodyRows - CHROME_ROWS - menuRows(d))
    const { start, end } = visibleLines(d.lines.length, Math.min(d.active, d.lines.length - 1), room)
    const rows = []
    if (start > 0) rows.push(<Text dimColor>{`${' '.repeat(width)} ↑ ${start} linha(s) acima`}</Text>)
    for (let i = start; i < end; i++) {
      const isMenu = d.sug !== null && d.sug.line === i
      rows.push(
        <ui.Input
          key={lineKey(i)}
          label={`${String(i + 1).padStart(width)} │`}
          value={d.lines[i]}
          placeholder={d.lines.length === 1 ? 'Escreva o prompt… @ referencia arquivos e pastas' : undefined}
          submitLabel={isMenu ? 'aceitar' : 'nova linha'}
          autoFocus={i === d.active ? true : undefined}
          onInput={value => changeLine($, i, value)}
          onSubmit={value => submitLine($, i, value)}
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
                onPress={() => accept($, i, choice)}
              />
            </Box>,
          ),
        )
      }
    }
    if (end < d.lines.length) {
      rows.push(<Text dimColor>{`${' '.repeat(width)} ↓ ${d.lines.length - end} linha(s) abaixo`}</Text>)
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Button key="send" label="Enviar ao prompt" variant="primary" action={sendAction} onPress={() => send($)} />
          <Text> </Text>
          <Button key="delete-line" label="Apagar linha" onPress={() => deleteLine($)} />
          <Text> </Text>
          <Button key="cancel" label="Cancelar" role="dismiss" onPress={() => closeEditor($, null)} />
          <Text dimColor wrap="truncate-end">
            {'  '}Enter nova linha · Tab sugestões do @ · Ctrl+S envia · Esc sai
          </Text>
        </Box>
        {rows}
      </Box>
    )
  })

  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const moved = await next(e)
    const line = e.element?.startsWith('line:') ? Number(e.element.slice(5)) : NaN
    if (moved.deny === undefined && Number.isInteger(line)) {
      await update($, doc, d => (d.active === line ? d : { ...d, active: line }))
    }
    return moved
  })

  // Closing without sending (Esc, the close mark, Cancelar) hands the draft
  // back to the prompt box, so nothing typed is lost.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (isSending || e.origin.kind === 'unload') return closed
    const text = textOf(await read($, doc))
    if (text !== '') await $.prompt.fill({ text, mode: 'replace' })
    return closed
  })
}
