import { useId } from 'react'
import { ANVIL_PATH } from './ForgeIcons'

/** Four sound bars rising off an anvil like sparks. The bars sit evenly over the anvil's body. */
export const LOGO_BARS: Array<[x: number, y: number, h: number]> = [
  [20, 10, 12],
  [27.5, 4, 18],
  [35, 8, 14],
  [42.5, 12, 10]
]

/** The SongForge mark. It follows the theme accent, so it recolors with the app. */
export function LogoMark({ size = 28 }: { size?: number }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-ember-500)" />
          <stop offset="1" stopColor="var(--color-gold-400)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id})`} />
      <g fill="var(--color-on-accent)">
        <path d={ANVIL_PATH} transform="translate(3 9) scale(.9)" />
        {LOGO_BARS.map(([x, y, h]) => (
          <rect key={x} x={x} y={y} width="4.5" height={h} rx="2.25" />
        ))}
      </g>
      {size >= 40 && (
        <g fill="var(--color-on-accent)" opacity=".45">
          <circle cx="51" cy="8" r="1.6" />
          <circle cx="14" cy="13" r="1.2" />
        </g>
      )}
    </svg>
  )
}
