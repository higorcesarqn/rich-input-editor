import type { Suggestion } from '../types'
import { mentionAt } from './complete'

/** The `@` completions open under the cursor, and the one picked. */
export type Menu = { items: Suggestion[]; index: number }

/**
 * The editor: its lines, the cursor, the first line in view, the `@` menu,
 * and the counters it posts to the hooks module. A post replaces one still
 * undelivered, so each carries the whole of what is asked: the draft, the
 * mention being completed (`query`, numbered by `queryId`), and how many
 * sends and pastes were asked so far.
 */
export type Ed = {
  lines: string[]
  row: number
  col: number
  top: number
  menu: Menu | null
  query: string | null
  queryId: number
  send: number
  pasteId: number
}

export type Key = { key: string; ctrl?: true; shift?: true; meta?: true }

/** How many completions the menu shows. */
export const MENU_SIZE = 8

export function fresh(text: string): Ed {
  const lines = text === '' ? [''] : text.split(/\r?\n/)
  const row = lines.length - 1
  return { lines, row, col: lines[row]!.length, top: 0, menu: null, query: null, queryId: 0, send: 0, pasteId: 0 }
}

export const textOf = (ed: Ed) => ed.lines.join('\n')

const line = (ed: Ed) => ed.lines[ed.row]!

/** The cursor moved or the text changed: which mention, if any, it is in now. */
function settle(ed: Ed): Ed {
  const m = mentionAt(line(ed), ed.col)
  if (m === null) return ed.query === null && ed.menu === null ? ed : { ...ed, query: null, menu: null }
  if (m.query === ed.query) return ed
  return { ...ed, query: m.query, queryId: ed.queryId + 1 }
}

/** Puts `text` at the cursor; a newline in it starts a new line. */
export function insert(ed: Ed, text: string): Ed {
  const parts = text.replace(/\r\n?/g, '\n').split('\n')
  const cur = line(ed)
  const before = cur.slice(0, ed.col)
  const after = cur.slice(ed.col)
  const added = parts.map((p, i) => (i === 0 ? before + p : p))
  const last = added.length - 1
  const col = added[last]!.length
  added[last] += after
  const lines = [...ed.lines.slice(0, ed.row), ...added, ...ed.lines.slice(ed.row + 1)]
  return settle({ ...ed, lines, row: ed.row + last, col })
}

function backspace(ed: Ed): Ed {
  if (ed.col > 0) {
    const cur = line(ed)
    const lines = [...ed.lines]
    lines[ed.row] = cur.slice(0, ed.col - 1) + cur.slice(ed.col)
    return settle({ ...ed, lines, col: ed.col - 1 })
  }
  if (ed.row === 0) return ed
  // At the start of a line: join it to the one above.
  const above = ed.lines[ed.row - 1]!
  const lines = [...ed.lines.slice(0, ed.row - 1), above + line(ed), ...ed.lines.slice(ed.row + 1)]
  return settle({ ...ed, lines, row: ed.row - 1, col: above.length })
}

function del(ed: Ed): Ed {
  const cur = line(ed)
  if (ed.col < cur.length) {
    const lines = [...ed.lines]
    lines[ed.row] = cur.slice(0, ed.col) + cur.slice(ed.col + 1)
    return settle({ ...ed, lines })
  }
  if (ed.row === ed.lines.length - 1) return ed
  const lines = [...ed.lines.slice(0, ed.row), cur + ed.lines[ed.row + 1]!, ...ed.lines.slice(ed.row + 2)]
  return settle({ ...ed, lines })
}

/** Moves the cursor to a line and column, each kept inside the text. */
export function moveTo(ed: Ed, row: number, col: number): Ed {
  const r = Math.max(0, Math.min(ed.lines.length - 1, row))
  return settle({ ...ed, row: r, col: Math.max(0, Math.min(ed.lines[r]!.length, col)) })
}

function move(ed: Ed, key: string): Ed {
  switch (key) {
    case 'left':
      return ed.col > 0 ? moveTo(ed, ed.row, ed.col - 1) : ed.row > 0 ? moveTo(ed, ed.row - 1, Infinity) : ed
    case 'right':
      return ed.col < line(ed).length ? moveTo(ed, ed.row, ed.col + 1) : moveTo(ed, ed.row + 1, ed.row + 1 < ed.lines.length ? 0 : Infinity)
    case 'up':
      return moveTo(ed, ed.row - 1, ed.col)
    case 'down':
      return moveTo(ed, ed.row + 1, ed.col)
    case 'home':
      return moveTo(ed, ed.row, 0)
    case 'end':
      return moveTo(ed, ed.row, Infinity)
    default:
      return ed
  }
}

/** Puts the picked completion in place of the mention; a folder opens its own. */
export function accept(ed: Ed): Ed {
  const choice = ed.menu?.items[ed.menu.index]
  const m = mentionAt(line(ed), ed.col)
  if (choice === undefined || m === null) return { ...ed, menu: null }
  const cur = line(ed)
  const put = choice.insert + (choice.isDir ? '' : ' ')
  const lines = [...ed.lines]
  lines[ed.row] = cur.slice(0, m.start) + put + cur.slice(m.end)
  return settle({ ...ed, lines, col: m.start + put.length, menu: null })
}

/** The completions the hooks module found for a query, if still the one asked. */
export function withMenu(ed: Ed, answer: { queryId: number; items: Suggestion[] }): Ed {
  if (answer.queryId !== ed.queryId || ed.query === null) return ed
  return { ...ed, menu: answer.items.length === 0 ? null : { items: answer.items.slice(0, MENU_SIZE), index: 0 } }
}

/** One key pressed while the editor has the focus. */
export function press(ed: Ed, k: Key): Ed {
  if (k.ctrl || k.meta) return k.ctrl && k.key === 's' ? { ...ed, send: ed.send + 1 } : ed
  const menu = ed.menu
  if (menu !== null) {
    const n = menu.items.length
    if (k.key === 'down') return { ...ed, menu: { ...menu, index: (menu.index + 1) % n } }
    if (k.key === 'up') return { ...ed, menu: { ...menu, index: (menu.index + n - 1) % n } }
    if (k.key === 'return' || k.key === 'tab') return accept(ed)
  }
  switch (k.key) {
    case 'return':
      return insert(ed, '\n')
    case 'backspace':
      return backspace(ed)
    case 'delete':
      return del(ed)
    case 'tab':
      return insert(ed, '  ')
    case 'space':
      return insert(ed, ' ')
    case 'left':
    case 'right':
    case 'up':
    case 'down':
    case 'home':
    case 'end':
      return move(ed, k.key)
    default:
      return [...k.key].length === 1 ? insert(ed, k.key) : ed
  }
}

/** The first line in view, so that the cursor's line and its menu fit in `rows`. */
export function scrolled(ed: Ed, rows: number): Ed {
  const below = ed.menu === null ? 0 : ed.menu.items.length
  const room = Math.max(1, rows - below)
  let top = Math.min(ed.top, ed.row)
  if (ed.row >= top + room) top = ed.row - room + 1
  return top === ed.top ? ed : { ...ed, top }
}

/** What each row of the view holds, top to bottom: a line, or a menu entry. */
export type ViewRow = { kind: 'line'; row: number } | { kind: 'menu'; index: number }

export function layout(ed: Ed, rows: number): ViewRow[] {
  const view: ViewRow[] = []
  for (let r = ed.top; r < ed.lines.length && view.length < rows; r++) {
    view.push({ kind: 'line', row: r })
    if (r === ed.row && ed.menu !== null) ed.menu.items.forEach((_, index) => view.push({ kind: 'menu', index }))
  }
  return view.slice(0, rows)
}
