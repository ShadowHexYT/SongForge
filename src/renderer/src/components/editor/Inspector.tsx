import { useMemo, useState, type ReactNode } from 'react'
import { Mic2, Sparkles, Wand2, Copy, RotateCcw, Gauge, Music4, Volume2, Piano, Waves, Plus, X, Check, Ban } from 'lucide-react'
import { FX_DEFAULTS, MAX_CUSTOM_PRESETS, type ClipSettings, type Cleanup, type FxPreset, type FxSettings, type SongMeta } from '@shared/types'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { fmtTime } from '@/lib/format'
import { CoverCropper, type CoverState } from '../CoverCropper'
import { LyricsPanel } from '../LyricsPanel'
import { Button, Field, Input, Range, Toggle, cx } from '../ui'
import { EdgeZoom } from './EdgeZoom'
import { TagLookupButton } from '../TagLookup'
import { mediaUrl } from '@/lib/api'
import { FX_PRESETS, SPEED_PRESETS, fxEqual, newKey, type Draft } from './model'

export type InspectorTab = 'trim' | 'sound' | 'tags' | 'lyrics' | 'cover'

interface Props {
  tab: InspectorTab
  onTab: (t: InspectorTab) => void
  draft: Draft
  index: number
  clipCount: number
  duration: number
  playhead: number
  peaks: number[]
  perSecond: number
  video: HTMLVideoElement | null
  thumbnailPath: string | null
  demucsOk: boolean | null
  onClip: (patch: Partial<ClipSettings>, group?: string) => void
  onMeta: (k: keyof SongMeta, v: string) => void
  onLyrics: (lyrics: string, synced: string) => void
  onCover: (c: CoverState) => void
  onSnap: (edge: 'start' | 'end') => void
  onToPlayhead: (edge: 'start' | 'end') => void
  onPreviewEdge: (edge: 'start' | 'end') => void
  onAutofill: () => void
  onApplyToAll: (what: 'artist-album' | 'cover' | 'sound') => void
}

export function Inspector(p: Props) {
  const tabs: Array<{ id: InspectorTab; label: string }> = [
    { id: 'trim', label: 'Trim' },
    { id: 'sound', label: 'Sound' },
    { id: 'tags', label: 'Tags' },
    { id: 'lyrics', label: 'Lyrics' },
    { id: 'cover', label: 'Cover' }
  ]
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.draft.color }} />
        <span className="truncate text-sm font-semibold">
          {p.index + 1}. {p.draft.meta.title || 'Untitled'}
        </span>
      </div>
      <div data-tour="studio-tabs" className="mx-4 mt-3 grid grid-cols-5 rounded-lg bg-ink-800 p-0.5" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={p.tab === t.id}
            onClick={() => p.onTab(t.id)}
            className={cx('h-7 rounded-md text-xs font-medium transition', p.tab === t.id ? 'bg-ink-600 text-ink-100 shadow' : 'text-ink-400 hover:text-ink-200')}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {p.tab === 'trim' && <TrimTab {...p} />}
        {p.tab === 'sound' && <SoundTab {...p} />}
        {p.tab === 'tags' && <TagsTab {...p} />}
        {p.tab === 'lyrics' && (
          <LyricsPanel
            title={p.draft.meta.title}
            artist={p.draft.meta.artist}
            lyrics={p.draft.meta.lyrics}
            syncedLyrics={p.draft.meta.syncedLyrics}
            duration={(p.draft.clip.end - p.draft.clip.start) / (p.draft.clip.speed || 1)}
            rows={14}
            onChange={p.onLyrics}
          />
        )}
        {p.tab === 'cover' && <CoverTab {...p} />}
      </div>
    </div>
  )
}

function TrimTab({ draft, duration, playhead, peaks, perSecond, onClip, onSnap, onToPlayhead, onPreviewEdge }: Props) {
  const { clip } = draft
  const len = clip.end - clip.start
  return (
    <div className="flex flex-col gap-3">
      <EdgeZoom
        label="Start"
        edge="start"
        value={clip.start}
        other={clip.end}
        duration={duration}
        playhead={playhead}
        peaks={peaks}
        perSecond={perSecond}
        color={draft.color}
        onChange={(t, g) => onClip({ start: t }, g)}
        onSnap={() => onSnap('start')}
        onToPlayhead={() => onToPlayhead('start')}
        onPreview={() => onPreviewEdge('start')}
      />
      <EdgeZoom
        label="End"
        edge="end"
        value={clip.end}
        other={clip.start}
        duration={duration}
        playhead={playhead}
        peaks={peaks}
        perSecond={perSecond}
        color={draft.color}
        onChange={(t, g) => onClip({ end: t }, g)}
        onSnap={() => onSnap('end')}
        onToPlayhead={() => onToPlayhead('end')}
        onPreview={() => onPreviewEdge('end')}
      />
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="Clip length" value={fmtTime(len, true)} />
        <Stat label="Final length" value={fmtTime(len / (clip.speed || 1), true)} hint={clip.speed !== 1 ? `at ${clip.speed}×` : undefined} />
      </div>
      <p className="text-xs leading-relaxed text-ink-400">
        Drag a zoom strip to jog the edge (hold Shift for fine control). The magnet snaps the edge to the nearest quiet spot so the cut doesn't click.
      </p>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-ink-800 px-3 py-2">
      <div className="text-ink-400">{label}</div>
      <div className="mt-0.5 font-mono text-[13px] text-ink-100">
        {value} {hint && <span className="text-[11px] text-ink-400">{hint}</span>}
      </div>
    </div>
  )
}

function SliderRow({ icon, label, value, display, min, max, step, onChange, onReset, group }: {
  icon?: ReactNode
  label: string
  value: number
  display: string
  min: number
  max: number
  step: number
  onChange: (v: number, group?: string) => void
  onReset?: () => void
  group: string
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-ink-200">
          {icon}
          {label}
        </span>
        <span className="flex items-center gap-1">
          <span className="font-mono text-ink-100">{display}</span>
          {onReset && (
            <button onClick={onReset} className="rounded p-0.5 text-ink-400 hover:text-ink-100" title="Reset" aria-label={`Reset ${label}`}>
              <RotateCcw size={11} />
            </button>
          )}
        </span>
      </div>
      <Range label={label} value={value} min={min} max={max} step={step} onChange={(v) => onChange(v, group)} />
    </div>
  )
}

function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{children}</span>
      {right}
    </div>
  )
}

/** Built-in and custom tone/space presets, plus "save current as preset" (up to 5). */
function FxPresets({ clip, onClip }: { clip: ClipSettings; onClip: Props['onClip'] }) {
  const settings = useApp((s) => s.settings)
  const setSettings = useApp((s) => s.setSettings)
  const toast = useApp((s) => s.toast)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const custom = settings?.fxPresets ?? []
  const isActive = (p: FxPreset) =>
    fxEqual(clip.fx, p.fx) && (p.speed == null || (Math.abs(p.speed - clip.speed) < 0.001 && (p.pitch ?? 0) === clip.pitch))
  const apply = (p: FxPreset) => onClip(p.speed != null ? { fx: { ...p.fx }, speed: p.speed, pitch: p.pitch ?? 0 } : { fx: { ...p.fx } })
  const save = async () => {
    const n = name.trim()
    setNaming(false)
    setName('')
    if (!n || !settings) return
    const preset: FxPreset = { id: newKey('fx'), name: n.slice(0, 24), fx: { ...clip.fx }, speed: clip.speed, pitch: clip.pitch }
    setSettings(await api.settings.set({ fxPresets: [...custom, preset].slice(0, MAX_CUSTOM_PRESETS) }))
    toast({ kind: 'success', title: `Saved preset "${preset.name}"` })
  }
  const remove = async (id: string) => settings && setSettings(await api.settings.set({ fxPresets: custom.filter((p) => p.id !== id) }))

  const chip = (p: FxPreset, deletable = false) => (
    <span key={p.id} className="group relative">
      <button
        onClick={() => apply(p)}
        className={cx(
          'flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition',
          isActive(p) ? 'border-ember-500/70 bg-ember-500/10 text-ember-400' : 'border-ink-600 text-ink-300 hover:border-ink-500 hover:text-ink-100',
          deletable && 'pr-6'
        )}
        title={p.speed != null && p.speed !== 1 ? `${p.name} (also sets speed ${p.speed}× and pitch ${p.pitch ?? 0} st)` : p.name}
      >
        {isActive(p) && <Check size={11} />}
        {p.name}
      </button>
      {deletable && (
        <button
          onClick={() => remove(p.id)}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-ink-400 hover:bg-ink-600 hover:text-ink-100"
          aria-label={`Delete preset ${p.name}`}
          title="Delete preset"
        >
          <X size={10} />
        </button>
      )}
    </span>
  )

  return (
    <div className="flex flex-wrap gap-1.5">
      {FX_PRESETS.map((p) => chip(p))}
      {custom.map((p) => chip(p, true))}
      {naming ? (
        <input
          autoFocus
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') {
              setNaming(false)
              setName('')
            }
          }}
          placeholder="Preset name"
          className="h-7 w-32 rounded-full border border-ember-500/60 bg-ink-850 px-3 text-xs outline-none"
        />
      ) : (
        custom.length < MAX_CUSTOM_PRESETS && (
          <button
            onClick={() => setNaming(true)}
            className="flex h-7 items-center gap-1 rounded-full border border-dashed border-ink-500 px-2.5 text-xs text-ink-400 hover:border-ink-300 hover:text-ink-100"
            title={`Save the current sound as your own preset (${custom.length}/${MAX_CUSTOM_PRESETS} used)`}
          >
            <Plus size={12} /> Save mine
          </button>
        )
      )}
    </div>
  )
}

const CLEANUP: Array<{ value: Cleanup; label: string; desc: string; icon: ReactNode; ai?: boolean }> = [
  { value: 'none', label: 'Original', desc: 'Keep the audio as is', icon: <Ban size={14} /> },
  { value: 'denoise', label: 'Denoise', desc: 'Less hiss and rumble', icon: <Wand2 size={14} /> },
  { value: 'vocals', label: 'Vocals only', desc: 'Remove music and crowd', icon: <Mic2 size={14} />, ai: true },
  { value: 'instrumental', label: 'Instrumental', desc: 'Remove the voice (karaoke)', icon: <Piano size={14} />, ai: true }
]

function SoundTab({ draft, onClip, demucsOk, onApplyToAll, clipCount }: Props) {
  const navigate = useApp((s) => s.navigate)
  const c = draft.clip
  const fx = c.fx ?? FX_DEFAULTS
  const setFx = (patch: Partial<FxSettings>, group?: string) => onClip({ fx: { ...fx, ...patch } }, group)
  const fmtDb = (v: number) => `${v > 0 ? '+' : ''}${Number.isInteger(v) ? v : v.toFixed(1)}dB`
  const activePreset = SPEED_PRESETS.find((p) => Math.abs(p.speed - c.speed) < 0.001 && p.pitch === c.pitch)?.id
  return (
    <div className="flex flex-col gap-5">
      <section>
        <SectionTitle>Speed & pitch style</SectionTitle>
        <div className="grid grid-cols-3 gap-1.5">
          {SPEED_PRESETS.map((pr) => (
            <button
              key={pr.id}
              onClick={() => onClip({ speed: pr.speed, pitch: pr.pitch })}
              className={cx(
                'rounded-lg border px-2 py-2 text-left transition',
                activePreset === pr.id ? 'border-ember-500/70 bg-ember-500/10' : 'border-ink-600 hover:border-ink-500 hover:bg-ink-800'
              )}
            >
              <div className={cx('text-xs font-semibold', activePreset === pr.id && 'text-ember-400')}>{pr.label}</div>
              <div className="mt-0.5 font-mono text-[10px] text-ink-400">{pr.hint}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SliderRow
          icon={<Gauge size={13} />}
          label="Speed"
          value={c.speed}
          display={`${c.speed.toFixed(2)}×`}
          min={0.5}
          max={2}
          step={0.01}
          group="speed"
          onChange={(v, g) => onClip({ speed: Math.round(v * 100) / 100 }, g)}
          onReset={c.speed !== 1 ? () => onClip({ speed: 1 }) : undefined}
        />
        <SliderRow
          icon={<Music4 size={13} />}
          label="Pitch"
          value={c.pitch}
          display={`${c.pitch > 0 ? '+' : ''}${c.pitch} st`}
          min={-12}
          max={12}
          step={0.5}
          group="pitch"
          onChange={(v, g) => onClip({ pitch: v }, g)}
          onReset={c.pitch !== 0 ? () => onClip({ pitch: 0 }) : undefined}
        />
        <SliderRow
          icon={<Volume2 size={13} />}
          label="Gain"
          value={c.gain}
          display={`${c.gain > 0 ? '+' : ''}${c.gain.toFixed(1)} dB`}
          min={-12}
          max={12}
          step={0.5}
          group="gain"
          onChange={(v, g) => onClip({ gain: v }, g)}
          onReset={c.gain !== 0 ? () => onClip({ gain: 0 }) : undefined}
        />
        <div className="grid grid-cols-2 gap-4">
          <SliderRow label="Fade in" value={c.fadeIn} display={`${c.fadeIn.toFixed(1)}s`} min={0} max={5} step={0.1} group="fadeIn" onChange={(v, g) => onClip({ fadeIn: v }, g)} />
          <SliderRow label="Fade out" value={c.fadeOut} display={`${c.fadeOut.toFixed(1)}s`} min={0} max={8} step={0.1} group="fadeOut" onChange={(v, g) => onClip({ fadeOut: v }, g)} />
        </div>
      </section>

      <section>
        <SectionTitle
          right={
            (fx.bass || fx.mid || fx.treble || fx.reverb) ? (
              <button onClick={() => onClip({ fx: { ...FX_DEFAULTS } })} className="flex items-center gap-1 text-[11px] text-ink-400 hover:text-ink-100">
                <RotateCcw size={11} /> Reset
              </button>
            ) : null
          }
        >
          Effects
        </SectionTitle>
        <FxPresets clip={c} onClip={onClip} />
        <div className="mt-4 grid grid-cols-3 gap-3">
          <SliderRow label="Bass" value={fx.bass} display={fmtDb(fx.bass)} min={-12} max={12} step={0.5} group="fx.bass" onChange={(v, g) => setFx({ bass: v }, g)} />
          <SliderRow label="Mid" value={fx.mid} display={fmtDb(fx.mid)} min={-12} max={12} step={0.5} group="fx.mid" onChange={(v, g) => setFx({ mid: v }, g)} />
          <SliderRow label="Treble" value={fx.treble} display={fmtDb(fx.treble)} min={-12} max={12} step={0.5} group="fx.treble" onChange={(v, g) => setFx({ treble: v }, g)} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <SliderRow
            icon={<Waves size={13} />}
            label="Reverb"
            value={fx.reverb}
            display={`${Math.round(fx.reverb * 100)}%`}
            min={0}
            max={1}
            step={0.01}
            group="fx.reverb"
            onChange={(v, g) => setFx({ reverb: v }, g)}
          />
          <div className={cx(!fx.reverb && 'pointer-events-none opacity-40')}>
            <SliderRow
              label="Room size"
              value={fx.room}
              display={fx.room < 0.34 ? 'Small' : fx.room < 0.67 ? 'Medium' : 'Large'}
              min={0}
              max={1}
              step={0.01}
              group="fx.room"
              onChange={(v, g) => setFx({ room: v }, g)}
            />
          </div>
        </div>
      </section>

      <section className="flex items-center justify-between gap-4 rounded-lg bg-ink-800 px-3 py-2.5">
        <div>
          <div className="text-[13px] font-medium">Normalize loudness</div>
          <div className="text-[11px] text-ink-400">−14 LUFS, like Spotify. Applied on export</div>
        </div>
        <Toggle label="Normalize loudness" checked={c.normalize} onChange={(normalize) => onClip({ normalize })} />
      </section>

      <section>
        <SectionTitle>Voice & cleanup · applied when you forge</SectionTitle>
        <div className="grid grid-cols-2 gap-1.5">
          {CLEANUP.map((o) => (
            <button
              key={o.value}
              onClick={() => onClip({ cleanup: o.value })}
              className={cx(
                'flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition',
                c.cleanup === o.value ? 'border-ember-500/70 bg-ember-500/10' : 'border-ink-600 hover:border-ink-500 hover:bg-ink-800'
              )}
            >
              <span className={cx('mt-0.5', c.cleanup === o.value ? 'text-ember-400' : 'text-ink-400')}>{o.icon}</span>
              <span className="min-w-0">
                <span className={cx('block text-xs font-semibold', c.cleanup === o.value && 'text-ember-400')}>
                  {o.label}
                  {o.ai && <span className="ml-1 rounded bg-ink-700 px-1 text-[9px] font-bold text-ink-300">AI</span>}
                </span>
                <span className="block text-[10.5px] leading-snug text-ink-400">{o.desc}</span>
              </span>
            </button>
          ))}
        </div>
        {(c.cleanup === 'vocals' || c.cleanup === 'instrumental') && (
          <p className="mt-2 text-xs leading-relaxed text-ink-400">
            {demucsOk ? (
              'Uses AI to split the voice from the music. Takes about a minute per song. The live preview plays the original.'
            ) : (
              <span className="text-amber-500">
                This needs the free AI add-on (Demucs).{' '}
                <button className="underline" onClick={() => navigate({ name: 'settings' })}>
                  Install it in Settings
                </button>
              </span>
            )}
          </p>
        )}
      </section>

      {clipCount > 1 && (
        <Button size="sm" variant="ghost" icon={<Copy size={13} />} onClick={() => onApplyToAll('sound')}>
          Apply these sound settings to all clips
        </Button>
      )}
    </div>
  )
}

function TagsTab({ draft, onMeta, onAutofill, onApplyToAll, onCover, clipCount }: Props) {
  const library = useApp((s) => s.library)
  const artists = useMemo(() => [...new Set(library.songs.map((s) => s.artist).filter(Boolean))], [library.songs])
  const albums = useMemo(() => [...new Set(library.songs.map((s) => s.album).filter(Boolean))], [library.songs])
  const m = draft.meta
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-400">Saved in the MP3 for Spotify.</span>
        <div className="flex shrink-0">
          <Button size="sm" variant="ghost" onClick={onAutofill} icon={<Sparkles size={13} />} title="Guess the title and artist from the video title">
            Auto-fill
          </Button>
          <TagLookupButton
            title={m.title}
            artist={m.artist}
            duration={(draft.clip.end - draft.clip.start) / (draft.clip.speed || 1)}
            onPick={({ match, coverPath }) => {
              if (!m.artist) onMeta('artist', match.artist)
              onMeta('album', match.album)
              onMeta('year', match.year)
              onMeta('genre', match.genre)
              if (coverPath) onCover({ kind: 'upload', src: mediaUrl(coverPath), panX: 0.5, panY: 0.5, zoom: 1 })
            }}
          />
        </div>
      </div>
      <Field label="Title">
        <Input value={m.title} onChange={(e) => onMeta('title', e.target.value)} placeholder="Song title" />
      </Field>
      <Field label="Artist">
        <Input value={m.artist} onChange={(e) => onMeta('artist', e.target.value)} placeholder="e.g. Chaewon" list="sf-artists" />
        <datalist id="sf-artists">
          {artists.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
      </Field>
      <Field label="Album">
        <Input value={m.album} onChange={(e) => onMeta('album', e.target.value)} placeholder="e.g. Live Stages" list="sf-albums" />
        <datalist id="sf-albums">
          {albums.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Year">
          <Input value={m.year} onChange={(e) => onMeta('year', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2026" />
        </Field>
        <Field label="Genre">
          <Input value={m.genre} onChange={(e) => onMeta('genre', e.target.value)} placeholder="K-Pop" list="sf-genres" />
          <datalist id="sf-genres">
            {['K-Pop', 'Pop', 'R&B', 'Ballad', 'Hip-Hop', 'Rock', 'Indie', 'Acoustic', 'Live', 'Cover', 'J-Pop', 'OST'].map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Field>
      </div>
      {clipCount > 1 && (
        <Button size="sm" variant="ghost" icon={<Copy size={13} />} onClick={() => onApplyToAll('artist-album')}>
          Use this artist, album, year & genre for all clips
        </Button>
      )}
    </div>
  )
}

function CoverTab({ draft, onCover, thumbnailPath, video, onApplyToAll, clipCount }: Props) {
  return (
    <div className="flex flex-col items-center gap-4">
      <CoverCropper value={draft.cover} onChange={onCover} thumbnailPath={thumbnailPath} video={video} size={292} />
      <p className="text-center text-xs leading-relaxed text-ink-400">
        Tip: pause the video on a good shot, then press <b className="text-ink-200">Frame</b>. Drag the preview to reposition it.
      </p>
      {clipCount > 1 && (
        <Button size="sm" variant="ghost" icon={<Copy size={13} />} onClick={() => onApplyToAll('cover')}>
          Use this cover for all clips
        </Button>
      )}
    </div>
  )
}
