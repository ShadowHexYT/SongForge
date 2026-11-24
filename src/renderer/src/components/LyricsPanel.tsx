import { useState } from 'react'
import { Clock, ExternalLink, Loader2, Search, Text, X } from 'lucide-react'
import type { LyricsResult } from '@shared/types'
import { isLrc, lrcToPlain, parseLrc } from '@shared/lrc'
import { api } from '@/lib/api'
import { cleanError } from '@/lib/queue'
import { fmtTime } from '@/lib/format'
import { Button, Textarea, cx } from './ui'

interface Props {
  title: string
  artist: string
  lyrics: string
  syncedLyrics?: string
  /** Length of the song, to pick the closest match */
  duration?: number
  rows?: number
  onChange: (lyrics: string, syncedLyrics: string) => void
}

/**
 * Find lyrics (LRCLIB, free and open), or paste them from anywhere. Pasting LRC text
 * ("[01:02.30] line") makes them time-synced automatically.
 */
export function LyricsPanel({ title, artist, lyrics, syncedLyrics, duration, rows = 10, onChange }: Props) {
  const [results, setResults] = useState<LyricsResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const synced = !!syncedLyrics?.trim()
  const text = synced ? syncedLyrics! : lyrics
  const lineCount = synced ? parseLrc(syncedLyrics!).length : lyrics.split('\n').filter((l) => l.trim()).length

  const find = async () => {
    if (!title.trim()) {
      setError('Add a song title first (Tags tab).')
      return
    }
    setBusy(true)
    setError('')
    try {
      const r = await api.lyrics.search(title, artist, duration)
      setResults(r)
      if (!r.length) setError('No lyrics found. Try fixing the title or artist, or paste them below.')
    } catch (e) {
      setError(cleanError(e))
    }
    setBusy(false)
  }

  const use = (r: LyricsResult) => {
    if (r.instrumental && !r.plain && !r.synced) onChange('', '')
    else onChange(r.plain || lrcToPlain(r.synced), r.synced)
    setResults(null)
  }

  const edit = (value: string) => {
    if (isLrc(value)) onChange(lrcToPlain(value), value)
    else onChange(value, '')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" onClick={find} disabled={busy} icon={busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}>
          Find lyrics
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<ExternalLink size={13} />}
          onClick={() => api.shell.openExternal(`https://genius.com/search?q=${encodeURIComponent(`${artist} ${title}`.trim())}`)}
          title="Open Genius in your browser, then copy the lyrics and paste them below"
        >
          Genius
        </Button>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-ink-400">
          {synced ? <Clock size={12} className="text-ember-400" /> : <Text size={12} />}
          {text.trim() ? `${synced ? 'Synced' : 'Plain'} · ${lineCount} lines` : 'No lyrics yet'}
        </span>
      </div>

      {error && <p className="text-xs text-amber-500">{error}</p>}

      {results && results.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-ink-600">
          <div className="flex items-center justify-between bg-ink-800 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            Pick a match
            <button onClick={() => setResults(null)} aria-label="Close results" className="text-ink-400 hover:text-ink-100">
              <X size={13} />
            </button>
          </div>
          <div className="max-h-64 divide-y divide-ink-700 overflow-y-auto">
            {results.map((r) => (
              <button key={r.id} onClick={() => use(r)} className="block w-full px-3 py-2 text-left hover:bg-ink-800">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{r.title}</span>
                  <span
                    className={cx(
                      'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                      r.synced ? 'bg-ember-500/15 text-ember-400' : r.instrumental ? 'bg-ink-700 text-ink-300' : 'bg-ink-700 text-ink-300'
                    )}
                  >
                    {r.synced ? 'Synced' : r.instrumental ? 'Instrumental' : 'Plain'}
                  </span>
                </div>
                <div className="truncate text-xs text-ink-400">
                  {r.artist}
                  {r.album && ` · ${r.album}`} · {fmtTime(r.duration)}
                </div>
                {(r.plain || r.synced) && <div className="mt-1 line-clamp-2 text-[11px] italic text-ink-400">{(r.plain || lrcToPlain(r.synced)).split('\n').slice(0, 2).join(' / ')}</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      <Textarea
        rows={rows}
        value={text}
        onChange={(e) => edit(e.target.value)}
        placeholder={'Paste lyrics here.\n\nTip: lyrics with timestamps like [00:12.50] become synced and scroll along in the player.'}
        className={cx('font-[inherit] leading-relaxed', synced && 'font-mono text-[12px]')}
        spellCheck={false}
      />
      <div className="flex items-start justify-between gap-3 text-[11px] leading-relaxed text-ink-400">
        <span>Lyrics are saved in the MP3{synced ? ' and as an .lrc file beside it' : ''}. Found lyrics come from LRCLIB, a free lyrics library.</span>
        {text.trim() && (
          <button onClick={() => onChange('', '')} className="shrink-0 text-ink-400 underline hover:text-ink-100">
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
