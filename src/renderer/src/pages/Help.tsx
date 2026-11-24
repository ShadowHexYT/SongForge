import { useMemo, useState, type ReactNode } from 'react'
import {
  ChevronDown,
  Compass,
  Gauge,
  Headphones,
  Keyboard,
  Layers,
  LifeBuoy,
  Mic2,
  Piano,
  Search,
  Smartphone,
  Sparkles,
  Upload,
  Wand2,
  RotateCcw,
  Play,
  ListVideo,
  Package,
  Combine,
  CopyX,
  ScanSearch,
  ArrowUpCircle,
  Languages,
  ListChecks
} from 'lucide-react'
import { api } from '@/lib/api'
import { Anvil, SmithHammer } from '@/components/ForgeIcons'
import { useApp } from '@/lib/store'
import { Button, Kbd, cx } from '@/components/ui'

interface Guide {
  id: string
  icon: ReactNode
  title: string
  summary: string
  steps: ReactNode[]
  tip?: ReactNode
}

const GUIDES: Guide[] = [
  {
    id: 'first-song',
    icon: <Anvil size={18} />,
    title: 'Make your first song',
    summary: 'From a link to an MP3 in about a minute.',
    steps: [
      <>Go to <b>Forge</b> and paste a link (YouTube, TikTok, SoundCloud…), or type a search and pick a result.</>,
      <>The video downloads and the <b>studio</b> opens with a starter clip.</>,
      <>Drag the clip's edges on the waveform so it covers just the song. Press <Kbd>Space</Kbd> to listen.</>,
      <>Check the title and artist in the <b>Tags</b> tab. They're guessed from the video title.</>,
      <>Press <b>Forge this clip</b>. The song is now in your Library and your Spotify folder.</>
    ],
    tip: <>Links with a timestamp (like <span className="font-mono">&amp;t=95</span>) start the clip at that moment.</>
  },
  {
    id: 'find-songs',
    icon: <Wand2 size={18} />,
    title: 'Get every song out of a long video',
    summary: 'Concerts, award shows and streams with many songs.',
    steps: [
      <>Open the video. If it's long, SongForge looks for the songs and shows <b>“Found N songs”</b> above the waveform.</>,
      <>Click <b>Review</b> (or the wand button in the clip list), untick anything you don't want, and click <b>Add clips</b>.</>,
      <>Click through each clip, fix its edges if needed, and give it a name in <b>Tags</b>.</>,
      <>Press <b>Forge all</b> at the top right.</>
    ],
    tip: <>No luck? While listening, press <Kbd>M</Kbd> wherever a song starts. Each marker turns into a clip with the scissors button.</>
  },
  {
    id: 'playlists',
    icon: <ListVideo size={18} />,
    title: 'Get songs from a whole playlist or channel',
    summary: 'YouTube playlists and channels, SoundCloud sets and artist pages.',
    steps: [
      <>Paste a playlist or channel link in <b>Forge</b> (or copy it and switch back to SongForge).</>,
      <>A list of its videos opens. Videos you've already forged are unticked and marked <b>Already in your library</b>.</>,
      <>Untick anything you don't want, or type in <b>Filter</b> to find songs, then press <b>Queue</b>.</>,
      <>They download one at a time in the background. Open each one from the queue when it's ready.</>
    ],
    tip: <>A video link that's playing inside a playlist (it has both <span className="font-mono">v=</span> and <span className="font-mono">list=</span>) opens just that video. Use the playlist's own page link to get them all.</>
  },
  {
    id: 'trim',
    icon: <Gauge size={18} />,
    title: 'Trim precisely',
    summary: 'Clean starts and endings with no clicks.',
    steps: [
      <>Open the <b>Trim</b> tab. The two zoomed strips show the start and the end up close.</>,
      <>Drag a strip to move that edge (hold <Kbd>Shift</Kbd> for fine control), or use the arrow buttons for 0.01s and 0.1s steps.</>,
      <>The <b>magnet</b> snaps the edge to the nearest quiet moment. The <b>play</b> button previews just the first or last 3 seconds.</>,
      <>Set <b>Fade in</b> and <b>Fade out</b> in the Sound tab for smooth edges.</>
    ]
  },
  {
    id: 'style',
    icon: <Sparkles size={18} />,
    title: 'Sped up, slowed, reverb & EQ',
    summary: 'Make nightcore, slowed + reverb, or just make it sound better.',
    steps: [
      <>Open the <b>Sound</b> tab. Pick a style (<b>Sped up</b>, <b>Nightcore</b>, <b>Slowed</b>…) or set speed and pitch yourself.</>,
      <>Under <b>Effects</b>, try a preset like <b>Slowed + reverb</b>, <b>Vocal clarity</b> or <b>Bass boost</b>, or adjust Bass, Mid, Treble and Reverb.</>,
      <>With <b>Live FX</b> on, you hear every change while the clip plays.</>,
      <>Like what you made? Click <b>Save mine</b> to keep it as your own preset (up to 5).</>
    ],
    tip: <>Want both the normal and the sped-up song? Duplicate the clip (copy button in the clip list) and change only the copy.</>
  },
  {
    id: 'lyrics',
    icon: <Mic2 size={18} />,
    title: 'Add lyrics',
    summary: 'Synced lyrics that scroll along as the song plays.',
    steps: [
      <>In the studio, open the <b>Lyrics</b> tab (or <b>Edit details</b> on a song in your library).</>,
      <>Click <b>Find lyrics</b> and pick a match. Matches marked <b>Synced</b> scroll along in Now Playing.</>,
      <>Can't find them? Click <b>Genius</b> to search in your browser, copy the lyrics, and paste them in.</>,
      <>Live version out of sync? In Now Playing, use <b>Earlier</b> / <b>Later</b>, or double-click a line when it's being sung.</>
    ]
  },
  {
    id: 'translate',
    icon: <Languages size={18} />,
    title: 'Romanized and translated lyrics',
    summary: 'Sing along to Korean, Japanese and Chinese songs.',
    steps: [
      <>Play a song with lyrics and open <b>Now Playing</b> (click the cover in the player bar).</>,
      <>Under the lyrics, turn on <b>Romanized</b> to see how each line sounds in Latin letters, and <b>Translation</b> to see what it means.</>,
      <>Pick the language to translate into in <b>Settings → Lyrics</b>.</>
    ],
    tip: <>Korean is romanized on your PC. Translations, and romanization for other languages, come from Google Translate the first time you play each song, then they're saved with the song.</>
  },
  {
    id: 'instrumental',
    icon: <Piano size={18} />,
    title: 'Instrumental, karaoke & vocals only',
    summary: 'Remove the voice, or remove everything but the voice.',
    steps: [
      <>Install the free AI add-on once: <b>Settings → Tools → AI vocal isolation</b> (needs Python).</>,
      <>On a clip, click the <b>piano</b> button to make an instrumental copy, or choose <b>Instrumental</b> / <b>Vocals only</b> in the Sound tab.</>,
      <>Forge as usual. It takes about a minute per song.</>
    ]
  },
  {
    id: 'versions',
    icon: <Layers size={18} />,
    title: 'Versions of the same song',
    summary: 'Compare a live stage, a cover and a sped-up edit.',
    steps: [
      <>Songs with the same title stack automatically. Look for the <Layers size={12} className="inline" /> badge in your library.</>,
      <>Click the badge to see all versions. In <b>Now Playing</b>, the <b>Versions</b> tab switches between them at the same spot in the song.</>,
      <>Choose <b>More → Stack versions</b> in the library to show one row per song.</>,
      <>Wrongly stacked? Use the unlink button in the Versions window.</>
    ]
  },
  {
    id: 'select',
    icon: <ListChecks size={18} />,
    title: 'Do things to many songs at once',
    summary: 'Tick songs, then play, share or add them together.',
    steps: [
      <>In your Library or a playlist, hover a song and tick the box on its left. <b>Ctrl-click</b> ticks too, and <b>Shift-click</b> ticks everything in between. <b>Ctrl+A</b> ticks every song shown.</>,
      <>A bar appears above the player: <b>Play</b>, <b>Queue</b>, add to a <b>Playlist</b>, make a <b>Medley</b>, <b>Share</b> as a pack, or <b>Delete</b>.</>,
      <>Press <b>Esc</b> or the <b>✕</b> to untick everything.</>
    ]
  },
  {
    id: 'lookup',
    icon: <ScanSearch size={18} />,
    title: 'Fill in the album, year, genre and cover',
    summary: 'Look songs up instead of typing.',
    steps: [
      <>In the studio's <b>Tags</b> tab, or in <b>Edit details</b> on a song in your library, click <b>Look up</b>.</>,
      <>Pick the right match. The album, year and genre are filled in, and your title and artist stay as they are.</>,
      <>Leave <b>Also use the album cover</b> on to swap in the official cover art, or turn it off to keep yours.</>
    ],
    tip: <>Fancam or live clip? Look up the studio song to get its album and cover, then keep your own title like “Love Dive (Live)”.</>
  },
  {
    id: 'medley',
    icon: <Combine size={18} />,
    title: 'Make a medley or mashup',
    summary: 'Several songs in one track, blended together.',
    steps: [
      <>Tick the songs in your <b>Library</b> and click <b>Medley</b> in the bar that appears. Or use <b>More → Make a medley</b>, or <b>Medley</b> on a playlist.</>,
      <>Tick songs in the order you want them, and use the arrows to rearrange.</>,
      <>Set the <b>crossfade</b> (how long two songs overlap), and keep <b>Same loudness</b> on so no song is suddenly louder.</>,
      <>Press <b>Forge medley</b>. It's saved as a new song in your library and Spotify folder.</>
    ],
    tip: <>Trim the songs first so each one starts and ends where you want. The medley uses them exactly as they are.</>
  },
  {
    id: 'packs',
    icon: <Package size={18} />,
    title: 'Share songs with friends',
    summary: 'Send a song pack. They get everything with one click.',
    steps: [
      <>Tick songs and click <b>Share</b> in the bar that appears. Or use <b>Share pack</b> on a playlist, <b>More → Share songs</b> in the Library, or <b>Share with a friend</b> in a song's <b>…</b> menu.</>,
      <>Pick the songs, give the pack a name, and press <b>Save pack</b>. You get one <span className="font-mono">.songforge</span> file.</>,
      <>Send it however you like: Discord, Google Drive, a USB stick.</>,
      <>Your friend double-clicks it (or uses <b>Library → Import</b>). The songs arrive with covers, lyrics and versions, plus a playlist named after the pack.</>
    ],
    tip: <>Packs hold the finished MP3s, so your friend doesn't need to download or clip anything. Songs they already have are skipped.</>
  },
  {
    id: 'dupes',
    icon: <CopyX size={18} />,
    title: 'Remove duplicate songs',
    summary: 'The same song imported or forged twice.',
    steps: [
      <>In your <b>Library</b>, click <b>More → Find duplicates</b>. The number on <b>More</b> shows how many songs are there more than once.</>,
      <>For each song, choose the copy to <b>keep</b>. SongForge suggests the one in the most playlists, with lyrics and a cover.</>,
      <>Click <b>Keep one</b>, or <b>Clean up all</b>. Playlists switch to the copy you kept, so nothing goes missing.</>
    ],
    tip: <>Different versions (live, sped up, instrumental, a different clip of the same video) never count as duplicates.</>
  },
  {
    id: 'import',
    icon: <Upload size={18} />,
    title: 'Import songs you already have',
    summary: 'MP3, M4A, FLAC, WAV, OGG…',
    steps: [
      <>Go to <b>Library → Import</b>, then choose files or a folder, or drop them in.</>,
      <>Titles, artists, covers and lyrics are read from the files. Other formats are converted to MP3.</>,
      <>Imported songs can be edited, re-clipped and given effects like any other song.</>
    ]
  },
  {
    id: 'spotify',
    icon: <Headphones size={18} />,
    title: 'Listen in Spotify on your PC',
    summary: 'One-time setup, then songs appear by themselves.',
    steps: [
      <>In Spotify Desktop, open <b>Settings</b> and turn on <b>Show Local Files</b>.</>,
      <>Click <b>Add a source</b> and choose your SongForge folder (shown on the <b>Spotify Sync</b> page).</>,
      <>Your songs appear under <b>Your Library → Local Files</b>, with their titles and covers.</>
    ]
  },
  {
    id: 'phone',
    icon: <Smartphone size={18} />,
    title: 'Get your songs on your phone',
    summary: 'Spotify Premium plus your home Wi-Fi. Works on iPhone and Android.',
    steps: [
      <>Do the PC setup first (the guide above), so your songs show in Spotify Desktop under <b>Local Files</b>.</>,
      <>On the PC, make a Spotify playlist (for example <b>SongForge</b>) and add your songs to it from <b>Local Files</b>.</>,
      <>Put your phone on the <b>same Wi-Fi</b> as the PC, signed in to the same Spotify account, with Spotify Desktop open.</>,
      <>On the phone, open Spotify <b>Settings</b> and turn on <b>Local audio files</b>. On iPhone, tap <b>Allow</b> when it asks to find devices on your local network.</>,
      <>Open the playlist on your phone and turn on <b>Download</b>. Once it's downloaded, the songs play anywhere, even offline.</>
    ],
    tip: <>Songs greyed out on the phone? They haven't downloaded yet. Keep the phone on the same Wi-Fi with Spotify Desktop open, and see the full checklist on the <b>Spotify</b> page.</>
  },
  {
    id: 'updates',
    icon: <ArrowUpCircle size={18} />,
    title: 'Updating SongForge',
    summary: 'New versions arrive inside the app.',
    steps: [
      <>When a new version is out, a card appears at the bottom right. Click <b>Download update</b>.</>,
      <>When it's ready, click <b>Restart now</b> (or just close SongForge and it installs on the way out).</>,
      <>Your songs, playlists and settings stay exactly as they were.</>
    ],
    tip: <>Check by hand anytime in <b>Settings → Updates → Check now</b>.</>
  },
  {
    id: 'trouble',
    icon: <LifeBuoy size={18} />,
    title: 'Troubleshooting',
    summary: "When a download or forge doesn't work.",
    steps: [
      <><b>Download failed?</b> Go to <b>Settings → Tools → yt-dlp → Update</b>. Sites change often and updates fix most problems.</>,
      <><b>“Needs a login” or “not available from your location”?</b> That post isn't public from your connection. Try a public link or a YouTube upload.</>,
      <><b>Song not showing in Spotify?</b> Check the Spotify Sync page. The folder must be added as a source, and Spotify sometimes needs a restart.</>,
      <><b>No sound while editing?</b> Check the volume in the player bar, and that <b>Live FX</b> gain isn't turned down.</>
    ]
  }
]

const SHORTCUTS: Array<[string, string]> = [
  ['Space', 'Play / pause'],
  ['I / O', 'Set clip start / end at the playhead'],
  ['N', 'New clip at the playhead'],
  ['M', 'Drop a marker'],
  ['L', 'Loop on / off'],
  ['F', 'Live FX on / off'],
  ['[ / ]', 'Previous / next clip'],
  ['← / →', 'Seek 1s (Shift 5s, Alt 0.1s)'],
  ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
  ['Ctrl+Enter', 'Forge the selected clip'],
  ['?', 'Show all studio shortcuts']
]

export function HelpPage() {
  const startTour = useApp((s) => s.startTour)
  const settings = useApp((s) => s.settings)
  const setSettings = useApp((s) => s.setSettings)
  const toast = useApp((s) => s.toast)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>('first-song')

  const guides = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return GUIDES
    // Search the guide text too, not just titles
    return GUIDES.filter((g) => `${g.title} ${g.summary} ${g.id}`.toLowerCase().includes(n) || JSON.stringify(g.steps.map(textOf)).toLowerCase().includes(n))
  }, [q])

  const replayStudio = async () => {
    if (!settings) return
    setSettings(await api.settings.set({ toursSeen: (settings.toursSeen ?? []).filter((t) => t !== 'studio') }))
    toast({ kind: 'info', title: 'Studio tour is ready', body: 'It starts the next time you open a video in the studio.' })
  }

  return (
    <div className="mx-auto max-w-4xl px-6 pt-14 pb-16 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember-400">Help</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">How to use SongForge</h1>
      <p className="mt-2 text-[15px] text-ink-400">Take a guided tour, or jump to a step-by-step guide.</p>

      {/* Tours */}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="relative overflow-hidden rounded-2xl border border-ink-700 bg-ink-850 p-5">
          <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-ember-500/15 blur-2xl" />
          <Compass size={22} className="text-ember-400" />
          <div className="mt-3 font-semibold">App tour</div>
          <p className="mt-1 text-sm leading-relaxed text-ink-400">A 1-minute walk through the pages: where to paste links, your library, the player, Spotify and settings.</p>
          <Button className="mt-4" variant="primary" icon={<Play size={14} fill="currentColor" />} onClick={() => startTour('app')} data-tour="help-start">
            Start the tour
          </Button>
        </div>
        <div className="rounded-2xl border border-ink-700 bg-ink-850 p-5">
          <SmithHammer size={22} className="text-ember-400" />
          <div className="mt-3 font-semibold">Studio tour</div>
          <p className="mt-1 text-sm leading-relaxed text-ink-400">
            Shows the clip editor step by step. It starts the first time you open a video. Inside the studio, replay it anytime with the <b className="text-ink-200">?</b> button at the top.
          </p>
          <Button className="mt-4" icon={<RotateCcw size={14} />} onClick={replayStudio} disabled={!settings?.toursSeen?.includes('studio')}>
            {settings?.toursSeen?.includes('studio') ? 'Show it again next time' : 'Will show next time'}
          </Button>
        </div>
      </div>

      {/* Guides */}
      <div className="mt-12 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold">Guides</h2>
        <div className="relative w-full max-w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search help, e.g. lyrics, phone"
            className="h-9 w-full rounded-full border border-ink-600 bg-ink-850 pl-9 pr-3 text-sm outline-none focus:border-ember-500/60"
          />
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {guides.map((g) => {
          const isOpen = open === g.id || !!q.trim()
          return (
            <div key={g.id} className={cx('overflow-hidden rounded-xl border transition', isOpen ? 'border-ink-600 bg-ink-850' : 'border-ink-700 bg-ink-850/50 hover:border-ink-600')}>
              <button onClick={() => setOpen(open === g.id ? null : g.id)} className="flex w-full items-center gap-4 px-5 py-4 text-left" aria-expanded={isOpen}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ember-500/10 text-ember-400">{g.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{g.title}</span>
                  <span className="block text-xs text-ink-400">{g.summary}</span>
                </span>
                <ChevronDown size={16} className={cx('shrink-0 text-ink-400 transition', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <div className="px-5 pb-5 pl-[4.25rem]">
                  <ol className="flex flex-col gap-2.5">
                    {g.steps.map((s, n) => (
                      <li key={n} className="flex gap-3 text-sm leading-relaxed text-ink-200">
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-ink-700 text-[11px] font-bold text-ink-300">{n + 1}</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                  {g.tip && <p className="mt-4 rounded-lg bg-ink-800 px-3 py-2 text-xs leading-relaxed text-ink-300">💡 {g.tip}</p>}
                </div>
              )}
            </div>
          )
        })}
        {!guides.length && <p className="py-8 text-center text-sm text-ink-400">Nothing matches “{q}”.</p>}
      </div>

      {/* Shortcuts */}
      <h2 className="mt-12 flex items-center gap-2 text-lg font-semibold">
        <Keyboard size={18} className="text-ink-400" /> Studio shortcuts
      </h2>
      <div className="mt-4 grid gap-x-8 rounded-xl border border-ink-700 bg-ink-850 px-5 py-2 md:grid-cols-2">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 border-b border-ink-800 py-2.5 text-sm last:border-0 md:[&:nth-last-child(2)]:border-0">
            <span className="text-ink-300">{v}</span>
            <span className="flex shrink-0 gap-1">
              {k.split(' / ').map((part) => (
                <Kbd key={part}>{part}</Kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Plain text of a React node, for searching guide steps. */
function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (typeof node === 'object' && 'props' in node) return textOf((node.props as { children?: ReactNode }).children)
  return ''
}
