import { useEffect, useRef, useState } from 'react'
import { ClipboardPaste, Scissors, X } from 'lucide-react'
import { extractLinks, siteName } from '@shared/sites'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { useQueue } from '@/lib/queue'
import { Button, IconButton } from './ui'

/**
 * "Forge this link?" When you come back to SongForge after copying a supported link, it offers
 * to open it. Privacy: the clipboard is only read at that moment, only checked for a link, and
 * never stored, logged or sent anywhere. Only the last offered link is remembered, in memory, so
 * the same link isn't offered twice.
 */
let lastOffered = ''

export function ClipboardPrompt() {
  const enabled = useApp((s) => s.settings?.clipboardWatch ?? false)
  const onboarded = useApp((s) => s.settings?.onboarded ?? false)
  const [link, setLink] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled || !onboarded) {
      setLink(null)
      return
    }
    const check = async () => {
      let text = ''
      try {
        text = await api.clipboard.read()
      } catch {
        return
      }
      if (!text || text.length > 2000) return
      const url = extractLinks(text, false)[0]
      text = ''
      if (!url || url === lastOffered) return
      const st = useApp.getState()
      const inQueue = useQueue.getState().items.some((i) => i.url === url)
      const open = st.route.name === 'editor' && st.route.source.url === url
      if (inQueue || open) return
      lastOffered = url
      setLink(url)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setLink(null), 15000)
    }
    check()
    window.addEventListener('focus', check)
    return () => {
      window.removeEventListener('focus', check)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [enabled, onboarded])

  if (!link) return null
  const forge = () => {
    useQueue.getState().add([{ url: link }], true)
    const st = useApp.getState()
    if (st.route.name !== 'forge' && st.route.name !== 'editor') st.navigate({ name: 'forge' })
    setLink(null)
  }
  return (
    <div className="fixed right-4 top-12 z-50 w-[min(440px,calc(100vw-32px))] animate-[sf-drop_.18s_ease-out] rounded-2xl border border-ink-600 bg-ink-800/95 p-3 shadow-2xl backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ember-500/15 text-ember-400">
          <ClipboardPaste size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Forge the link you copied?</div>
          <div className="truncate text-[11px] text-ink-400">
            <span className="font-semibold text-ink-300">{siteName(link) ?? 'Link'}</span> · <span className="font-mono">{link.replace(/^https?:\/\/(www\.)?/, '')}</span>
          </div>
        </div>
        <Button size="sm" variant="primary" icon={<Scissors size={14} />} onClick={forge}>
          Forge
        </Button>
        <IconButton label="Not now" size="sm" onClick={() => setLink(null)}>
          <X size={15} />
        </IconButton>
      </div>
    </div>
  )
}
