import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Mode } from '../types'
import { isOn, type Keybindings, parse, withRich } from './bindings'
import { type Entry, rows, withDirs } from './complete'

/** Folders the fallback walk skips: build output and dependencies. */
const SKIPPED = new Set(['.git', 'node_modules', 'dist', 'build', 'out', 'target', '.next', '.venv', 'venv', '__pycache__', '.cache'])
const WALK_LIMIT = 5000
const INDEX_TTL_MS = 15_000
/** The theme color the draft takes while rich input is on. */
const DRAFT_COLOR = 'suggestion'
const MODE_LABEL = 'rich input'

const ON_TEXT = 'Rich input on: Enter takes a new line, Ctrl+Enter sends (Ctrl+S where the terminal sends Ctrl+Enter as Enter).'
const OFF_TEXT = 'Rich input off: Enter sends again.'

/** Whether rich input is on, as keybindings.json last read said. */
const mode = atom({ plugin: 'rich-input', key: 'mode' } as const, { isOn: false } as Mode)

type $ = EngineInterface

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

export const register: Register = (on, options) => {
  const showBand = options.showBand !== false
  const toggleAction = typeof options.toggleAction === 'string' ? options.toggleAction : 'app:toggleReplTab'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'rich',
      description: 'Turn rich input on or off: Enter takes a new line, Ctrl+Enter sends',
    })
    await sync($).catch(() => undefined)
    void entries($).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'rich' }, async $ => ({ text: await toggle($) }))

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
        <Text dimColor>{richOn ? '  Enter new line · Ctrl+Enter send · @ browses folders' : '  Alt+R or /rich to turn on'}</Text>
      </Box>
    )
  })
}
