/** Document-local history of Linux desktop taskbar completions. */
import type { LinuxTaskbarBadge } from './ipc.ts'

const key = 'dsh.desktop.taskbarCompletions.v1'
type Entry = readonly [lastTurn: number, pending: number]

function natural(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * Count individual completed turns independently of focus and the sidebar read marker.
 * @param storage - document-local persistence, accessed lazily in the workspace.
 * @param display - publish the absolute count to the native launcher.
 * @returns callbacks for the reading stream and explicit conversation visits.
 */
export function createTaskbarBadge(storage: () => Storage, display: (count: number) => void): LinuxTaskbarBadge {
  let entries: Map<string, Entry> | undefined
  let published: number | undefined
  function records(): Map<string, Entry> {
    if (entries) return entries
    let saved: unknown
    try {
      saved = JSON.parse(storage().getItem(key) ?? '[]')
    } catch (error) {
      console.warn('[desktop] Could not read saved taskbar counts:', error)
    }
    if (!Array.isArray(saved) || !saved.every(row => Array.isArray(row) && row.length === 3
      && typeof row[0] === 'string' && natural(row[1]) && natural(row[2]) && row[2] <= row[1])) {
      entries = new Map()
      return entries
    }
    entries = new Map(saved.map(([id, turn, pending]) => [id, [turn, pending]]))
    return entries
  }
  function publish(current: Map<string, Entry>, changed: boolean): void {
    if (changed) {
      try {
        storage().setItem(key, JSON.stringify(Array.from(current, ([id, entry]) => [id, ...entry])))
      } catch (error) {
        console.warn('[desktop] Could not save taskbar counts for the next launch:', error)
      }
    }
    const count = Array.from(current.values()).reduce((total, [, pending]) => total + pending, 0)
    if (count !== published) { display(count); published = count }
  }
  return {
    observe(updates, baseline) {
      const current = records()
      let changed = false
      for (const { sessionId, completedTurn, readTurn } of updates) {
        if (!natural(completedTurn) || !natural(readTurn) || typeof sessionId !== 'string') continue
        const previous = current.get(sessionId)
        if (completedTurn <= (previous?.[0] ?? 0)) continue
        // A newly encountered Session can already have many historical turns at its first live completion.
        const delta = previous ? completedTurn - previous[0] : Number(!baseline || completedTurn > readTurn)
        current.set(sessionId, [completedTurn, (previous?.[1] ?? 0) + delta])
        changed = true
      }
      if (changed || published === undefined) publish(current, changed)
    },
    opened(sessionId) {
      const current = records()
      const entry = current.get(sessionId)
      if (!entry || entry[1] === 0) return
      current.set(sessionId, [entry[0], entry[1] - 1])
      publish(current, true)
    },
  }
}
