import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, Download, FolderOpen, Loader2, RefreshCw, Trash2, XCircle, Upload, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { MAX_CUSTOM_PRESETS, type Settings, type ToolStatus } from '@shared/types'
import { api, newJobId } from '@/lib/api'
import { useApp } from '@/lib/store'
import { Button, Range, Segmented, Toggle } from '@/components/ui'
import { AppearanceSettings } from '@/components/AppearanceSettings'

export function SettingsPage() {
  const settings = useApp((s) => s.settings)
  const setSettings = useApp((s) => s.setSettings)
  const toast = useApp((s) => s.toast)
  const [tools, setTools] = useState<ToolStatus | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const jobRef = useRef('')

  useEffect(() => {
    api.tools.status().then(setTools)
    return api.onProgress((e) => {
      if (e.jobId === jobRef.current && e.detail) setLog((l) => [...l.slice(-200), e.detail!])
    })
  }, [])

  if (!settings) return null
  const save = async (patch: Partial<Settings>) => setSettings(await api.settings.set(patch))

  const changeFolder = async () => {
    const p = await api.dialog.pickFolder()
    if (p) {
      await save({ outputDir: p })
      toast({ kind: 'info', title: 'Output folder changed', body: 'Add the new folder as a source in Spotify too. Existing songs stay where they are.' })
    }
  }

  const updateYt = async () => {
    setBusy('yt')
    try {
      const msg = await api.tools.updateYtdlp()
      toast({ kind: 'success', title: 'yt-dlp checked for updates', body: msg })
      setTools(await api.tools.status())
    } catch (e) {
      toast({ kind: 'error', title: 'Update failed', body: String(e) })
    }
    setBusy(null)
  }

  const installDemucs = async () => {
    setBusy('demucs')
    setLog([])
    jobRef.current = newJobId()
    try {
      const ok = await api.tools.installDemucs(jobRef.current)
      setTools(await api.tools.status())
      toast(ok ? { kind: 'success', title: 'Vocal isolation installed' } : { kind: 'error', title: 'Demucs install failed', body: 'See the log below.' })
    } catch (e) {
      toast({ kind: 'error', title: 'Demucs install failed', body: String((e as Error).message) })
    }
    setBusy(null)
  }

  const clearCache = async () => {
    if (!confirm('Delete downloaded source videos? Your forged songs are kept, but you will need to re-download a source to re-clip it.')) return
    await api.source.clearCache()
    toast({ kind: 'success', title: 'Cache cleared' })
  }

  return (
    <div className="mx-auto max-w-3xl px-6 pt-14 pb-16 lg:px-10">
      <h1 className="text-4xl font-bold tracking-tight">Settings</h1>

      <Group title="Appearance">
        <AppearanceSettings />
      </Group>

      <Group title="Output">
        <Row label="SongForge folder" desc="Where finished MP3s go. Add this folder to Spotify Local Files.">
          <div className="flex max-w-sm items-center gap-2">
            <code className="truncate rounded-md bg-ink-800 px-2 py-1 font-mono text-xs text-ink-300" title={settings.outputDir}>
              {settings.outputDir}
            </code>
            <Button size="sm" onClick={changeFolder}>
              Change
            </Button>
            <Button size="sm" variant="ghost" onClick={() => api.shell.openPath(settings.outputDir)} aria-label="Open folder">
              <FolderOpen size={14} />
            </Button>
          </div>
        </Row>
        <Row label="MP3 quality" desc="320 kbps is the best MP3 quality and what Spotify Premium streams at.">
          <Segmented
            value={String(settings.bitrate)}
            onChange={(v) => save({ bitrate: Number(v) as Settings['bitrate'] })}
            options={[
              { value: '320', label: '320k' },
              { value: '256', label: '256k' },
              { value: '192', label: '192k' }
            ]}
          />
        </Row>
      </Group>

      <Group title="Library">
        <Row label="Import songs" desc="Add MP3s and other audio files you already have. They're copied into your SongForge folder.">
          <Button size="sm" icon={<Upload size={14} />} onClick={() => useApp.getState().setImportOpen(true)}>
            Import…
          </Button>
        </Row>
      </Group>

      <Group title="Helpers & privacy">
        <Row label="Offer to forge copied links" desc="When you switch back to SongForge after copying a YouTube, TikTok or SoundCloud link, it asks if you want to forge it.">
          <Toggle label="Offer to forge copied links" checked={settings.clipboardWatch} onChange={(v) => save({ clipboardWatch: v })} />
        </Row>
        <Row label="Notifications" desc="Show a Windows notification when a download, forge or import finishes while you're in another app.">
          <Toggle label="Notifications" checked={settings.notifications} onChange={(v) => save({ notifications: v })} />
        </Row>
        <div className="flex gap-3 py-4 text-xs leading-relaxed text-ink-400">
          <ShieldCheck size={16} className="shrink-0 text-emerald-400" />
          <span>
            The clipboard is only read when you switch back to SongForge, only checked for a link, and never saved, logged or sent anywhere. SongForge has no accounts, tracking or analytics. The only
            outside services it talks to are the sites you download from and LRCLIB when you click "Find lyrics" (which sends just the song title, artist and length).
          </span>
        </div>
      </Group>

      <Group title={`Your sound presets · ${settings.fxPresets.length}/${MAX_CUSTOM_PRESETS}`}>
        {settings.fxPresets.length === 0 ? (
          <p className="py-4 text-xs leading-relaxed text-ink-400">Make a preset in the editor: set up the Effects in the Sound tab, then click "Save mine".</p>
        ) : (
          settings.fxPresets.map((p) => (
            <Row
              key={p.id}
              label={p.name}
              desc={[
                p.speed && p.speed !== 1 ? `${p.speed}×` : '',
                p.pitch ? `${p.pitch > 0 ? '+' : ''}${p.pitch} st` : '',
                p.fx.bass ? `Bass ${p.fx.bass > 0 ? '+' : ''}${p.fx.bass} dB` : '',
                p.fx.mid ? `Mid ${p.fx.mid > 0 ? '+' : ''}${p.fx.mid} dB` : '',
                p.fx.treble ? `Treble ${p.fx.treble > 0 ? '+' : ''}${p.fx.treble} dB` : '',
                p.fx.reverb ? `Reverb ${Math.round(p.fx.reverb * 100)}%` : ''
              ]
                .filter(Boolean)
                .join(' · ') || 'No changes'}
            >
              <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => save({ fxPresets: settings.fxPresets.filter((x) => x.id !== p.id) })}>
                Delete
              </Button>
            </Row>
          ))
        )}
      </Group>

      <Group title="Clip defaults">
        <Row label="Normalize loudness" desc="Level new clips to −14 LUFS so they match Spotify tracks.">
          <Toggle checked={settings.defaultNormalize} onChange={(v) => save({ defaultNormalize: v })} />
        </Row>
        <Row label={`Fade in · ${settings.defaultFadeIn.toFixed(1)}s`}>
          <Range className="w-48" value={settings.defaultFadeIn} max={5} step={0.1} onChange={(v) => save({ defaultFadeIn: v })} />
        </Row>
        <Row label={`Fade out · ${settings.defaultFadeOut.toFixed(1)}s`}>
          <Range className="w-48" value={settings.defaultFadeOut} max={8} step={0.1} onChange={(v) => save({ defaultFadeOut: v })} />
        </Row>
        <Row label="Video preview" desc="Download a small 480p copy so you can see the video and grab frames for cover art.">
          <Toggle checked={settings.downloadVideoPreview} onChange={(v) => save({ downloadVideoPreview: v })} />
        </Row>
      </Group>

      <Group title="Tools">
        <Row label="yt-dlp" desc={tools?.ytdlp.ok ? `Version ${tools.ytdlp.version}` : 'Downloads automatically on first use'} status={tools?.ytdlp.ok}>
          <Button size="sm" onClick={updateYt} disabled={busy === 'yt'} icon={busy === 'yt' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}>
            Update
          </Button>
        </Row>
        <Row label="ffmpeg" desc="Bundled with the app" status={tools?.ffmpeg.ok}>
          <span />
        </Row>
        <Row
          label="AI vocal isolation (Demucs)"
          desc={
            tools?.demucs.ok
              ? 'Installed. Choose "Vocals only" or "Instrumental" in the editor\'s Sound tab.'
              : `Optional. Powers "Vocals only" and "Instrumental" (karaoke) exports. Needs Python 3 and about 2 GB of downloads.${tools?.demucs.error ? ` (${tools.demucs.error})` : ''}`
          }
          status={tools?.demucs.ok}
        >
          {!tools?.demucs.ok && (
            <Button size="sm" onClick={installDemucs} disabled={busy === 'demucs'} icon={busy === 'demucs' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}>
              {busy === 'demucs' ? 'Installing…' : 'Install'}
            </Button>
          )}
        </Row>
        {log.length > 0 && (
          <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-ink-950 p-3 font-mono text-[11px] leading-relaxed text-ink-400 select-text">{log.join('\n')}</pre>
        )}
      </Group>

      <Group title="Storage">
        <Row label="Source cache" desc="Downloaded videos kept so you can re-clip them later.">
          <Button size="sm" variant="danger" onClick={clearCache} icon={<Trash2 size={14} />}>
            Clear cache
          </Button>
        </Row>
        <Row label="Setup guide" desc="Walk through the first-run steps again (theme, Spotify, helpers).">
          <Button size="sm" icon={<RotateCcw size={14} />} onClick={() => save({ onboarded: false })}>
            Run setup again
          </Button>
        </Row>
      </Group>

      <p className="mt-10 text-xs leading-relaxed text-ink-500">
        SongForge 1.0 · For personal use. Downloading from YouTube may go against YouTube's Terms of Service. Only forge content you have the right to keep.
      </p>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{title}</h2>
      <div className="divide-y divide-ink-800 rounded-xl border border-ink-700 bg-ink-850 px-5">{children}</div>
    </section>
  )
}

function Row({ label, desc, status, children }: { label: string; desc?: string; status?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4">
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex items-center gap-2 text-sm font-medium">
          {status !== undefined && (status ? <CheckCircle2 size={14} className="text-emerald-400" /> : <XCircle size={14} className="text-ink-500" />)}
          {label}
        </div>
        {desc && <div className="mt-0.5 text-xs leading-relaxed text-ink-400">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
