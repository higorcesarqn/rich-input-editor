# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Claude Code plugin (`rich-input`) published through this repo's own marketplace (`.claude-plugin/marketplace.json`). It makes Claude Code's own prompt box work as a multi-line editor and adds `@` completion that browses folder by folder. It is built on Claude Code's **function hooks** API (TypeScript hooks modules), which is early access; there is no `package.json`, bundler or npm dependencies — `claude-code` and `claude-code/testing` are provided by the host.

The multi-line editing is not the plugin's code: it comes from user keybindings (`Chat` context: `enter` → `chat:newline`, `ctrl+enter`/`ctrl+s` → `chat:submit`) documented in the README. The plugin adds the `@` rows, a key hint above the prompt and `/rich`.

## Commands

Run from `plugins/rich-input`:

```bash
claude plugin validate .   # manifest + hooks module
claude plugin test .       # runs tests/*.test.ts
```

Type-check (from the repo root): `npx -p typescript tsc -p plugins/rich-input`. This only works after Claude Code has loaded the plugin from disk once, because that writes the API types to `plugins/rich-input/.claude-plugin/types/` (git-ignored; `tsconfig.json` extends it).

Live development: `claude --plugin-dir plugins/rich-input` — the plugin hot-reloads on save. The installed marketplace copy of `rich-input` may also be loaded; disable it while testing a local one.

## Architecture

- `hooks/hooks.json` points the host at `hooks/register.tsx`, whose `register(on, options)` wires everything: `/rich` (registered in `session.start`, answered by `command.run`), a `prompt.autocomplete` hook matched on tokens starting with `@`, and the `AbovePrompt` hint (option `showHint`).
- `hooks/complete.ts` is pure logic (no engine access): `withDirs` builds the index entries, `complete` ranks suggestions (browse-by-folder when the query has `/`, otherwise whole-tree search), `rows` turns them into typeahead rows. Unit-test changes here directly.
- A folder's row writes `@dir/` with no trailing space so the host re-asks `prompt.autocomplete` for the new token and the folder's contents come up; a file's row ends with a space. The plugin's rows go after `next(e)`'s, and the host draws its own `@` rows above them.
- The project index comes from `git ls-files` (falls back to a bounded `$.fs.list` walk) and is cached in a module variable for 15 s; a hot reload resets it.

### Why not a pane editor (history)

Up to 0.4.1 the editor was a pane with one single-line `Input` per line. A free-cursor editor in a pane would need a `Client` surface module, which only receives keys after a mouse click, and in the author's terminal (Windows, herdr, fullscreen layout on) a `Client` got no pointer events at all. Don't reintroduce a pane editor without re-checking that. Also: `$.prompt.submit` from a plugin never expands `@file` mentions, so sending must stay with the person's own submit.

## Tests

`tests/rich-input.test.ts` uses `claude-code/testing`: pure tests call `complete`/`rows` directly; the `prompt.autocomplete` test stubs `session.cwd`/`process.run` with `on(...)` and raises the event through `$.prompt.autocomplete` (present at runtime though not in the typed `EventCalls`, hence the cast); the hint is checked with `$.ui.mount` on `AbovePrompt`.

## Releases and docs

- A release bumps the version in **both** `.claude-plugin/marketplace.json` (metadata and plugin entry) and `plugins/rich-input/.claude-plugin/plugin.json`. Commit messages read `Release X.Y.Z: <summary>`.
- `README.md` and `README.pt-BR.md` are kept in sync — any user-visible change goes into both.
