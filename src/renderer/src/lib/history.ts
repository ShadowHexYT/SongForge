import { useCallback, useRef, useState } from 'react'

interface History<T> {
  past: T[]
  present: T
  future: T[]
}

const LIMIT = 200
const GROUP_WINDOW_MS = 700

/**
 * Undo/redo state. Rapid edits that share a `group` key (slider drags, typing in one field,
 * dragging a region) collapse into a single undo step.
 */
export function useHistory<T>(initial: T | (() => T)) {
  const [h, setH] = useState<History<T>>(() => ({ past: [], present: typeof initial === 'function' ? (initial as () => T)() : initial, future: [] }))
  const last = useRef<{ group?: string; at: number }>({ at: 0 })

  const set = useCallback((updater: T | ((prev: T) => T), group?: string) => {
    setH((cur) => {
      const next = typeof updater === 'function' ? (updater as (p: T) => T)(cur.present) : updater
      if (Object.is(next, cur.present)) return cur
      const now = Date.now()
      const merge = group && last.current.group === group && now - last.current.at < GROUP_WINDOW_MS
      last.current = { group, at: now }
      if (merge) return { past: cur.past, present: next, future: [] }
      return { past: [...cur.past.slice(-LIMIT), cur.present], present: next, future: [] }
    })
  }, [])

  const undo = useCallback(() => {
    last.current = { at: 0 }
    setH((cur) => (cur.past.length ? { past: cur.past.slice(0, -1), present: cur.past[cur.past.length - 1], future: [cur.present, ...cur.future] } : cur))
  }, [])

  const redo = useCallback(() => {
    last.current = { at: 0 }
    setH((cur) => (cur.future.length ? { past: [...cur.past, cur.present], present: cur.future[0], future: cur.future.slice(1) } : cur))
  }, [])

  return { state: h.present, set, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 }
}
