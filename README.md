# Rich Input Editor for Claude Code

**English** · [Português](README.pt-BR.md)

A [Warp-style Rich Input Editor](https://docs.warp.dev/agents/cli-agents/rich-input/) for Claude Code, built as a plugin. It turns Claude Code's own prompt box into a multi-line editor: **Enter** starts a new line where the cursor is, **Ctrl+Enter** sends, and `@` completes files **and folders**, one folder at a time.

## Why

Claude Code already has `Ctrl+G`, which opens the prompt in your `$EDITOR`. But in an external editor you lose `@` autocomplete, so you have to type file paths from memory. And in the plain prompt box, Enter sends, so writing several lines takes `Shift+Enter` or `\` at each line end. With this plugin the prompt box itself works like an editor.

## Features

- **The prompt box is the editor.** The cursor moves freely: arrows, Home/End, Enter in the middle of a line splits it, Backspace at the start of a line joins it to the one above. Pasting, images and your prompt history work as usual, because it is Claude Code's own box.
- **`@` completion that browses folders:**
  - `@` lists the top level of the project.
  - The plugin's rows appear under the prompt's own suggestions. Taking a folder (`@src/`) keeps the mention open and lists that folder's contents, so you go `@src/` → `@src/lib/` → file.
  - A bare name (`@parse`) searches the whole project.
  - Uses `git ls-files`, so `.gitignore` is respected. Outside a git repository it walks the folders instead (up to 5,000 entries, skipping `node_modules`, `dist`, etc.).
  - Paths with spaces are quoted (`@"docs/my notes.md"`), the same way the native prompt does it.
- **A hint above the prompt** reminds you of the keys (`showHint`, on by default).
- **`/rich`** prints how it works.

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

## Keyboard setup (required)

Plugins can't change what Enter does in the prompt box, but Claude Code's keybindings can. Add this to `~/.claude/keybindings.json` (create the file if it doesn't exist):

```json
{
  "$schema": "https://www.schemastore.org/claude-code-keybindings.json",
  "$docs": "https://code.claude.com/docs/en/keybindings",
  "bindings": [
    {
      "context": "Chat",
      "bindings": {
        "enter": "chat:newline",
        "ctrl+enter": "chat:submit",
        "ctrl+s": "chat:submit"
      }
    }
  ]
}
```

- **Enter** inserts a new line. While the `@` suggestions are open, Enter still takes the highlighted one.
- **Ctrl+Enter** sends. Some terminals send Ctrl+Enter as a plain Enter; there, use **Ctrl+S**.

This changes Enter in every Claude Code session. To go back, remove the `Chat` block.

Coming from 0.4: the editor pane is gone, so the `app:toggleReplTab` and `app:toggleDiffPreSession` bindings it used can be removed.

## Keys

| Key | Action |
| --- | --- |
| `Enter` | New line where the cursor is (with `@` suggestions open: take the highlighted one) |
| `Ctrl+Enter` / `Ctrl+S` | Send the prompt |
| `←` `→` `↑` `↓` `Home` `End` | Move the cursor |
| `Backspace` at the start of a line | Join it to the line above |
| `@` | Complete files and folders; taking a folder lists its contents |

## How it works

```
plugins/rich-input/
├── .claude-plugin/plugin.json   manifest and the showHint option
├── hooks/
│   ├── hooks.json               points Claude Code at register.tsx
│   ├── register.tsx             /rich, the hint above the prompt, the @ rows, the project index
│   └── complete.ts              @ completion: browse by folder, fuzzy search, typeahead rows
├── types/index.d.ts             shared types
└── tests/rich-input.test.ts     tests (claude plugin test)
```

`register.tsx` hooks `prompt.autocomplete` for tokens that start with `@`. It adds rows to the prompt box's typeahead from a project index it caches for 15 seconds. A folder's row writes `@folder/` and leaves the cursor in the mention, so Claude Code asks again and the folder's contents come up. The multi-line editing itself is Claude Code's prompt box with the keybindings above.

Earlier versions (up to 0.4) drew their own editor in a pane. A pane only offers single-line fields there, so it couldn't have a free cursor or join lines with Backspace; the prompt box can.

## Development

```bash
cd plugins/rich-input
claude plugin validate .   # checks the manifest and the hooks module
claude plugin test .       # runs tests/*.test.ts
```

Once Claude Code has loaded the plugin from disk, it writes the API types to `.claude-plugin/types/` (ignored by git). After that, `npx -p typescript tsc -p plugins/rich-input` type-checks the plugin.

For live editing, run `claude --plugin-dir plugins/rich-input`. The plugin reloads by itself when you save a file.

## License

[MIT](LICENSE) © Higor César
