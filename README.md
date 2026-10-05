# Rich Input Editor for Claude Code

**English** · [Português](README.pt-BR.md)

A [Warp-style Rich Input Editor](https://docs.warp.dev/agents/cli-agents/rich-input/) for Claude Code, built as a plugin. It gives you a multi-line editor pane inside the terminal, with `@` autocomplete for files **and folders**. When you're done, it puts the text back in the Claude Code prompt.

## Why

Claude Code already has `Ctrl+G`, which opens the prompt in your `$EDITOR`. But in an external editor you lose `@` autocomplete, so you have to type file paths from memory. This plugin keeps you inside Claude Code and completes `@` mentions as you type, one folder at a time.

## Features

- **Multi-line editor** in a pane, with soft wrapping, line and column display, and mouse support (click to place the cursor, drag to select).
- **`@` autocomplete for files and folders:**
  - `@` lists the top level of the project.
  - Accepting a folder keeps the menu open on its contents (`@src/` → `@src/lib/` → file).
  - A bare name (`@parse`) searches the whole project.
  - Uses `git ls-files`, so `.gitignore` is respected. Outside a git repository it walks the folders instead (up to 5,000 entries, skipping `node_modules`, `dist`, etc.).
  - Paths with spaces are quoted (`@"docs/my notes.md"`), the same way the native prompt does it.
- **Editing keys:** word navigation (`Ctrl/Alt+←/→`), selection (`Shift+arrows`, `Ctrl+A`), undo and redo (`Ctrl+Z`/`Ctrl+Y`), and `Ctrl+W`/`Ctrl+U`/`Ctrl+K`.
- **Your draft is never lost:** whatever is in the prompt moves into the editor when it opens. Closing the editor (`Esc`, close mark, Cancel) puts the draft back in the prompt.
- **Opens three ways:** a keyboard shortcut, the `/rich` command, or the **✎ Rich input** button above the prompt.

## Requirements

- Claude Code **2.1.289 or newer**. The plugin uses Claude Code's *function hooks* API (TypeScript hooks modules with UI panes), which is in **early access** and may change between releases.
- A terminal that sends mouse clicks to Claude Code. You click into the editor to type in it (see [Known limitations](#known-limitations)).

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

## Keyboard shortcut

Plugins can't register a key of their own. Instead, the **✎ Rich input** button listens to a Claude Code keybinding *action*, and you bind a key to that action. By default the action is `app:toggleReplTab`.

Add this to `~/.claude/keybindings.json` (create the file if it doesn't exist) to open the editor with **Alt+R**:

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

If `app:toggleReplTab` is already in use in your setup, pick another action with no handler and set it in the plugin's `shortcutAction` option (`/plugin configure rich-input@rich-input-editor`, or `/config`). The shortcut only works while the button row above the prompt is visible (`showBand`, on by default).

## Usage

1. Open the editor: **Alt+R**, `/rich`, or the **✎ Rich input** button. `/rich some text` opens it with that text.
2. **Click in the text area** to give it the keyboard.
3. Write. Type `@` to mention files and folders.
4. Press **Ctrl+S** (or the **Enviar ao prompt** button). The editor closes and the text goes to the Claude Code prompt.
5. Press **Enter** to send it.

### Keys

| Key | Action |
| --- | --- |
| `Enter` / `Ctrl+J` | New line |
| `Ctrl+S` / `Ctrl+Enter` | Send the text to the prompt |
| `@` | Open file/folder autocomplete |
| `↑` `↓` | Choose a suggestion (when the menu is open) |
| `Tab` / `Enter` | Accept a suggestion (when the menu is open) |
| `←` `→` `↑` `↓` `Home` `End` `PgUp` `PgDn` | Move the cursor |
| `Ctrl+←/→`, `Alt+B`/`Alt+F` | Move by word |
| `Shift` + movement | Select |
| `Ctrl+A` | Select all |
| `Backspace` / `Delete` (`Ctrl/Alt+` deletes a word) | Delete |
| `Ctrl+W` / `Ctrl+U` / `Ctrl+K` | Delete word back / to line start / to line end |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+Q` | Cancel (the draft goes back to the prompt) |
| `Esc` | Leave the editor (the draft goes back to the prompt) |

### Why "send" fills the prompt instead of sending directly

Claude Code doesn't expand `@file` mentions in a prompt that a plugin submits; it only does that for prompts you submit yourself. To keep your `@` references working, the editor puts the text in the native prompt and you press Enter. This also gives you one last look before sending.

## Known limitations

- **You have to click in the editor before typing.** Claude Code only sends keys to a plugin's editor area after a click on it. If your terminal doesn't send mouse events, the editor can't receive keys.
- **Tab** may move focus between the pane's buttons before the editor gets it. If that happens, accept suggestions with **Enter**.
- **Ctrl+C** (copy the selection) may be taken by Claude Code itself. Pasting with your terminal's paste works.
- **No image attachments.** Paste images into the native prompt (`Ctrl+V` / `Alt+V`) after sending the text there.
- The editor's on-screen text (button labels, hints) is in Portuguese.

## How it works

```
plugins/rich-input/
├── .claude-plugin/plugin.json   manifest and options (shortcutAction, showBand)
├── hooks/
│   ├── hooks.json               points Claude Code at register.tsx
│   ├── register.tsx             /rich command, pane, shortcut button, @ index, hand-back to the prompt
│   ├── editor.tsx               the editor (a Client surface module: keys, mouse, drawing)
│   ├── buffer.ts                text model: cursor, selection, wrapping, @ mention detection
│   └── complete.ts              @ completion: browse by folder, fuzzy search
├── types/index.d.ts             shared types and the plugin's state contract
└── tests/rich-input.test.ts     tests (claude plugin test)
```

`register.tsx` opens a pane with `$.ui.open` and draws a `Client` that runs `editor.tsx`. The editor posts every edit, with the `@` query under the cursor, to `register.tsx`. `register.tsx` answers with suggestions from a project index it caches for 15 seconds. On send, `register.tsx` closes the pane and puts the text in the prompt with `$.prompt.fill`.

## Development

```bash
cd plugins/rich-input
claude plugin validate .   # checks the manifest and the hooks module
claude plugin test .       # runs tests/*.test.ts
```

Once Claude Code has loaded the plugin from disk, it writes the API types to `.claude-plugin/types/` (ignored by git). After that, `npx -p typescript tsc -p plugins/rich-input` type-checks the plugin.

For live editing, run `claude --plugin-dir plugins/rich-input`. The plugin reloads by itself when you save a file.
