/** What the editor opens with; a new `nonce` re-seeds a running editor. */
export type Seed = { text: string; nonce: number }

/** One `@` completion: what the menu shows and what replaces `@query`. */
export type Suggestion = { label: string; insert: string; isDir: boolean }

/** The props the pane hands the editor's `Client`. */
export type EditorProps = {
  text: string
  nonce: number
  /** The `@` query `suggestions` answer; null when none is open. */
  sugQuery: string | null
  suggestions: Suggestion[]
}

/** What the editor posts to the hooks module. */
export type EditorMessage =
  | { type: 'edit'; text: string; query: string | null }
  | { type: 'submit'; text: string }
  | { type: 'cancel'; text: string }
  | { type: 'copy'; text: string }

declare module 'claude-code' {
  interface PluginState {
    'rich-input': { seed: Seed; draft: string }
  }
}
