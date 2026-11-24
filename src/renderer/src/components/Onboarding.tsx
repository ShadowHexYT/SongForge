import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  FolderOpen,
  Headphones,
  Link2,
  Loader2,
  Monitor,
  Moon,
  Scissors,
  ShieldCheck,
  Sun,
  Upload,
  Compass
} from 'lucide-react'
import type { Appearance, Settings, SpotifyStatus } from '@shared/types'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { ACCENTS } from '@/lib/theme'
import { LogoMark } from './Logo'
import { Button, Segmented, Toggle, cx } from './ui'

const STEPS = ['Welcome', 'Look', 'Spotify', 'Helpers', 'Done'] as const

/** First-run setup: a few friendly steps, all skippable and all changeable later in Settings. */
export function Onboarding({ onImport }: { onImport: () => void }) {
  const settings = useApp((s) => s.settings)
  const setSettings = useApp((s) => s.setSettings)
  const toast = useApp((s) => s.toast)
  const [step, setStep] = useState(0)
  const [spotify, setSpotify] = useState<SpotifyStatus | null>(null)
  const [ytdlp, setYtdlp] = useState<'checking' | 'ok' | 'error'>('checking')

  useEffect(() => {
    api.tools
      .ensureYtdlp()
      .then(() => setYtdlp('ok'))
      .catch(() => setYtdlp('error'))
  }, [])
  useEffect(() => {
    if (step !== 2) return
    const check = () => api.spotify.status().then(setSpotify)
    check()
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [step, settings?.outputDir])

  if (!settings) return null
  const save = async (patch: Partial<Settings>) => {
    setSettings({ ...settings, ...patch })
    setSettings(await api.settings.set(patch))
  }
  const finish = async (then?: () => void) => {
    await save({ onboarded: true })
    then?.()
  }
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-ink-950/90 p-4 backdrop-blur-md">
      <div className="drag absolute inset-x-0 top-0 h-10" />
      <div className="relative my-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-ink-700 bg-ink-900 shadow-2xl">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[520px] -translate-x-1/2 rounded-full bg-ember-500/20 blur-3xl" />

        {/* Progress */}
        <div className="relative flex items-center gap-2 px-8 pt-6">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col gap-1.5">
              <div className={cx('h-1 rounded-full transition-colors', i <= step ? 'forge-gradient' : 'bg-ink-700')} />
              <span className={cx('text-[10px] font-semibold uppercase tracking-wider max-sm:hidden', i === step ? 'text-ink-200' : 'text-ink-500')}>{label}</span>
            </div>
          ))}
        </div>

        <div className="relative min-h-[360px] px-8 py-8">
          {step === 0 && (
            <div className="flex flex-col items-center text-center">
              <LogoMark size={56} />
              <h1 className="mt-5 text-3xl font-bold tracking-tight">
                Welcome to Song<span className="forge-text">Forge</span>
              </h1>
              <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-300">Turn the songs inside videos into music you keep, with a title, artist and cover, ready for Spotify.</p>
              <div className="mt-8 grid w-full grid-cols-3 gap-3 max-sm:grid-cols-1">
                <HowStep n={1} icon={<Link2 size={18} />} title="Paste a link" body="YouTube, TikTok, SoundCloud and more. Or search right in the app." />
                <HowStep n={2} icon={<Scissors size={18} />} title="Clip & tag" body="Mark the song, name it, pick a cover. SongForge can find the songs for you." />
                <HowStep n={3} icon={<Headphones size={18} />} title="Listen anywhere" body="Play it here, or in Spotify on your PC and phone." />
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Make it yours</h2>
              <p className="mt-1 text-sm text-ink-400">Pick a mode and a color. There are more themes in Settings.</p>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-ink-700 bg-ink-850 p-4">
                <span className="text-sm font-medium">Mode</span>
                <Segmented<Appearance>
                  value={settings.appearance}
                  onChange={(appearance) => save({ appearance })}
                  options={[
                    { value: 'dark', label: 'Dark', icon: <Moon size={13} /> },
                    { value: 'light', label: 'Light', icon: <Sun size={13} /> },
                    { value: 'system', label: 'Match Windows', icon: <Monitor size={13} /> }
                  ]}
                />
              </div>
              <div className="mt-4 rounded-xl border border-ink-700 bg-ink-850 p-4">
                <span className="text-sm font-medium">Accent color</span>
                <div className="mt-3 grid grid-cols-8 gap-2 max-sm:grid-cols-4">
                  {ACCENTS.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => save({ accent: a.id })}
                      title={a.name}
                      aria-label={a.name}
                      className={cx('relative aspect-square rounded-full transition hover:scale-105', settings.accent === a.id && 'ring-2 ring-ink-100 ring-offset-2 ring-offset-ink-850')}
                      style={{ background: `linear-gradient(135deg, ${a.from}, ${a.to})` }}
                    >
                      {settings.accent === a.id && <Check size={16} className="absolute inset-0 m-auto text-white drop-shadow" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Connect Spotify (optional)</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-400">
                Songs are saved as MP3s in one folder. Tell Spotify Desktop about that folder once, and every new song shows up under <b className="text-ink-200">Local Files</b>.
              </p>
              <div className="mt-5 flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-850 p-2 pl-4">
                <FolderOpen size={16} className="shrink-0 text-ink-400" />
                <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-200" title={settings.outputDir}>
                  {settings.outputDir}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Copy size={13} />}
                  onClick={async () => {
                    await api.clipboard.write(settings.outputDir)
                    toast({ kind: 'success', title: 'Folder path copied' })
                  }}
                >
                  Copy
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    const p = await api.dialog.pickFolder()
                    if (p) save({ outputDir: p })
                  }}
                >
                  Change
                </Button>
              </div>
              <ol className="mt-5 flex flex-col gap-2.5 text-sm text-ink-200">
                <Li n={1}>In Spotify Desktop, open your profile menu → <b>Settings</b>.</Li>
                <Li n={2}>
                  Under <b>Your Library</b>, turn on <b>Show Local Files</b>.
                </Li>
                <Li n={3}>
                  Click <b>Add a source</b> and choose the folder above.
                </Li>
              </ol>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button size="sm" onClick={() => api.spotify.open()}>
                  Open Spotify
                </Button>
                <span className={cx('inline-flex items-center gap-1.5 text-xs', spotify?.folderRegistered ? 'text-emerald-400' : 'text-ink-400')}>
                  {spotify?.folderRegistered ? <CheckCircle2 size={14} /> : <Loader2 size={13} className="animate-spin" />}
                  {spotify == null ? 'Checking…' : spotify.folderRegistered ? 'Spotify can see your SongForge folder' : spotify.installed ? 'Waiting for the folder to be added…' : "Spotify Desktop wasn't found. You can do this later."}
                </span>
              </div>
              <p className="mt-4 text-xs text-ink-400">Listening on your phone needs Spotify Premium: add songs to a playlist on your PC, then download that playlist on your phone while both are on the same Wi-Fi.</p>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Helpful extras</h2>
              <p className="mt-1 text-sm text-ink-400">Both are optional and can be changed in Settings.</p>
              <div className="mt-6 flex flex-col gap-3">
                <OptionRow
                  icon={<ClipboardPaste size={18} />}
                  title="Offer to forge copied links"
                  body="When you copy a YouTube, TikTok or SoundCloud link and switch back to SongForge, it asks if you want to forge it."
                  checked={settings.clipboardWatch}
                  onChange={(v) => save({ clipboardWatch: v })}
                />
                <OptionRow
                  icon={<Bell size={18} />}
                  title="Notifications"
                  body="A Windows notification when a download or forge finishes while you're in another app."
                  checked={settings.notifications}
                  onChange={(v) => save({ notifications: v })}
                />
              </div>
              <div className="mt-4 flex gap-3 rounded-xl bg-emerald-500/10 p-4 text-xs leading-relaxed text-ink-300">
                <ShieldCheck size={18} className="shrink-0 text-emerald-400" />
                <span>
                  <b className="text-ink-100">Private by design.</b> The clipboard is only checked when you switch back to SongForge, only for a link, and is never saved, logged or sent anywhere. SongForge has no accounts, tracking or analytics.
                </span>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-ink-400">
                {ytdlp === 'checking' ? <Loader2 size={13} className="animate-spin" /> : ytdlp === 'ok' ? <CheckCircle2 size={14} className="text-emerald-400" /> : null}
                {ytdlp === 'checking' ? 'Getting the video downloader ready…' : ytdlp === 'ok' ? 'Video downloader is ready' : "The downloader couldn't be fetched yet. It will retry when you paste a link."}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col items-center text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl forge-gradient text-on-accent shadow-accent">
                <Check size={28} />
              </div>
              <h2 className="mt-5 text-2xl font-bold tracking-tight">You're all set</h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-400">
                New here? Take the 1-minute tour to see where everything is. You can find it again anytime under <b className="text-ink-200">Help & tutorial</b>.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button variant="primary" size="lg" icon={<Compass size={17} />} onClick={() => finish(() => useApp.getState().startTour('app'))}>
                  Take the tour
                </Button>
                <Button size="lg" icon={<Scissors size={16} />} onClick={() => finish(() => useApp.getState().navigate({ name: 'forge' }))}>
                  Start forging
                </Button>
                <Button size="lg" icon={<Upload size={16} />} onClick={() => finish(onImport)}>
                  Import my songs
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="relative flex items-center justify-between border-t border-ink-800 px-8 py-4">
          {step === 0 ? (
            <button onClick={() => finish()} className="text-sm text-ink-400 hover:text-ink-100">
              Skip setup
            </button>
          ) : (
            <Button variant="ghost" onClick={back} icon={<ArrowLeft size={15} />}>
              Back
            </Button>
          )}
          {step < STEPS.length - 1 && (
            <Button variant="primary" onClick={next}>
              {step === 0 ? 'Get started' : step === 2 && !spotify?.folderRegistered ? 'Skip for now' : 'Next'}
              <ArrowRight size={15} />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function HowStep({ n, icon, title, body }: { n: number; icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-850 p-4 text-left">
      <div className="flex items-center gap-2 text-ember-400">
        {icon}
        <span className="font-mono text-[11px] text-ink-500">0{n}</span>
      </div>
      <div className="mt-2 text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-ink-400">{body}</div>
    </div>
  )
}

function Li({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-700 text-xs font-bold text-ink-200">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  )
}

function OptionRow({ icon, title, body, checked, onChange }: { icon: ReactNode; title: string; body: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-ink-700 bg-ink-850 p-4">
      <span className="text-ember-400">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-ink-400">{body}</div>
      </div>
      <Toggle label={title} checked={checked} onChange={onChange} />
    </div>
  )
}
