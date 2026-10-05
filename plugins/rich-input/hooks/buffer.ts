/**
 * The editor's text model, kept free of any surface so tests drive it
 * directly: a text, a cursor and a selection anchor, all UTF-16 offsets.
 */
export type Buffer = { text: string; cursor: number; anchor: number | null }

/** One row as drawn: `[start, end)` of the text, soft-wrapped to a width. */
export type Row = { start: number; end: number }

export const at = (text: string, cursor = text.length): Buffer => ({ text, cursor, anchor: null })

export function selection(b: Buffer): [number, number] | null {
  if (b.anchor === null || b.anchor === b.cursor) return null
  return b.anchor < b.cursor ? [b.anchor, b.cursor] : [b.cursor, b.anchor]
}

export function selectedText(b: Buffer): string {
  const sel = selection(b)
  return sel ? b.text.slice(sel[0], sel[1]) : ''
}

/** Replaces the selection (or nothing, at the cursor) with `s`. */
export function insert(b: Buffer, s: string): Buffer {
  const [from, to] = selection(b) ?? [b.cursor, b.cursor]
  const text = b.text.slice(0, from) + s + b.text.slice(to)
  return { text, cursor: from + s.length, anchor: null }
}

/** Deletes `[from, to)`, or the selection when there is one. */
export function remove(b: Buffer, from: number, to: number): Buffer {
  const sel = selection(b)
  const [a, z] = sel ?? [Math.max(0, Math.min(from, to)), Math.min(b.text.length, Math.max(from, to))]
  return { text: b.text.slice(0, a) + b.text.slice(z), cursor: a, anchor: null }
}

/** Moves the cursor; `extend` grows the selection instead of dropping it. */
export function move(b: Buffer, cursor: number, extend: boolean): Buffer {
  const clamped = Math.max(0, Math.min(b.text.length, cursor))
  return { text: b.text, cursor: clamped, anchor: extend ? (b.anchor ?? b.cursor) : null }
}

const isWord = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}_]/u.test(c)

export function wordLeft(text: string, i: number): number {
  while (i > 0 && !isWord(text[i - 1])) i--
  while (i > 0 && isWord(text[i - 1])) i--
  return i
}

export function wordRight(text: string, i: number): number {
  while (i < text.length && !isWord(text[i])) i++
  while (i < text.length && isWord(text[i])) i++
  return i
}

export function lineStart(text: string, i: number): number {
  return text.lastIndexOf('\n', i - 1) + 1
}

export function lineEnd(text: string, i: number): number {
  const n = text.indexOf('\n', i)
  return n < 0 ? text.length : n
}

/**
 * The text cut into rows of at most `width` cells: at each newline, and
 * soft-wrapped inside a long line, at the last space when one is near.
 */
export function layout(text: string, width: number): Row[] {
  const w = Math.max(1, width)
  const rows: Row[] = []
  let start = 0
  for (const line of text.split('\n')) {
    const end = start + line.length
    let from = start
    while (end - from > w) {
      let cut = from + w
      const space = text.lastIndexOf(' ', cut - 1)
      if (space > from + w / 2) cut = space + 1
      rows.push({ start: from, end: cut })
      from = cut
    }
    rows.push({ start: from, end })
    start = end + 1
  }
  return rows
}

/** The row the cursor is drawn on: a wrapped row's end belongs to the next one. */
export function rowOf(rows: readonly Row[], cursor: number): number {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!
    const next = rows[i + 1]
    if (cursor >= r.start && (cursor < r.end || (cursor === r.end && (!next || next.start > r.end)))) return i
  }
  return rows.length - 1
}

/** The offset under cell `(x, row)`, clamped to that row. */
export function offsetAt(rows: readonly Row[], row: number, x: number): number {
  const r = rows[Math.max(0, Math.min(rows.length - 1, row))]!
  const next = rows[rows.indexOf(r) + 1]
  const isWrapped = next !== undefined && next.start === r.end
  const last = isWrapped ? r.end - 1 : r.end
  return Math.max(r.start, Math.min(last, r.start + Math.max(0, x)))
}

/** The cursor `delta` rows up or down, kept at column `goal` where it fits. */
export function vertical(rows: readonly Row[], cursor: number, delta: number, goal: number): number {
  const row = rowOf(rows, cursor) + delta
  if (row < 0) return 0
  if (row >= rows.length) return rows[rows.length - 1]!.end
  return offsetAt(rows, row, goal)
}

/**
 * The `@` mention the cursor is in: where its `@` is, where it ends and the
 * query typed after the `@` up to the cursor; null outside one.
 */
export function mentionAt(text: string, cursor: number): { start: number; end: number; query: string } | null {
  let i = cursor
  while (i > 0 && !/\s/.test(text[i - 1]!) && text[i - 1] !== '@') i--
  if (i === 0 || text[i - 1] !== '@') return null
  const start = i - 1
  if (start > 0 && !/\s/.test(text[start - 1]!)) return null
  let end = cursor
  while (end < text.length && !/\s/.test(text[end]!)) end++
  return { start, end, query: text.slice(start + 1, cursor) }
}
