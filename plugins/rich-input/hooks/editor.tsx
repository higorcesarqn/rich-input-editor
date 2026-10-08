import type { ClientModule, ClientSurface, RenderElement } from 'claude-code'

import type { EditorProps } from '../types'
import { type Ed, fresh, insert, layout, moveTo, accept, press, scrolled, textOf, withMenu } from './editor-core'

/**
 * The editor, which of the hooks module's answers it has taken in, and
 * whether a click or a key has reached it yet: the keyboard comes only
 * with a click, so until then the top row asks for one.
 */
type S = { ed: Ed; seenMenu: number; seenPaste: number; isActive: boolean }

/** The top row tells whether the editor has the keyboard; the text is below it. */
const STATUS_ROWS = 1
const textRows = (surface: ClientSurface<S>) => Math.max(1, surface.rows - STATUS_ROWS)

const gutterWidth = (ed: Ed) => String(ed.lines.length).length + 3

/** How far the cursor's line is scrolled sideways so the cursor shows. */
function shift(ed: Ed, columns: number): number {
  const room = Math.max(1, columns - gutterWidth(ed) - 1)
  return Math.max(0, ed.col - room)
}

/** Keeps the cursor in view, stores the editor and tells the hooks module. */
function commit(surface: ClientSurface<S>, s: S, ed: Ed) {
  const next = scrolled(ed, textRows(surface))
  surface.setState({ ...s, ed: next, isActive: true })
  surface.post({ draft: textOf(next), query: next.query, queryId: next.queryId, send: next.send, pasteId: next.pasteId })
}

const Editor: ClientModule<EditorProps, S> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    surface.onKey(k => {
      const s = surface.state!
      commit(surface, s, press(s.ed, k))
    })
    surface.onPointer(p => {
      if (p.type !== 'down') return
      const s = surface.state!
      if (p.button === 'right') return commit(surface, s, { ...s.ed, pasteId: s.ed.pasteId + 1 })
      if (p.button !== 'left') return
      if (p.y < STATUS_ROWS) return commit(surface, s, s.ed)
      const at = layout(s.ed, textRows(surface))[p.y - STATUS_ROWS]
      if (at === undefined) return commit(surface, s, moveTo(s.ed, Infinity, Infinity))
      if (at.kind === 'menu') return commit(surface, s, accept({ ...s.ed, menu: { ...s.ed.menu!, index: at.index } }))
      const sideways = at.row === s.ed.row ? shift(s.ed, surface.columns) : 0
      commit(surface, s, moveTo(s.ed, at.row, p.x - gutterWidth(s.ed) + sideways))
    })
    surface.setState({ ed: fresh(props.initial), seenMenu: 0, seenPaste: 0, isActive: false })
    return <Text dimColor>Loading…</Text>
  }

  // Take in what the hooks module answered: completions, a paste.
  let s = surface.state
  if (props.menu !== null && props.menu.queryId > s.seenMenu) {
    s = { ...s, ed: withMenu(s.ed, props.menu), seenMenu: props.menu.queryId }
  }
  if (props.paste !== null && props.paste.id > s.seenPaste) {
    s = { ...s, ed: insert(s.ed, props.paste.text), seenPaste: props.paste.id }
  }
  if (s !== surface.state) {
    commit(surface, { ...s, isActive: surface.state.isActive }, s.ed)
    return <Text dimColor>…</Text>
  }

  const { ed } = s
  const width = String(ed.lines.length).length
  const status = s.isActive ? (
    <Text dimColor wrap="truncate-end">
      ✎ editing · Esc leaves the editor, a click comes back
    </Text>
  ) : (
    <Text inverse bold wrap="truncate-end">
      {' ▶ Click here to start typing '}
    </Text>
  )
  const rows: RenderElement[] = layout(ed, textRows(surface)).map(at => {
    if (at.kind === 'menu') {
      const item = ed.menu!.items[at.index]!
      const picked = at.index === ed.menu!.index
      return (
        <Text wrap="truncate-end" inverse={picked} dimColor={!picked && !item.isDir}>
          {`${' '.repeat(width + 3)}${item.label}`}
        </Text>
      )
    }
    const gutter = `${String(at.row + 1).padStart(width)} │ `
    const text = ed.lines[at.row]!
    if (at.row !== ed.row) {
      return (
        <Text wrap="truncate-end">
          <Text dimColor>{gutter}</Text>
          {text}
        </Text>
      )
    }
    const from = shift(ed, surface.columns)
    return (
      <Text wrap="truncate-end">
        <Text dimColor>{gutter}</Text>
        {text.slice(from, ed.col)}
        <Text inverse>{text[ed.col] ?? ' '}</Text>
        {text.slice(ed.col + 1)}
      </Text>
    )
  })
  return (
    <Box flexDirection="column">
      {status}
      {rows}
    </Box>
  )
}

export default Editor
