/**
 * Rich input on or off is two entries of the `Chat` block of the person's
 * keybindings.json: Enter takes a new line, Ctrl+Enter sends. Turning it off
 * removes only those entries, and only while they still say what we wrote.
 */
export const RICH: Readonly<Record<string, string>> = { enter: 'chat:newline', 'ctrl+enter': 'chat:submit' }

export type Block = { context: string; bindings: Record<string, string | null> }
export type Keybindings = { bindings: Block[]; [key: string]: unknown }

const FRESH = {
  $schema: 'https://www.schemastore.org/claude-code-keybindings.json',
  $docs: 'https://code.claude.com/docs/en/keybindings',
}

/** The file's JSON as keybindings, or null when its shape is not one. */
export function parse(text: string): Keybindings | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const bindings = (data as { bindings?: unknown }).bindings ?? []
  if (!Array.isArray(bindings)) return null
  const isBlock = (b: unknown) =>
    typeof b === 'object' && b !== null && typeof (b as Block).context === 'string' && typeof (b as Block).bindings === 'object'
  if (!bindings.every(isBlock)) return null
  return { ...(data as object), bindings: bindings as Block[] }
}

/** Whether Enter takes a new line in the prompt box. */
export function isOn(kb: Keybindings | null): boolean {
  return kb?.bindings.some(b => b.context === 'Chat' && b.bindings.enter === RICH.enter) ?? false
}

/** The keybindings with rich input turned on or off; null stands for no file. */
export function withRich(kb: Keybindings | null, on: boolean): Keybindings {
  const base: Keybindings = kb ?? { ...FRESH, bindings: [] }
  let blocks = base.bindings.map(b => ({ ...b, bindings: { ...b.bindings } }))
  if (on) {
    let chat = blocks.find(b => b.context === 'Chat')
    if (chat === undefined) {
      chat = { context: 'Chat', bindings: {} }
      blocks.push(chat)
    }
    Object.assign(chat.bindings, RICH)
  } else {
    for (const b of blocks) {
      if (b.context !== 'Chat') continue
      for (const [key, action] of Object.entries(RICH)) if (b.bindings[key] === action) delete b.bindings[key]
    }
    blocks = blocks.filter(b => b.context !== 'Chat' || Object.keys(b.bindings).length > 0)
  }
  return { ...base, bindings: blocks }
}
