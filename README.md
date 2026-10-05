# Rich Input Editor for Claude Code

**English** · [Português](README.pt-BR.md)

A [Warp-style Rich Input Editor](https://docs.warp.dev/agents/cli-agents/rich-input/) for Claude Code, built as a plugin. It gives you a multi-line editor pane inside the terminal, with `@` autocomplete for files **and folders**. When you're done, it puts the text back in the Claude Code prompt.

## Why

Claude Code already has `Ctrl+G`, which opens the prompt in your `$EDITOR`. But in an external editor you lose `@` autocomplete, so you have to type file paths from memory. This plugin keeps you inside Claude Code and completes `@` mentions as you type, one folder at a time.

## Features

- **Multi-line editor in a pane.** It takes the keyboard as soon as it opens: no mouse needed, so it works in any terminal. The line you're on is an input field; the other lines stay drawn as text, and moving onto one (arrows, Tab, or a click) lets you edit it. The pane grows with the text.
- **`@` autocomplete for files and folders:**
  - `@` lists the top level of the project.
  - The suggestions appear as numbered buttons under the line. Press **Tab** to reach them, or **Enter** to take the first one.
  - Accepting a folder opens its contents right away (`@src/` → `@src/lib/` → file).
  - A bare name (`@parse`) searches the whole project.
  - Uses `git ls-files`, so `.gitignore` is respected. Outside a git repository it walks the folders instead (up to 5,000 entries, skipping `node_modules`, `dist`, etc.).
  - Paths with spaces are quoted (`@"docs/my notes.md"`), the same way the native prompt does it.
- **Pasting** text with several lines splits it into lines.
- **Your draft is never lost:** whatever is in the prompt moves into the editor when it opens. Closing the editor (`Esc`, close mark, Cancel) puts the draft back in the prompt.
- **Opens three ways:** a keyboard shortcut, the `/rich` command, or the **✎ Rich input** button above the prompt.

## Requirements

- Claude Code **2.1.289 or newer**. The plugin uses Claude Code's *function hooks* API (TypeScript hooks modules with UI panes), which is in **early access** and may change between releases.

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

## Keyboard shortcuts

Plugins can't register keys of their own. Instead, the plugin's buttons listen to Claude Code keybinding *actions*, and you bind keys to those actions:

- the **✎ Rich input** button (opens the editor) listens to `app:toggleReplTab`;
- the **Enviar ao prompt** button (sends the text) listens to `app:toggleDiffPreSession`.

Add this to `~/.claude/keybindings.json` (create the file if it doesn't exist) to open the editor with **Alt+R** and send with **Ctrl+S**:

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
    },
    {
      "context": "PaneField",
      "bindings": {
        "ctrl+s": "app:toggleDiffPreSession"
      }
    }
  ]
}
```

If one of those actions is already in use in your setup, pick another action with no handler and set it in the plugin's `shortcutAction` or `sendAction` option (`/plugin configure rich-input@rich-input-editor`, or `/config`). The open shortcut only works while the button row above the prompt is visible (`showBand`, on by default). Without the shortcuts you can still use `/rich`, and **Tab** to the **Enviar ao prompt** button.

## Usage

1. Open the editor: **Alt+R**, `/rich`, or the **✎ Rich input** button. `/rich some text` opens it with that text.
2. Write. **Enter** opens a new line below. Type `@` to mention files and folders.
3. Press **Ctrl+S** (or Tab to **Enviar ao prompt** and press Enter). The editor closes and the text goes to the Claude Code prompt.
4. Press **Enter** to send it.

### Keys

| Key | Action |
| --- | --- |
| `Enter` | New line below (with `@` suggestions open: take the first one) |
| `↑` `↓` / `Tab` / `Shift+Tab` | Move between lines, suggestions and buttons (landing on a line edits it) |
| `1`–`9` | Take that suggestion (while a suggestion has the focus) |
| `Ctrl+S` | Send the text to the prompt (needs the keybinding above) |
| **Apagar linha** button | Delete the current line |
| `Esc` | Leave the editor (the draft goes back to the prompt) |

### Why "send" fills the prompt instead of sending directly

Claude Code doesn't expand `@file` mentions in a prompt that a plugin submits; it only does that for prompts you submit yourself. To keep your `@` references working, the editor puts the text in the native prompt and you press Enter. This also gives you one last look before sending.

## Known limitations

- **Enter always opens a new line *below*.** The plugin can't see where the cursor is inside a line, so it can't split a line in two.
- **Lines are deleted with the "Apagar linha" button,** not with Backspace on an empty line.
- **Suggestions assume you're typing at the end of the line.** An `@` mention in the middle of a line is completed from the end of the line.
- **No image attachments.** Paste images into the native prompt (`Ctrl+V` / `Alt+V`) after sending the text there.
- The editor's on-screen text (button labels, hints) is in Portuguese.
- The pane opens **above** the prompt (or beside the transcript in fullscreen). Claude Code doesn't let plugins place a pane below the prompt.

## How it works

```
plugins/rich-input/
├── .claude-plugin/plugin.json   manifest and options (shortcutAction, sendAction, showBand)
├── hooks/
│   ├── hooks.json               points Claude Code at register.tsx
│   ├── register.tsx             /rich command, pane (the active line as an Input, the others as rows), buttons, @ index, hand-back to the prompt
│   └── complete.ts              @ completion: browse by folder, fuzzy search, mention detection
├── types/index.d.ts             shared types and the plugin's state contract
└── tests/rich-input.test.ts     tests (claude plugin test)
```

`register.tsx` opens a pane with `$.ui.open` and draws the active line as an `Input` and the other lines as rows that make their line active when focused. Each line has a stable id, so its field never passes to another line. The lines are kept in the plugin's state. Each change of a line checks whether it ends in an `@` mention. If it does, `register.tsx` draws the suggestions as buttons under that line, from a project index it caches for 15 seconds. On send, `register.tsx` closes the pane and puts the text in the prompt with `$.prompt.fill`.

## Development

```bash
cd plugins/rich-input
claude plugin validate .   # checks the manifest and the hooks module
claude plugin test .       # runs tests/*.test.ts
```

Once Claude Code has loaded the plugin from disk, it writes the API types to `.claude-plugin/types/` (ignored by git). After that, `npx -p typescript tsc -p plugins/rich-input` type-checks the plugin.

For live editing, run `claude --plugin-dir plugins/rich-input`. The plugin reloads by itself when you save a file.
