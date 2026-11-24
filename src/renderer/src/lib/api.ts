import type { Api } from '../../../preload'

declare global {
  interface Window {
    api: Api
  }
}

export const api = window.api

/** URL that the custom sf-media protocol serves from disk (with Range/seek support). */
export function mediaUrl(path: string | null | undefined, bust?: number): string {
  if (!path) return ''
  return `sf-media://file/${encodeURIComponent(path)}${bust ? `?v=${bust}` : ''}`
}

export function newJobId(): string {
  return Math.random().toString(36).slice(2, 10)
}
