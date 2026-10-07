import type { EngineInterface, Register } from 'claude-code'

import { type Entry, rows, withDirs } from './complete'

/** Folders the fallback walk skips: build output and dependencies. */
const SKIPPED = new Set(['.git', 'node_modules', 'dist', 'build', 'out', 'target', '.next', '.venv', 'venv', '__pycache__', '.cache'])
const WALK_LIMIT = 5000
const INDEX_TTL_MS = 15_000

const HINT = '✎ Enter new line · Ctrl+Enter send · @ browses folders'
const HELP = [
  'Rich Input: the prompt box is the editor.',
  '  Enter      new line, where the cursor is',
  '  Ctrl+Enter send (Ctrl+S where the terminal sends Ctrl+Enter as Enter)',
  '  @          browse files folder by folder: the rows under the prompt\'s own',
  'Enter and Ctrl+Enter need the Chat bindings in ~/.claude/keybindings.json; the README has them.',
].join('\n')

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

export const register: Register = (on, options) => {
  const showHint = options.showHint !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'rich',
      description: 'How Rich Input works: the prompt box as a multi-line editor with @ folder browsing',
    })
    void entries($).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'rich' }, async () => ({ text: HELP }))

  // The `@` rows join beneath the prompt box's own: taking a folder leaves the
  // cursor in it, and the box asks again for what it holds.
  on('prompt.autocomplete', { token: /^@/ }, async ($, e, next) => {
    const before = await next(e)
    return { suggestions: [...before.suggestions, ...rows(await entries($), e.token)] }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!showHint || e.props.hasSurvey) return next(e)
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>{HINT}</Text>
  })
}
