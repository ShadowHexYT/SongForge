import { CheckCircle2, Info, XCircle, X } from 'lucide-react'
import { useApp } from '@/lib/store'

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed bottom-28 right-6 z-[60] flex w-96 flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex items-start gap-3 rounded-xl border border-ink-600 bg-ink-800/95 p-4 shadow-2xl backdrop-blur">
          {t.kind === 'success' && <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" />}
          {t.kind === 'error' && <XCircle size={18} className="mt-0.5 shrink-0 text-red-400" />}
          {t.kind === 'info' && <Info size={18} className="mt-0.5 shrink-0 text-sky-400" />}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{t.title}</div>
            {t.body && <div className="mt-0.5 text-xs text-ink-300 break-words">{t.body}</div>}
          </div>
          <button onClick={() => dismiss(t.id)} className="text-ink-400 hover:text-ink-100" aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
