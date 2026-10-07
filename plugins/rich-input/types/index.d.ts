/** One `@` completion: what the row shows and what replaces `@query`. */
export type Suggestion = { label: string; insert: string; isDir: boolean }

/** Whether rich input is on, as the person's keybindings.json last said. */
export type Mode = { isOn: boolean }

declare module 'claude-code' {
  interface PluginState {
    'rich-input': { mode: Mode }
  }
}
