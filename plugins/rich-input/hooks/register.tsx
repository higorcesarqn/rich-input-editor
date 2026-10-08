import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { EditorPost, EditorProps, Mode } from '../types'
import { isOn, type Keybindings, parse, withRich } from './bindings'
import { complete, type Entry, rows, withDirs } from './complete'

/** Folders the fallback walk skips: build output and dependencies. */
const SKIPPED = new Set(['.git', 'node_modules', 'dist', 'build', 'out', 'target', '.next', '.venv', 'venv', '__pycache__', '.cache'])
const WALK_LIMIT = 5000
const INDEX_TTL_MS = 15_000
/** The theme color the draft takes while rich input is on. */
const DRAFT_COLOR = 'suggestion'
const MODE_LABEL = 'rich input'

const ON_TEXT = 'Rich input on: Enter takes a new line, Ctrl+Enter sends (Ctrl+S where the terminal sends Ctrl+Enter as Enter).'
const OFF_TEXT = 'Rich input off: Enter sends again.'

const PANE = 'rich-input-pane'
/** The rows the pane asks for when it opens above the prompt, not docked. */
const PANE_ROWS = 20
const PANE_HINT = 'Enter new line · Ctrl+S puts it in the prompt · right-click pastes · @ files'
/** Programs that print the clipboard, tried in turn: Windows, macOS, Wayland, X11. */
const CLIPBOARD = [
  ['powershell', '-NoProfile', '-Command', 'Get-Clipboard -Raw'],
  ['pbpaste'],
  ['wl-paste', '-n'],
  ['xclip', '-selection', 'clipboard', '-o'],
]

/** Whether rich input is on, as keybindings.json last read said. */
const mode = atom({ plugin: 'rich-input', key: 'mode' } as const, { isOn: false } as Mode)

/** What the pane editor opens with and the answers it is handed. */
const editor = atom({ plugin: 'rich-input', key: 'editor' } as const, { initial: '', menu: null, paste: null } as EditorProps)

type $ = EngineInterface

/** The editor's last draft, and which of its asks were answered already. */
let draft = ''
let answered = { queryId: 0, send: 0, pasteId: 0 }
let isSending = false

let index: { root: string; at: number; entries: Entry[] } | null = null

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

/** Where Claude Code reads the person's keybindings from. */
async function bindingsPath($: $): Promise<string | null> {
  const dir = await $.env.get('CLAUDE_CONFIG_DIR')
  if (dir !== undefined && dir !== '') return `${dir}/keybindings.json`
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  return home === undefined || home === '' ? null : `${home}/.claude/keybindings.json`
}

/** The person's keybindings: null for no file, an error text when unreadable. */
async function load($: $, path: string): Promise<Keybindings | null | string> {
  if (!(await $.fs.exists(path))) return null
  try {
    return parse(await $.fs.read(path)) ?? `${path} is not keybindings JSON that Rich Input can edit; it was left as it is.`
  } catch {
    return `could not read ${path}.`
  }
}

/** Reads whether rich input is on, for the drawings that show it. */
async function sync($: $): Promise<void> {
  const path = await bindingsPath($)
  const kb = path === null ? null : await load($, path)
  if (typeof kb !== 'string') await update($, mode, () => ({ isOn: isOn(kb) }))
}

/** Turns rich input on or off in keybindings.json; says what happened. */
async function toggle($: $): Promise<string> {
  const path = await bindingsPath($)
  if (path === null) return 'Rich input: no home folder to find keybindings.json in.'
  const kb = await load($, path)
  if (typeof kb === 'string') return `Rich input: ${kb}`
  const on = !isOn(kb)
  await $.fs.write(path, `${JSON.stringify(withRich(kb, on), null, 2)}\n`)
  await update($, mode, () => ({ isOn: on }))
  return on ? ON_TEXT : OFF_TEXT
}

/** The clipboard's text, from the first program that prints it; '' if none. */
async function clipboard($: $): Promise<string> {
  for (const argv of CLIPBOARD) {
    try {
      const run = await $.process.run(argv, { timeoutMs: 3000 })
      if (run.exitCode === 0) return run.stdout.replace(/\r\n?/g, '\n').replace(/\n$/, '')
    } catch {
      // Not installed here: try the next one.
    }
  }
  return ''
}

/** Opens the pane editor with what the prompt box holds, moving it out of the box. */
async function openPane($: $): Promise<string> {
  const box = await $.prompt.read()
  draft = box.text
  answered = { queryId: 0, send: 0, pasteId: 0 }
  await update($, editor, () => ({ initial: box.text, menu: null, paste: null }))
  if (box.text !== '') await $.prompt.fill({ text: '', mode: 'replace' })
  const opened = await $.ui.open({ id: PANE, title: 'Rich Input', rows: PANE_ROWS })
  void entries($).catch(() => undefined)
  return opened.isPlaced ? `Rich Input pane opened. ${PANE_HINT}.` : `Rich Input pane waits: ${opened.reason ?? 'no room'}`
}

/** Closes the pane; with a text, puts it in the prompt box to be sent. */
async function closePane($: $, text: string | null) {
  isSending = text !== null
  await $.ui.close({ id: PANE })
  isSending = false
  if (text === null) return
  draft = ''
  const filled = await $.prompt.fill({ text, mode: 'replace' })
  if (filled.isFilled) $.ui.toast('Text is in the prompt: press Enter to send (@ references are resolved on send)')
}

/** Opens the pane editor, or closes it handing the draft back; says which. */
async function togglePane($: $): Promise<string> {
  if ((await $.ui.panes()).some(p => p.id === PANE)) {
    await closePane($, null)
    return 'Rich Input pane closed; the draft is back in the prompt.'
  }
  return openPane($)
}

/** What the editor posted: keep its draft, answer a new query, paste or send. */
async function heard($: $, post: EditorPost) {
  draft = post.draft
  if (post.query !== null && post.queryId > answered.queryId) {
    answered = { ...answered, queryId: post.queryId }
    const items = complete(await entries($), post.query)
    await update($, editor, ed => ({ ...ed, menu: { queryId: post.queryId, items } }))
  }
  if (post.pasteId > answered.pasteId) {
    answered = { ...answered, pasteId: post.pasteId }
    const text = await clipboard($)
    if (text !== '') await update($, editor, ed => ({ ...ed, paste: { id: post.pasteId, text } }))
  }
  if (post.send > answered.send) {
    answered = { ...answered, send: post.send }
    await closePane($, post.draft)
  }
}

const isPost = (data: unknown): data is EditorPost => {
  const d = data as EditorPost
  return (
    typeof d === 'object' && d !== null && typeof d.draft === 'string' && (d.query === null || typeof d.query === 'string') &&
    typeof d.queryId === 'number' && typeof d.send === 'number' && typeof d.pasteId === 'number'
  )
}

export const register: Register = (on, options) => {
  const showBand = options.showBand !== false
  const toggleAction = typeof options.toggleAction === 'string' ? options.toggleAction : 'app:toggleReplTab'
  const paneAction = typeof options.paneAction === 'string' ? options.paneAction : 'app:toggleDiffPreSession'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'rich',
      description: 'Turn rich input on or off (Enter new line, Ctrl+Enter send); /rich pane opens the editor pane',
      argumentHint: '[pane]',
    })
    await sync($).catch(() => undefined)
    void entries($).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'rich' }, async ($, e) => {
    return { text: e.args.trim() === 'pane' ? await togglePane($) : await toggle($) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    if (!('Client' in ui)) return <Text>This surface can't draw the editor; use /rich for the prompt box instead.</Text>
    const props = await read($, editor)
    const height = Math.max(3, e.props.scroll.bodyRows - 1)
    return (
      <Box flexDirection="column">
        <Text dimColor wrap="truncate-end">
          {PANE_HINT}
        </Text>
        <ui.Client key="editor" module="./editor.tsx" props={props} height={height} />
      </Box>
    )
  })

  on('ui.message', { requestId: PANE }, async ($, e) => {
    if (isPost(e.data)) await heard($, e.data)
    return {}
  })

  // Closing without sending (the close mark, /rich pane) hands the draft back
  // to the prompt box, so nothing typed is lost.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (isSending || e.origin.kind === 'unload') return closed
    if (draft !== '') await $.prompt.fill({ text: draft, mode: 'replace' })
    draft = ''
    return closed
  })

  // The `@` rows join beneath the prompt box's own: taking a folder leaves the
  // cursor in it, and the box asks again for what it holds.
  on('prompt.autocomplete', { token: /^@/ }, async ($, e, next) => {
    const before = await next(e)
    return { suggestions: [...before.suggestions, ...rows(await entries($), e.token)] }
  })

  // While on, the draft takes a color; the engine's own runs (a mention's)
  // come after it and win where they paint.
  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    if (!(await read($, mode)).isOn || box.text === '') return box
    return { ...box, decorations: [{ start: 0, end: box.text.length, color: DRAFT_COLOR }, ...(box.decorations ?? [])] }
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (!(await read($, mode)).isOn) return next(e)
    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, MODE_LABEL] } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!showBand || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const { isOn: richOn } = await read($, mode)
    return (
      <Box flexDirection="row">
        <Button
          key="toggle-rich"
          label={richOn ? '✎ Rich input: on' : '✎ Rich input: off'}
          plain
          dimColor={!richOn}
          action={toggleAction}
          onPress={async () => $.ui.toast(await toggle($))}
        />
        <Text dimColor>{richOn ? '  Enter new line · Ctrl+Enter send  ' : '  Alt+R  '}</Text>
        <Button key="open-pane" label="▤ Editor" plain dimColor action={paneAction} onPress={async () => $.ui.toast(await togglePane($))} />
        <Text dimColor>  Alt+E</Text>
      </Box>
    )
  })
}
