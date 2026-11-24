import { useMemo } from 'react'
import type { Song } from '@shared/types'
import { versionGroups, versionKey } from '@shared/versions'
import { useApp } from './store'

/** Version stacks for the whole library, keyed by version key. */
export function useVersionGroups(): Map<string, Song[]> {
  const songs = useApp((s) => s.library.songs)
  return useMemo(() => versionGroups(songs), [songs])
}

export function versionsOf(groups: Map<string, Song[]>, s: Song): Song[] {
  return groups.get(versionKey(s)) ?? [s]
}
