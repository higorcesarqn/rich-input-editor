/** One `@` completion: what the menu shows and what replaces `@query`. */
export type Suggestion = { label: string; insert: string; isDir: boolean }

/** The completions open under one line (by its id), for the query typed there. */
export type Suggestions = { line: number; query: string; items: Suggestion[] }

/**
 * One line of the text. Its `id` never changes while it exists: the pane keys
 * the line's field by it, so inserting or deleting another line never hands
 * this line's field (and the person's typing in it) to a different line.
 */
export type Line = { id: number; text: string }

/**
 * The text being edited, the line holding the cursor, how many times a line
 * has become the active one (each time takes a fresh field) and the open
 * completions.
 */
export type Doc = { lines: Line[]; nextId: number; active: number; epoch: number; sug: Suggestions | null }

declare module 'claude-code' {
  interface PluginState {
    'rich-input': { doc: Doc }
  }
}
