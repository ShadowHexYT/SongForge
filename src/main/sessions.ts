import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Session } from '@shared/types'
import { paths } from './store'

const file = (id: string) => join(paths.sessions, `${id.replace(/[^\w-]/g, '')}.json`)

export function listSessions(): Session[] {
  const out: Session[] = []
  for (const f of readdirSync(paths.sessions)) {
    if (!f.endsWith('.json')) continue
    try {
      const s = JSON.parse(readFileSync(join(paths.sessions, f), 'utf8')) as Session
      // Hide the heavy draft payload from listings
      out.push({ ...s, drafts: [] })
    } catch {
      /* skip corrupt */
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getSession(id: string): Session | null {
  const f = file(id)
  if (!existsSync(f)) return null
  try {
    return JSON.parse(readFileSync(f, 'utf8')) as Session
  } catch {
    return null
  }
}

export function saveSession(s: Session): void {
  writeFileSync(file(s.sourceId), JSON.stringify(s), 'utf8')
}

export function deleteSession(id: string): void {
  rmSync(file(id), { force: true })
}
