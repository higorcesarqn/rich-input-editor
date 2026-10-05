/** One `@` completion: what the menu shows and what replaces `@query`. */
export type Suggestion = { label: string; insert: string; isDir: boolean }

/** The completions open under one line, for the query typed there. */
export type Suggestions = { line: number; query: string; items: Suggestion[] }

/** The text being edited, one entry per line, and the open completions. */
export type Doc = { lines: string[]; active: number; sug: Suggestions | null }

declare module 'claude-code' {
  interface PluginState {
    'rich-input': { doc: Doc }
  }
}
