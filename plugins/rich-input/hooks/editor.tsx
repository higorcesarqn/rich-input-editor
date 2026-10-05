import type { ClientKeyEvent, ClientModule, ClientPointerEvent, ClientSurface } from 'claude-code'

import type { EditorMessage, EditorProps, Suggestion } from '../types'
import {
  type Buffer,
  type Row,
  at,
  insert,
  layout,
  lineEnd,
  lineStart,
  mentionAt,
  move,
  offsetAt,
  remove,
  rowOf,
  selectedText,
  selection,
  vertical,
  wordLeft,
  wordRight,
} from './buffer'

type State = {
  nonce: number
  buf: Buffer
  undo: Buffer[]
  redo: Buffer[]
  /** What the last undo step was taken for, so a run of typing is one step. */
  lastKind: string
  /** The first row shown. */
  top: number
  /** The column up and down keep to. */
  goal: number | null
  /** The highlighted completion. */
  pick: number
  isDragging: boolean
  posted: { text: string; query: string | null }
}

const MENU_ROWS = 6
const SPECIAL = new Set([
  'up', 'down', 'left', 'right', 'return', 'enter', 'tab', 'backspace', 'delete', 'pageup',
  'pagedown', 'home', 'end', 'escape', 'insert', 'clear',
  ...Array.from({ length: 12 }, (_, i) => `f${i + 1}`),
])
const MENTION = /(^|\s)(@("[^"\n]*"?|\S+))/g

/** The latest props per instance: the listeners read them at event time. */
const live = new WeakMap<object, EditorProps>()

function initial(props: EditorProps): State {
  return {
    nonce: props.nonce,
    buf: at(props.text),
    undo: [],
    redo: [],
    lastKind: '',
    top: 0,
    goal: null,
    pick: 0,
    isDragging: false,
    posted: { text: props.text, query: null },
  }
}

function current(surface: ClientSurface<State>, props: EditorProps): State {
  const s = surface.state
  return s !== undefined && s.nonce === props.nonce ? s : initial(props)
}

function geometry(surface: ClientSurface<State>) {
  const columns = surface.columns > 0 ? surface.columns : 80
  const height = surface.rows > 0 ? surface.rows : 12
  return { width: Math.max(10, columns - 1), height }
}

function menuOf(s: State, props: EditorProps): Suggestion[] {
  const m = mentionAt(s.buf.text, s.buf.cursor)
  if (m === null || props.sugQuery !== m.query) return []
  return props.suggestions
}

function textRows(height: number, menu: number): number {
  return Math.max(3, height - 1 - Math.min(menu, MENU_ROWS))
}

/** Stores `next`, scrolling to its cursor and telling the hooks what changed. */
function commit(surface: ClientSurface<State>, props: EditorProps, next: State) {
  const { width, height } = geometry(surface)
  const rows = layout(next.buf.text, width)
  const row = rowOf(rows, next.buf.cursor)
  const shown = textRows(height, menuOf(next, props).length)
  let top = Math.min(next.top, Math.max(0, rows.length - 1))
  if (row < top) top = row
  if (row >= top + shown) top = row - shown + 1
  const m = mentionAt(next.buf.text, next.buf.cursor)
  const query = m?.query ?? null
  let posted = next.posted
  if (posted.text !== next.buf.text || posted.query !== query) {
    posted = { text: next.buf.text, query }
    surface.post({ type: 'edit', text: next.buf.text, query } satisfies EditorMessage)
  }
  surface.setState({ ...next, top, posted })
}

/** An edit: keeps an undo step, one per run of the same kind. */
function edit(s: State, buf: Buffer, kind: string): State {
  if (buf.text === s.buf.text) return { ...s, buf, goal: null }
  const isRun = kind === 'type' && s.lastKind === 'type' && !/\s$/.test(s.buf.text.slice(0, s.buf.cursor))
  const undo = isRun ? s.undo : [...s.undo, s.buf].slice(-200)
  return { ...s, buf, undo, redo: [], lastKind: kind, goal: null, pick: 0 }
}

function accept(s: State, choice: Suggestion): State {
  const m = mentionAt(s.buf.text, s.buf.cursor)
  if (m === null) return s
  const text = choice.insert + (choice.isDir ? '' : ' ')
  const buf = insert({ text: s.buf.text, cursor: m.start, anchor: m.end }, text)
  return edit(s, buf, 'accept')
}

function onKey(surface: ClientSurface<State>, k: ClientKeyEvent) {
  const props = live.get(surface)
  if (props === undefined) return
  const s = current(surface, props)
  const { width, height } = geometry(surface)
  const rows = layout(s.buf.text, width)
  const b = s.buf
  const shift = k.shift === true
  const mod = k.ctrl === true || k.meta === true
  const menu = menuOf(s, props)
  const name = k.key.toLowerCase()

  if (menu.length > 0 && !mod) {
    if (name === 'up' || name === 'down') {
      const pick = (s.pick + (name === 'up' ? -1 : 1) + menu.length) % menu.length
      return surface.setState({ ...s, pick })
    }
    if (name === 'tab' || name === 'return' || name === 'enter') {
      return commit(surface, props, accept(s, menu[Math.min(s.pick, menu.length - 1)]!))
    }
  }

  if ((k.ctrl && name === 's') || ((name === 'return' || name === 'enter') && mod)) {
    return surface.post({ type: 'submit', text: b.text } satisfies EditorMessage)
  }
  if (k.ctrl && name === 'q') {
    return surface.post({ type: 'cancel', text: b.text } satisfies EditorMessage)
  }
  if (k.ctrl && name === 'z') {
    const prev = s.undo[s.undo.length - 1]
    if (prev === undefined) return
    return commit(surface, props, { ...s, buf: prev, undo: s.undo.slice(0, -1), redo: [...s.redo, b], lastKind: '' })
  }
  if (k.ctrl && name === 'y') {
    const next = s.redo[s.redo.length - 1]
    if (next === undefined) return
    return commit(surface, props, { ...s, buf: next, redo: s.redo.slice(0, -1), undo: [...s.undo, b], lastKind: '' })
  }
  if (k.ctrl && name === 'a') {
    return commit(surface, props, { ...s, buf: { text: b.text, cursor: b.text.length, anchor: 0 } })
  }
  if (k.ctrl && name === 'c') {
    const text = selectedText(b)
    if (text !== '') surface.post({ type: 'copy', text } satisfies EditorMessage)
    return
  }

  const goal = s.goal ?? b.cursor - rows[rowOf(rows, b.cursor)]!.start
  const to = (cursor: number, keepGoal = false) =>
    commit(surface, props, { ...s, buf: move(b, cursor, shift), goal: keepGoal ? goal : null, lastKind: '' })
  const page = textRows(height, menu.length) - 1

  switch (name) {
    case 'left':
      if (!shift && selection(b)) return to(selection(b)![0])
      return to(mod ? wordLeft(b.text, b.cursor) : b.cursor - 1)
    case 'right':
      if (!shift && selection(b)) return to(selection(b)![1])
      return to(mod ? wordRight(b.text, b.cursor) : b.cursor + 1)
    case 'up':
      return to(vertical(rows, b.cursor, -1, goal), true)
    case 'down':
      return to(vertical(rows, b.cursor, 1, goal), true)
    case 'pageup':
      return to(vertical(rows, b.cursor, -page, goal), true)
    case 'pagedown':
      return to(vertical(rows, b.cursor, page, goal), true)
    case 'home':
      return to(mod ? 0 : rows[rowOf(rows, b.cursor)]!.start)
    case 'end':
      return to(mod ? b.text.length : rows[rowOf(rows, b.cursor)]!.end)
    case 'backspace':
      return commit(surface, props, edit(s, remove(b, mod ? wordLeft(b.text, b.cursor) : b.cursor - 1, b.cursor), 'delete'))
    case 'delete':
      return commit(surface, props, edit(s, remove(b, b.cursor, mod ? wordRight(b.text, b.cursor) : b.cursor + 1), 'delete'))
    case 'return':
    case 'enter':
      return commit(surface, props, edit(s, insert(b, '\n'), 'newline'))
    case 'tab':
      return commit(surface, props, edit(s, insert(b, '  '), 'type'))
  }

  if (k.ctrl) {
    switch (name) {
      case 'j':
        return commit(surface, props, edit(s, insert(b, '\n'), 'newline'))
      case 'w':
        return commit(surface, props, edit(s, remove(b, wordLeft(b.text, b.cursor), b.cursor), 'delete'))
      case 'u':
        return commit(surface, props, edit(s, remove(b, lineStart(b.text, b.cursor), b.cursor), 'delete'))
      case 'k':
        return commit(surface, props, edit(s, remove(b, b.cursor, lineEnd(b.text, b.cursor)), 'delete'))
      case 'e':
        return to(lineEnd(b.text, b.cursor))
    }
    return
  }
  if (k.meta) {
    if (name === 'b') return to(wordLeft(b.text, b.cursor))
    if (name === 'f') return to(wordRight(b.text, b.cursor))
    return
  }
  if (SPECIAL.has(name)) return

  const typed = k.key === 'space' ? ' ' : k.key.replace(/\r\n?/g, '\n')
  commit(surface, props, edit(s, insert(b, typed), typed.length > 1 ? 'paste' : 'type'))
}

function onPointer(surface: ClientSurface<State>, p: ClientPointerEvent) {
  const props = live.get(surface)
  if (props === undefined) return
  const s = current(surface, props)
  const { width, height } = geometry(surface)
  const rows = layout(s.buf.text, width)
  const menu = menuOf(s, props)
  const shown = textRows(height, menu.length)

  if (p.type === 'up') return surface.setState({ ...s, isDragging: false })
  const isDown = p.type === 'down' && p.button === 'left'
  const isDrag = p.type === 'move' && s.isDragging
  if (!isDown && !isDrag) return

  if (isDown && p.y >= shown && p.y < shown + menu.length) {
    return commit(surface, props, accept(s, menu[p.y - shown]!))
  }
  const row = Math.max(0, Math.min(rows.length - 1, s.top + Math.min(p.y, shown - 1)))
  const cursor = offsetAt(rows, row, p.x)
  const extend = isDrag || p.shift === true
  commit(surface, props, { ...s, buf: move(s.buf, cursor, extend), isDragging: true, goal: null, lastKind: '' })
}

/** The `[start, end)` runs of every `@mention` in the text. */
function mentions(text: string): [number, number][] {
  const runs: [number, number][] = []
  for (const m of text.matchAll(MENTION)) {
    const start = m.index! + m[1]!.length
    runs.push([start, start + m[2]!.length])
  }
  return runs
}

const Editor: ClientModule<EditorProps, State> = (props, surface) => {
  live.set(surface, props)
  surface.onKey(k => onKey(surface, k))
  surface.onPointer(p => onPointer(surface, p))

  const { Box, Text } = surface.elements
  const s = current(surface, props)
  const { width, height } = geometry(surface)
  const b = s.buf
  const rows: Row[] = layout(b.text, width)
  const menu = menuOf(s, props)
  const shown = textRows(height, menu.length)
  const cursorRow = rowOf(rows, b.cursor)
  const top = Math.max(0, Math.min(s.top, rows.length - 1))
  const sel = selection(b)
  const runs = mentions(b.text)
  const isMention = (i: number) => runs.some(([a, z]) => i >= a && i < z)

  const drawRow = (r: Row, index: number) => {
    const parts = []
    let from = r.start
    const styleAt = (i: number) =>
      (sel && i >= sel[0] && i < sel[1]) || (index === cursorRow && i === b.cursor && !sel)
        ? 'inverse'
        : isMention(i)
          ? 'mention'
          : 'plain'
    while (from < r.end) {
      const style = styleAt(from)
      let to = from + 1
      while (to < r.end && styleAt(to) === style) to++
      const chunk = b.text.slice(from, to)
      parts.push(
        style === 'inverse' ? (
          <Text inverse>{chunk}</Text>
        ) : style === 'mention' ? (
          <Text color="suggestion" bold>
            {chunk}
          </Text>
        ) : (
          <Text>{chunk}</Text>
        ),
      )
      from = to
    }
    if (index === cursorRow && !sel && b.cursor === r.end) parts.push(<Text inverse> </Text>)
    if (parts.length === 0) parts.push(<Text> </Text>)
    return <Box flexDirection="row">{parts}</Box>
  }

  const body =
    b.text === ''
      ? [
          <Box flexDirection="row">
            <Text inverse> </Text>
            <Text dimColor>Escreva o prompt… @ referencia arquivos e pastas</Text>
          </Box>,
        ]
      : rows.slice(top, top + shown).map((r, i) => drawRow(r, top + i))

  const line = b.text.slice(0, b.cursor).split('\n').length
  const column = b.cursor - lineStart(b.text, b.cursor) + 1
  const pick = Math.min(s.pick, Math.max(0, menu.length - 1))
  const first = Math.max(0, Math.min(pick - MENU_ROWS + 1, menu.length - MENU_ROWS))

  return (
    <Box flexDirection="column" width={width + 1}>
      <Box flexDirection="column" height={shown}>
        {body}
      </Box>
      {menu.slice(first, first + MENU_ROWS).map((choice, i) => (
        <Text inverse={first + i === pick} color={choice.isDir ? 'suggestion' : undefined} wrap="truncate-start">
          {choice.isDir ? '▸ ' : '  '}
          {choice.label}
        </Text>
      ))}
      <Text dimColor wrap="truncate-end">
        Ln {line}, Col {column} · Ctrl+S envia · Enter nova linha · @ arquivos (Tab aceita) · Ctrl+Z desfaz · Esc sai
      </Text>
    </Box>
  )
}

export default Editor
