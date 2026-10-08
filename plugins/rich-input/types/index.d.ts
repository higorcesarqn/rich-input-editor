/** One `@` completion: what the row shows and what replaces `@query`. */
export type Suggestion = { label: string; insert: string; isDir: boolean }

/** Whether rich input is on, as the person's keybindings.json last said. */
export type Mode = { isOn: boolean }

/**
 * What the pane editor is handed: the text it opens with, and the hooks
 * module's answers to what it asked (completions for a query, a paste).
 */
export type EditorProps = {
  initial: string
  menu: { queryId: number; items: Suggestion[] } | null
  paste: { id: number; text: string } | null
}

/** What the editor posts on every change: the whole of what it asks. */
export type EditorPost = { draft: string; query: string | null; queryId: number; send: number; pasteId: number }

declare module 'claude-code' {
  interface PluginState {
    'rich-input': { mode: Mode; editor: EditorProps }
  }
}
