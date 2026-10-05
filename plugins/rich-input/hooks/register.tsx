import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { EditorMessage, EditorProps, Seed } from '../types'
import { complete, type Entry, withDirs } from './complete'

const PANE = 'rich-input'
const seed = atom({ plugin: 'rich-input', key: 'seed' } as const, { text: '', nonce: 0 } as Seed)
const draft = atom({ plugin: 'rich-input', key: 'draft' } as const, '')

/** Folders the fallback walk skips: build output and dependencies. */
const SKIPPED = new Set(['.git', 'node_modules', 'dist', 'build', 'out', 'target', '.next', '.venv', 'venv', '__pycache__', '.cache'])
const WALK_LIMIT = 5000
const INDEX_TTL_MS = 15_000

type $ = EngineInterface

let index: { root: string; at: number; entries: Entry[] } | null = null
let lastQuery: string | null = null
let isSending = false

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

async function editorProps($: $, query: string | null): Promise<EditorProps> {
  const { text, nonce } = await read($, seed)
  const suggestions = query === null ? [] : complete(await entries($), query)
  return { text, nonce, sugQuery: query, suggestions }
}

/** Opens the editor with what the prompt box holds, moving it out of the box. */
async function openEditor($: $, extra = '') {
  const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
  if (!isOpen) {
    const box = await $.prompt.read()
    const text = [box.text, extra].filter(t => t !== '').join(box.text.endsWith('\n') ? '' : ' ')
    await update($, seed, s => ({ text, nonce: (s?.nonce ?? 0) + 1 }))
    await update($, draft, () => text)
    lastQuery = null
    // The pane takes the keyboard only over an empty composer.
    if (box.text !== '') await $.prompt.fill({ text: '', mode: 'replace' })
  }
  await $.ui.open({ id: PANE, title: 'Rich Input', focus: true, rows: 16 })
  void entries($).catch(() => undefined)
}

async function closeEditor($: $, text: string | null) {
  isSending = text !== null
  await $.ui.close({ id: PANE })
  isSending = false
  if (text === null) return
  await update($, draft, () => '')
  const filled = await $.prompt.fill({ text, mode: 'replace' })
  if (filled.isFilled) $.ui.toast('Prompt no campo: Enter envia (as @referências são resolvidas no envio)')
}

export const register: Register = (on, options) => {
  const action = typeof options.shortcutAction === 'string' ? options.shortcutAction : 'app:toggleReplTab'
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
        <Button key="open-rich" label="✎ Rich input" plain dimColor action={action} onPress={() => openEditor($)} />
        <Text dimColor> Alt+R ou /rich</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const props = await editorProps($, null)
    const height = Math.max(4, e.props.scroll.bodyRows - 1)
    const editor =
      'Client' in ui ? (
        <ui.Client key="editor" module="./editor.tsx" props={props} width={e.props.bodyColumns} height={height} />
      ) : (
        <Text>Este ambiente não desenha o editor; use o prompt.</Text>
      )
    return (
      <Box flexDirection="column">
        {editor}
        <Box flexDirection="row">
          <Button key="send" label="Enviar ao prompt" variant="primary" onPress={async () => closeEditor($, await read($, draft))} />
          <Text> </Text>
          <Button key="cancel" label="Cancelar" role="dismiss" onPress={() => closeEditor($, null)} />
          <Text dimColor> clique no texto para editar</Text>
        </Box>
      </Box>
    )
  })

  on('ui.message', async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const msg = e.data as EditorMessage

    switch (msg.type) {
      case 'edit': {
        await update($, draft, () => msg.text)
        if (msg.query === null && lastQuery === null) return {}
        lastQuery = msg.query
        return { props: await editorProps($, msg.query) }
      }
      case 'submit':
        await update($, draft, () => msg.text)
        await closeEditor($, msg.text)
        return {}
      case 'cancel':
        await update($, draft, () => msg.text)
        await closeEditor($, null)
        return {}
      case 'copy':
        await $.ui.copy({ text: msg.text, surface: e.surface })
        return {}
    }
    return next(e)
  })

  // Closing without sending (Esc, the close mark, Cancelar) hands the draft
  // back to the prompt box, so nothing typed is lost.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (isSending || e.origin.kind === 'unload') return closed
    const text = await read($, draft)
    if (text !== '') await $.prompt.fill({ text, mode: 'replace' })
    return closed
  })
}
