/** Forge-themed icons, drawn on the same grid as the logo so everything matches. */

export const ANVIL_PATH = 'M5 25C13 25 17 21 22 21H57V29H51C47 29 45 32 45 36V41H51V48H17V41H23V36C23 32 21 29 17 29C11 29 7 27 5 25Z'

interface IconProps {
  size?: number
  className?: string
}

/** A blacksmith's anvil. Fills with the current text color. */
export function Anvil({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="2 9 58 51" fill="currentColor" className={className} aria-hidden>
      <path d={ANVIL_PATH} />
    </svg>
  )
}

/** A blacksmith's hammer, tilted mid-swing. */
export function SmithHammer({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="currentColor" className={className} aria-hidden>
      <g transform="rotate(-38 32 32)">
        <rect x="16" y="7" width="32" height="14" rx="3" />
        <rect x="28.5" y="19" width="7" height="40" rx="3.5" />
      </g>
    </svg>
  )
}
