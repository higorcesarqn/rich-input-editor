# Rich Input Editor for Claude Code

**English** · [Português](README.pt-BR.md)

A [Warp-style Rich Input Editor](https://docs.warp.dev/agents/cli-agents/rich-input/) for Claude Code, built as a plugin. It turns Claude Code's own prompt box into a multi-line editor that you switch on and off: while it's on, **Enter** starts a new line where the cursor is and **Ctrl+Enter** sends. `@` completes files **and folders**, one folder at a time.

## Why

Claude Code already has `Ctrl+G`, which opens the prompt in your `$EDITOR`. But in an external editor you lose `@` autocomplete, so you have to type file paths from memory. And in the plain prompt box, Enter sends, so writing several lines takes `Shift+Enter` or `\` at each line end. With this plugin the prompt box itself works like an editor when you want it to.

## Features

- **The prompt box is the editor.** The cursor moves freely: arrows, Home/End, Enter in the middle of a line splits it, Backspace at the start of a line joins it to the one above. Pasting, images and your prompt history work as usual, because it is Claude Code's own box.
- **On and off with one key:** `Alt+R` or `/rich`. Off, Enter sends as usual.
- **You can see when it's on:** the text you type turns blue, `rich input` shows in the footer under the prompt, and the row above the prompt says `✎ Rich input: on`.
- **`@` completion that browses folders:**
  - `@` lists the top level of the project.
  - The plugin's rows appear under the prompt's own suggestions. Taking a folder (`@src/`) keeps the mention open and lists that folder's contents, so you go `@src/` → `@src/lib/` → file.
  - A bare name (`@parse`) searches the whole project.
  - Uses `git ls-files`, so `.gitignore` is respected. Outside a git repository it walks the folders instead (up to 5,000 entries, skipping `node_modules`, `dist`, etc.).
  - Paths with spaces are quoted (`@"docs/my notes.md"`), the same way the native prompt does it.

## Requirements

- Claude Code **2.1.292 or newer**. The plugin uses Claude Code's *function hooks* API (TypeScript hooks modules), which is in **early access** and may change between releases.

## Installation

### Option 1: from GitHub (recommended)

```bash
claude plugin marketplace add higorcesarqn/rich-input-editor
claude plugin install rich-input@rich-input-editor
```

Or, from inside a Claude Code session:

```
/plugin marketplace add higorcesarqn/rich-input-editor
/plugin install rich-input@rich-input-editor
/reload-plugins
```

To update later:

```bash
claude plugin marketplace update rich-input-editor
claude plugin update rich-input@rich-input-editor
```

### Option 2: from a local clone

```bash
git clone https://github.com/higorcesarqn/rich-input-editor.git
claude --plugin-dir ./rich-input-editor/plugins/rich-input
```

`--plugin-dir` loads the plugin for that session only. To load it every time, install it from the local marketplace instead:

```bash
claude plugin marketplace add ./rich-input-editor
claude plugin install rich-input@rich-input-editor
```

## Turning it on and off

Run `/rich`, or press `Alt+R`, to switch. Plugins can't change what Enter does in the prompt box, but Claude Code's keybindings can, so switching edits the `Chat` block of `~/.claude/keybindings.json`:

- **On** adds `"enter": "chat:newline"` and `"ctrl+enter": "chat:submit"`.
- **Off** removes those two entries, and only while they still say that. Everything else in the file stays as it is.

Claude Code picks the change up right away, and it applies to every session, since the file is shared. If the file isn't JSON the plugin can edit, it's left alone and `/rich` says so.

Some terminals send Ctrl+Enter as a plain Enter. There, add another key for sending to the `Chat` block yourself, for example `"ctrl+s": "chat:submit"`; switching off leaves it in place.

### The Alt+R shortcut

Plugins can't register keys of their own. The `✎ Rich input` button above the prompt listens to the `app:toggleReplTab` action, and you bind a key to that action. Add this to `~/.claude/keybindings.json` (create the file if it doesn't exist):

```json
{
  "$schema": "https://www.schemastore.org/claude-code-keybindings.json",
  "$docs": "https://code.claude.com/docs/en/keybindings",
  "bindings": [
    {
      "context": "Global",
      "bindings": {
        "alt+r": "app:toggleReplTab"
      }
    }
  ]
}
```

If that action is already in use in your setup, pick another action with no handler and set it in the plugin's `toggleAction` option (`/plugin configure rich-input@rich-input-editor`, or `/config`). The shortcut only works while the row above the prompt is visible (`showBand`, on by default).

Coming from 0.4: the editor pane is gone. Keep the `alt+r` binding; the `app:toggleDiffPreSession` one in the `PaneField` context can be removed.

## Keys

| Key | Action |
| --- | --- |
| `Alt+R` / `/rich` | Turn rich input on or off |
| `Enter` | On: new line where the cursor is (with `@` suggestions open: take the highlighted one). Off: send |
| `Ctrl+Enter` | On: send |
| `←` `→` `↑` `↓` `Home` `End` | Move the cursor |
| `Backspace` at the start of a line | Join it to the line above |
| `@` | Complete files and folders; taking a folder lists its contents |

## How it works

```
plugins/rich-input/
├── .claude-plugin/plugin.json   manifest and options (toggleAction, showBand)
├── hooks/
│   ├── hooks.json               points Claude Code at register.tsx
│   ├── register.tsx             /rich, the row above the prompt, the footer label, the blue draft, the @ rows
│   ├── bindings.ts              turning the Chat bindings in keybindings.json on and off
│   └── complete.ts              @ completion: browse by folder, fuzzy search, typeahead rows
├── types/index.d.ts             shared types and the plugin's state contract
└── tests/rich-input.test.tsx    tests (claude plugin test)
```

`register.tsx` reads `keybindings.json` when the session starts and keeps whether rich input is on in the plugin's state. `/rich` and the button rewrite the file through `bindings.ts`. While it's on, a `prompt.edit` hook paints the draft, and the footer's mode list gets `rich input`. A `prompt.autocomplete` hook adds the `@` rows from a project index cached for 15 seconds; a folder's row leaves the cursor in the mention, so Claude Code asks again and the folder's contents come up.

Earlier versions (up to 0.4) drew their own editor in a pane. A pane only offers single-line fields there, so it couldn't have a free cursor or join lines with Backspace; the prompt box can.

## Development

```bash
cd plugins/rich-input
claude plugin validate .   # checks the manifest and the hooks module
claude plugin test .       # runs tests/*.test.tsx
```

Once Claude Code has loaded the plugin from disk, it writes the API types to `.claude-plugin/types/` (ignored by git). After that, `npx -p typescript tsc -p plugins/rich-input` type-checks the plugin.

For live editing, run `claude --plugin-dir plugins/rich-input`. The plugin reloads by itself when you save a file.

## License

[MIT](LICENSE) © Higor César
