// @vitest-environment jsdom
/** Linux launcher counts track completed turns independently of automatic reading. */
import { beforeEach, expect, it, vi } from 'vitest'
import { createTaskbarBadge } from '../src/linux-taskbar-badge.ts'

beforeEach(() => localStorage.clear())

it('counts each new turn and consumes one per visit to its own conversation', () => {
  const display = vi.fn()
  const badge = createTaskbarBadge(() => localStorage, display)
  const record = (sessionId: string, completedTurn: number, readTurn = 0) => ({ sessionId, completedTurn, readTurn })
  badge.observe([record('existing', 50, 50)], true)
  badge.observe([record('first', 31)], false)
  badge.observe([record('first', 31, 31)], false)
  badge.observe([record('first', 32, 32)], false)
  badge.observe([record('other', 1)], false)
  badge.opened('unrelated')
  badge.opened('first')
  const refreshed = createTaskbarBadge(() => localStorage, display)
  refreshed.observe([record('first', 32, 32), record('other', 1, 1)], true)
  refreshed.opened('first')
  refreshed.opened('first')
  refreshed.opened('other')
  refreshed.opened('other')
  expect(display.mock.calls.flat()).toEqual([0, 1, 2, 3, 2, 2, 1, 0])
})

it('reconciles missed turns once and does not count manually marking a conversation unread', () => {
  const display = vi.fn()
  const badge = createTaskbarBadge(() => localStorage, display)
  badge.observe([{ sessionId: 'one', completedTurn: 40, readTurn: 39 }], true)
  badge.observe([{ sessionId: 'one', completedTurn: 42, readTurn: 42 }], true)
  badge.observe([{ sessionId: 'one', completedTurn: 42, readTurn: 0 }], false)
  badge.observe([{ sessionId: 'empty', completedTurn: 0, readTurn: 0 }], false)
  expect(display.mock.calls.flat()).toEqual([1, 3])
})
