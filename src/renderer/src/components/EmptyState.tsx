import { useId, type ReactNode } from 'react'
import { ANVIL_PATH } from './ForgeIcons'
import { LOGO_BARS } from './Logo'
import { cx } from './ui'

/** The logo's anvil, unlit, with the sound bars glowing above it like sparks. */
function AnvilArt({ size = 84 }: { size?: number }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="drop-shadow-[0_8px_24px_color-mix(in_srgb,var(--color-ember-500)_35%,transparent)]">
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="var(--color-ember-500)" />
          <stop offset="1" stopColor="var(--color-gold-400)" />
        </linearGradient>
      </defs>
      <path d={ANVIL_PATH} transform="translate(3 9) scale(.9)" fill="var(--color-ink-600)" />
      {LOGO_BARS.map(([x, y, h], i) => (
        <rect key={x} x={x} y={y} width="4.5" height={h} rx="2.25" fill={`url(#${id})`} opacity={[0.55, 1, 0.8, 0.5][i]} />
      ))}
      <circle cx="51" cy="8" r="1.4" fill="var(--color-gold-400)" opacity=".6" />
      <circle cx="13" cy="12" r="1" fill="var(--color-ember-400)" opacity=".5" />
    </svg>
  )
}

/** A friendly "nothing here yet" panel with one clear next step. */
export function EmptyState({ title, body, actions, compact, className }: { title: string; body?: ReactNode; actions?: ReactNode; compact?: boolean; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-3 text-center', compact ? 'py-10' : 'py-16', className)}>
      <AnvilArt size={compact ? 60 : 84} />
      <div>
        <h2 className={cx('font-semibold', compact ? 'text-base' : 'text-lg')}>{title}</h2>
        {body && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-400">{body}</p>}
      </div>
      {actions && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  )
}
