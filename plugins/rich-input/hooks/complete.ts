import type { Suggestion } from '../types'

/** One path of the project index, `/`-separated and relative to its root. */
export type Entry = { path: string; isDir: boolean }

const LIMIT = 10

/**
 * Every directory the files sit under, added to the files themselves; a
 * path ending in `/` is a folder of its own (one the walk saw empty).
 */
export function withDirs(files: readonly string[]): Entry[] {
  const dirs = new Set<string>()
  const entries: Entry[] = []
  for (const raw of files) {
    const path = raw.replace(/\\/g, '/').replace(/^\.\//, '')
    if (path === '' || path === '/') continue
    if (path.endsWith('/')) {
      dirs.add(path.slice(0, -1))
      continue
    }
    entries.push({ path, isDir: false })
    let cut = path.lastIndexOf('/')
    while (cut > 0) {
      const dir = path.slice(0, cut)
      if (dirs.has(dir)) break
      dirs.add(dir)
      cut = dir.lastIndexOf('/')
    }
  }
  for (const dir of dirs) entries.push({ path: dir, isDir: true })
  return entries
}

/** What replaces `@query` in the text: quoted when the path has a space. */
export function mention(entry: Entry): string {
  const path = entry.isDir ? `${entry.path}/` : entry.path
  return /\s/.test(path) ? `@"${path}"` : `@${path}`
}

function parentOf(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut < 0 ? '' : path.slice(0, cut)
}

function baseOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function isSubsequence(needle: string, hay: string): boolean {
  let i = 0
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] === needle[i]) i++
  }
  return i === needle.length
}

function toSuggestion(entry: Entry): Suggestion {
  return {
    label: entry.isDir ? `${entry.path}/` : entry.path,
    insert: mention(entry),
    isDir: entry.isDir,
  }
}

/**
 * The completions for what follows `@`.
 *
 * With a `/` in it the query browses: the children of the folder before the
 * last `/` whose name holds the rest. Without one it searches the whole
 * index by name, then by path, then by letters in order.
 */
export function complete(entries: readonly Entry[], rawQuery: string): Suggestion[] {
  const query = rawQuery.replace(/\\/g, '/').replace(/^"/, '').toLowerCase()
  const byName = (a: [number, Entry], b: [number, Entry]) =>
    a[0] - b[0] || Number(b[1].isDir) - Number(a[1].isDir) || a[1].path.localeCompare(b[1].path)
  const byRank = (a: [number, Entry], b: [number, Entry]) =>
    a[0] - b[0] || a[1].path.length - b[1].path.length || byName(a, b)

  if (query === '' || query.includes('/')) {
    const cut = query.lastIndexOf('/')
    const dir = cut < 0 ? '' : query.slice(0, cut)
    const name = query.slice(cut + 1)
    const ranked: [number, Entry][] = []
    for (const entry of entries) {
      if (parentOf(entry.path).toLowerCase() !== dir) continue
      const base = baseOf(entry.path).toLowerCase()
      if (base.startsWith(name)) ranked.push([0, entry])
      else if (name !== '' && base.includes(name)) ranked.push([1, entry])
    }
    return ranked.sort(byName).slice(0, LIMIT).map(([, e]) => toSuggestion(e))
  }

  const ranked: [number, Entry][] = []
  for (const entry of entries) {
    const path = entry.path.toLowerCase()
    const base = baseOf(path)
    if (base.startsWith(query)) ranked.push([0, entry])
    else if (base.includes(query)) ranked.push([1, entry])
    else if (path.includes(query)) ranked.push([2, entry])
    else if (isSubsequence(query, path)) ranked.push([3, entry])
  }
  return ranked.sort(byRank).slice(0, LIMIT).map(([, e]) => toSuggestion(e))
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
