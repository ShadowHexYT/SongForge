import { create } from 'zustand'

/**
 * Songs ticked in a song list. A selection belongs to one list ("library" or a playlist id),
 * so ticking songs on another page starts a new one.
 */
interface SelectionState {
  ids: string[]
  scope: string | null
  /** Last song clicked, for Shift-click ranges */
  anchor: string | null
  /** Songs the current list shows, in order (for Shift-click and Ctrl+A) */
  visible: string[]
  setVisible: (scope: string, ids: string[]) => void
  toggle: (scope: string, id: string) => void
  range: (scope: string, id: string) => void
  selectAll: () => void
  clear: () => void
}

export const useSelection = create<SelectionState>((set, get) => ({
  ids: [],
  scope: null,
  anchor: null,
  visible: [],
  setVisible: (scope, visible) => {
    const s = get()
    // Keep only ticked songs that are still shown (a search can hide some)
    if (s.scope === scope) set({ visible, ids: s.ids.filter((id) => visible.includes(id)) })
    else set({ visible, scope, ids: [], anchor: null })
  },
  toggle: (scope, id) => {
    const s = get()
    const ids = s.scope === scope ? s.ids : []
    set({ scope, anchor: id, ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] })
  },
  range: (scope, id) => {
    const s = get()
    if (s.scope !== scope || !s.anchor) return get().toggle(scope, id)
    const a = s.visible.indexOf(s.anchor)
    const b = s.visible.indexOf(id)
    if (a < 0 || b < 0) return get().toggle(scope, id)
    const span = s.visible.slice(Math.min(a, b), Math.max(a, b) + 1)
    set({ ids: [...new Set([...s.ids, ...span])] })
  },
  selectAll: () => set((s) => ({ ids: [...s.visible] })),
  clear: () => set({ ids: [], anchor: null })
}))

/** Click handler shared by song rows and cards: Ctrl toggles, Shift selects a range,
 *  and once something is ticked a plain click ticks too. Returns true when it handled the click. */
export function selectClick(e: React.MouseEvent, scope: string, id: string): boolean {
  if ((e.target as HTMLElement).closest('button, a, input, [role="menu"]')) return false
  const sel = useSelection.getState()
  const active = sel.scope === scope && sel.ids.length > 0
  if (e.shiftKey) sel.range(scope, id)
  else if (e.ctrlKey || e.metaKey || active) sel.toggle(scope, id)
  else return false
  e.preventDefault()
  return true
}
