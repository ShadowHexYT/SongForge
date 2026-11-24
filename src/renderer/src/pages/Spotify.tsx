import { useEffect, useState, type ReactNode } from 'react'
import { Segmented } from '@/components/ui'
import { CheckCircle2, Circle, Copy, FolderOpen, Monitor, RefreshCw, Smartphone, ExternalLink, Info } from 'lucide-react'
import type { SpotifyStatus } from '@shared/types'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { Button, cx } from '@/components/ui'

export function SpotifyPage() {
  const toast = useApp((s) => s.toast)
  const settings = useApp((s) => s.settings)
  const [status, setStatus] = useState<SpotifyStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [phone, setPhone] = useState<'iphone' | 'android'>('iphone')

  const check = async () => {
    setChecking(true)
    setStatus(await api.spotify.status())
    setChecking(false)
  }
  useEffect(() => {
    check()
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const dir = status?.outputDir ?? settings?.outputDir ?? ''
  const copy = async () => {
    await api.clipboard.write(dir)
    toast({ kind: 'success', title: 'Folder path copied' })
  }

  return (
    <div className="mx-auto max-w-4xl px-10 pt-14 pb-16">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1ed760]">Spotify Sync</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">Listen in Spotify</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-300">
        Every song you forge is saved as a tagged MP3 with cover art in your SongForge folder. Point Spotify Desktop at that folder once, and new songs show up in{' '}
        <b className="text-ink-100">Your Library → Local Files</b> automatically.
      </p>

      <div className="mt-8 grid grid-cols-3 gap-3">
        <StatusCard ok={!!status?.installed} title="Spotify Desktop" body={status?.installed ? 'Installed' : 'Not detected'} />
        <StatusCard ok={!!status?.folderRegistered} title="SongForge folder" body={status?.folderRegistered ? 'Added as a source' : 'Not added yet'} />
        <StatusCard ok={(status?.songCount ?? 0) > 0} title="Songs ready" body={`${status?.songCount ?? 0} in folder`} />
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-850 p-2 pl-4">
        <FolderOpen size={16} className="shrink-0 text-ink-400" />
        <code className="flex-1 truncate font-mono text-[13px] text-ink-200 select-text">{dir}</code>
        <Button size="sm" variant="ghost" onClick={copy} icon={<Copy size={14} />}>
          Copy
        </Button>
        <Button size="sm" onClick={() => api.shell.openPath(dir)} icon={<FolderOpen size={14} />}>
          Open
        </Button>
        <Button size="sm" variant="ghost" onClick={check} icon={<RefreshCw size={14} className={checking ? 'animate-spin' : ''} />}>
          Check
        </Button>
      </div>

      <Section icon={<Monitor size={18} />} title="1 · On this PC (one-time setup)">
        <Step n={1}>
          Open Spotify Desktop.{' '}
          <button className="inline-flex items-center gap-1 text-[#1ed760] hover:underline" onClick={() => api.spotify.open()}>
            Open Spotify <ExternalLink size={12} />
          </button>
        </Step>
        <Step n={2}>
          Click your <b>profile picture → Settings</b>.
        </Step>
        <Step n={3}>
          Scroll to <b>Your Library</b> and turn on <b>Show Local Files</b>.
        </Step>
        <Step n={4}>
          Under <b>Show songs from</b>, click <b>Add a source</b> and choose the SongForge folder above. You can use <b>Copy</b> and paste the path into the folder picker.
        </Step>
        <Step n={5}>
          Go to <b>Your Library → Local Files</b>. Your forged songs appear there with their titles, artists and cover art, and new ones arrive automatically.
        </Step>
      </Section>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2.5 text-lg font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-ink-800 text-ink-200">
              <Smartphone size={18} />
            </span>
            2 · On your phone (Premium)
          </h2>
          <Segmented
            value={phone}
            onChange={setPhone}
            options={[
              { value: 'iphone', label: 'iPhone' },
              { value: 'android', label: 'Android' }
            ]}
          />
        </div>
        <ol className="mt-4 flex flex-col gap-2">
          <Step n={1}>
            On the PC, create a Spotify playlist (for example <b>SongForge</b>). In <b>Local Files</b>, select songs (<b>Ctrl+A</b> selects all), right-click and choose <b>Add to playlist</b>.
          </Step>
          <Step n={2}>
            Connect your phone to the <b>same Wi-Fi</b> as this PC. Sign in to the <b>same Spotify account</b> on both, and leave Spotify Desktop open.
          </Step>
          {phone === 'iphone' ? (
            <>
              <Step n={3}>
                On the iPhone, open Spotify, tap your <b>profile picture → Settings and privacy → Apps and devices</b> and turn on <b>Local audio files</b>.
              </Step>
              <Step n={4}>
                If Spotify asks to <b>find and connect to devices on your local network</b>, tap <b>Allow</b>. Missed it? Turn it on in iPhone <b>Settings → Privacy &amp; Security → Local Network → Spotify</b>.
              </Step>
            </>
          ) : (
            <>
              <Step n={3}>
                On the Android phone, open Spotify, tap your <b>profile picture → Settings and privacy → Apps and devices</b> and turn on <b>Local audio files</b>.
              </Step>
              <Step n={4}>
                If Android asks Spotify for permission to find <b>nearby devices</b> or access <b>music and audio</b>, allow it.
              </Step>
            </>
          )}
          <Step n={5}>
            Open the playlist on your phone and turn on <b>Download</b> (the arrow button). When the songs finish downloading they play anywhere, even offline.
          </Step>
          <Step n={6}>New songs later? Add them to the same playlist on the PC, then open Spotify on your phone at home. They download on their own.</Step>
        </ol>
      </section>

      <section className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-5">
        <h3 className="text-sm font-semibold">Songs greyed out or not downloading on the phone?</h3>
        <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-ink-300 marker:text-ink-500">
          <li>Both devices must be on the same Wi-Fi network (not a guest network, and the phone not on mobile data or a VPN).</li>
          <li>Spotify Desktop has to be open on this PC while the phone downloads.</li>
          <li>Check that <b className="text-ink-100">Local audio files</b> is on in the phone's Spotify settings, and that it's the same Spotify account as the PC.</li>
          {phone === 'iphone' ? (
            <li>
              Check iPhone <b className="text-ink-100">Settings → Privacy &amp; Security → Local Network</b>, and make sure Spotify is switched on.
            </li>
          ) : (
            <li>
              Android alternative without Wi-Fi sync: copy MP3s from the SongForge folder onto the phone with a USB cable, then turn on <b className="text-ink-100">Show audio files from this device</b> in Spotify's settings.
            </li>
          )}
          <li>Still stuck? Close and reopen Spotify on both devices. Downloads often start right after.</li>
        </ul>
      </section>

      <div className="mt-8 flex gap-3 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 text-sm text-ink-300">
        <Info size={18} className="mt-0.5 shrink-0 text-sky-400" />
        <p className="leading-relaxed">
          <b className="text-ink-100">Why not fully automatic?</b> Spotify doesn't let apps upload audio, and its API can't add local files to playlists. Local Files is the only supported route. Once the folder is
          added, everything on the PC side happens automatically. Only adding songs to a playlist for your phone is manual.
        </p>
      </div>
    </div>
  )
}

function StatusCard({ ok, title, body }: { ok: boolean; title: string; body: string }) {
  return (
    <div className={cx('rounded-xl border p-4', ok ? 'border-[#1ed760]/30 bg-[#1ed760]/5' : 'border-ink-700 bg-ink-850')}>
      <div className="flex items-center gap-2">
        {ok ? <CheckCircle2 size={16} className="text-[#1ed760]" /> : <Circle size={16} className="text-ink-500" />}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="mt-1 pl-6 text-xs text-ink-400">{body}</div>
    </div>
  )
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2.5 text-lg font-semibold">
        <span className="flex size-8 items-center justify-center rounded-lg bg-ink-800 text-ink-200">{icon}</span>
        {title}
      </h2>
      <ol className="mt-4 flex flex-col gap-2">{children}</ol>
    </section>
  )
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-4 rounded-xl border border-ink-800 bg-ink-850/60 p-4 text-sm leading-relaxed text-ink-300 [&_b]:font-semibold [&_b]:text-ink-100">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-700 font-mono text-xs text-ink-200">{n}</span>
      <div>{children}</div>
    </li>
  )
}
