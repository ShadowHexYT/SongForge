import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { mediaUrl } from '@/lib/api'

export function cx(...c: Array<string | false | null | undefined>): string {
  return c.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const variants: Record<Variant, string> = {
  primary: 'forge-gradient text-on-accent font-semibold hover:brightness-110 shadow-accent',
  secondary: 'bg-ink-700 text-ink-100 hover:bg-ink-600 border border-ink-600',
  ghost: 'text-ink-300 hover:text-ink-100 hover:bg-ink-700/60',
  danger: 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode }
>(function Button({ variant = 'secondary', size = 'md', icon, className, children, ...rest }, ref) {
  const sizes = { sm: 'h-8 px-3 text-[13px] gap-1.5', md: 'h-9 px-4 text-sm gap-2', lg: 'h-11 px-5 text-[15px] gap-2' }
  return (
    <button
      ref={ref}
      className={cx(
        'inline-flex items-center justify-center rounded-full whitespace-nowrap transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none',
        sizes[size],
        variants[variant],
        className
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
})

export function IconButton({
  className,
  active,
  label,
  size = 'md',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; label: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'size-7', md: 'size-9', lg: 'size-11' }
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex items-center justify-center rounded-full transition-all duration-150 active:scale-90 disabled:opacity-30 disabled:pointer-events-none',
        sizes[size],
        active ? 'text-ember-400' : 'text-ink-300 hover:text-ink-100 hover:bg-ink-700/60',
        className
      )}
      {...rest}
    />
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cx(
        'h-9 w-full rounded-lg bg-ink-800 border border-ink-600 px-3 text-sm text-ink-100 placeholder:text-ink-400 outline-none transition focus:border-ember-500/70 focus:ring-2 focus:ring-ember-500/20',
        className
      )}
      {...rest}
    />
  )
})

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        'w-full rounded-lg bg-ink-800 border border-ink-600 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-400 outline-none transition focus:border-ember-500/70 focus:ring-2 focus:ring-ember-500/20 resize-none',
        className
      )}
      {...rest}
    />
  )
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cx('flex flex-col gap-1.5', className)}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-400">{hint}</span>}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-ember-500' : 'bg-ink-600')}
    >
      <span className={cx('absolute top-0.5 size-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: Array<{ value: T; label: string; icon?: ReactNode }>
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg bg-ink-800 border border-ink-600 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'flex items-center gap-1.5 rounded-md px-2.5 h-7 text-xs font-medium transition',
            value === o.value ? 'bg-ink-600 text-ink-100 shadow' : 'text-ink-400 hover:text-ink-200'
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Range({
  value,
  min = 0,
  max,
  step = 0.01,
  onChange,
  className,
  label
}: {
  value: number
  min?: number
  max: number
  step?: number
  onChange: (v: number) => void
  className?: string
  label?: string
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0
  return (
    <input
      type="range"
      aria-label={label}
      className={cx('sf-range w-full', className)}
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ ['--pct' as string]: `${pct}%` }}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

/** Open windows, newest last, so Escape closes only the one on top. */
const modalStack: symbol[] = []

export function Modal({ open, onClose, title, children, width = 'max-w-2xl' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return
    const me = Symbol(title)
    modalStack.push(me)
    const h = (e: KeyboardEvent) => e.key === 'Escape' && modalStack[modalStack.length - 1] === me && onClose()
    window.addEventListener('keydown', h)
    return () => {
      window.removeEventListener('keydown', h)
      modalStack.splice(modalStack.indexOf(me), 1)
    }
  }, [open, onClose, title])
  if (!open) return null
  // Portaled to <body> so a window opened from inside a panel always covers the whole app
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onMouseDown={onClose}>
      <div
        className={cx('w-full max-h-[90vh] overflow-auto rounded-2xl border border-ink-600 bg-ink-850 shadow-2xl', width)}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-700 bg-ink-850/95 backdrop-blur px-6 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body
  )
}

/** Square album art with a generated gradient fallback. */
export function Cover({ path, seed, size = 48, className, bust }: { path?: string | null; seed: string; size?: number; className?: string; bust?: number }) {
  const hue = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <div
      className={cx('relative shrink-0 overflow-hidden rounded-md bg-ink-700', className)}
      style={{ width: size, height: size, background: path ? undefined : `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 50) % 360} 80% 25%))` }}
    >
      {path ? (
        <img src={mediaUrl(path, bust)} alt="" className="size-full object-cover" draggable={false} />
      ) : (
        <div className="flex size-full items-center justify-center text-white/80" style={{ fontSize: size * 0.38 }}>
          ♪
        </div>
      )}
    </div>
  )
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-ink-700', className)}>
      <div className="h-full rounded-full forge-gradient transition-[width] duration-300" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  )
}

export function EqIcon({ playing = true }: { playing?: boolean }) {
  return (
    <span className="inline-flex h-3.5 items-end gap-[2px]">
      {[0, 0.2, 0.4].map((d) => (
        <span key={d} className={cx('w-[3px] h-full rounded-sm bg-ember-400', playing && 'eq-bar')} style={{ animationDelay: `${d}s`, transform: playing ? undefined : 'scaleY(0.4)' }} />
      ))}
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-ink-300">{children}</kbd>
}
