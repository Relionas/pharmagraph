import { Info, X } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import type { Tone } from '../domain/rules'
import { useStore } from '../store/store'

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

// ── Button ──────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  icon?: ReactNode
  /** When set, the button stays focusable and explains on click why it cannot run. */
  disabledReason?: string | null
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-signal border-signal-edge text-ink hover:bg-[#2f9be8] font-medium',
  secondary: 'bg-surface border-line text-ink hover:border-line-strong hover:bg-wash',
  ghost: 'bg-transparent border-transparent text-body hover:bg-wash hover:text-ink',
  danger: 'bg-surface border-[#f1c9c5] text-negative hover:bg-negative-soft',
  dark: 'bg-soot border-soot text-white hover:bg-black font-medium',
}

export function Button({ variant = 'secondary', size = 'md', icon, disabledReason, className, children, onClick, type, title, ...rest }: ButtonProps) {
  const blocked = Boolean(disabledReason)
  const toast = useStore((s) => s.toast)
  return (
    <button
      {...rest}
      type={type ?? 'button'}
      aria-disabled={blocked || undefined}
      title={disabledReason ?? title}
      onClick={(e) => {
        if (blocked) {
          e.preventDefault()
          toast('info', disabledReason as string)
          return
        }
        onClick?.(e)
      }}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border whitespace-nowrap transition-colors select-none',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-4 text-sm',
        VARIANTS[variant],
        blocked && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}

// ── Badges and pills ────────────────────────────────────────────────────────

const TONES: Record<Tone, string> = {
  neutral: 'bg-wash text-body border-line',
  positive: 'bg-positive-soft text-positive border-[#cbe9d5]',
  warning: 'bg-warning-soft text-warning border-[#f1dfb5]',
  negative: 'bg-negative-soft text-negative border-[#f1c9c5]',
  info: 'bg-sky-soft text-signal-ink border-sky',
}

export function Badge({ tone = 'neutral', children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', TONES[tone], className)}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

// ── Layout ──────────────────────────────────────────────────────────────────

export function Card({ children, className, as: As = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & HTMLAttributes<HTMLElement>) {
  return (
    <As className={cx('rounded-card border border-line bg-surface', className)} {...rest}>
      {children}
    </As>
  )
}

export function SectionTitle({ title, subtitle, action, id }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="font-display text-[22px] leading-tight font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {subtitle && <p className="mt-1 max-w-[70ch] text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Stat({ label, value, hint, info, emphasis, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; info?: string; emphasis?: boolean; className?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      <div className="flex items-center gap-1 text-xs text-muted">
        <span>{label}</span>
        {info && <InfoTip text={info} label={typeof label === 'string' ? label : 'Пояснение'} />}
      </div>
      <div className={cx('mt-1 font-display tabular-nums tracking-[-0.01em] text-ink', emphasis ? 'text-[28px] leading-8 font-semibold' : 'text-xl font-semibold')}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  )
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      {icon && <div className="text-faint" aria-hidden>{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {text && <p className="max-w-[52ch] text-sm text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Notice({ tone = 'info', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', TONES[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0" aria-hidden>{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

// ── Tooltip ─────────────────────────────────────────────────────────────────

/** Keyboard- and hover-accessible explanation bubble. */
export function InfoTip({ text, label = 'Пояснение', className }: { text: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span className={cx('relative inline-flex', className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={`${label}: пояснение`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className="-m-1 inline-flex size-6 items-center justify-center rounded-full text-muted hover:text-ink"
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className="absolute bottom-full left-1/2 z-40 mb-2 w-64 -translate-x-1/2 animate-fade-in rounded-lg bg-soot px-3 py-2 text-left text-xs leading-relaxed font-normal text-white shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  )
}

// ── Form fields ─────────────────────────────────────────────────────────────

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string
  error?: string
  hint?: ReactNode
  suffix?: string
}

export function Field({ label, error, hint, suffix, id, className, ...input }: FieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = `${inputId}-hint`
  const errId = `${inputId}-err`
  return (
    <div className={cx('min-w-0', className)}>
      <label htmlFor={inputId} className="mb-1 block text-[13px] font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={cx(hint && !error ? hintId : null, error ? errId : null) || undefined}
          className={cx(
            'h-10 w-full rounded-lg border bg-surface px-3 text-sm text-ink tabular-nums placeholder:text-faint',
            'focus:border-signal-edge focus:ring-2 focus:ring-sky focus:outline-none',
            error ? 'border-negative' : 'border-line-strong',
            suffix && 'pr-8',
          )}
          {...input}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted" aria-hidden>{suffix}</span>}
      </div>
      {hint && !error && <p id={hintId} className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p id={errId} className="mt-1 text-xs text-negative">{error}</p>}
    </div>
  )
}

export function SelectField({ label, error, value, onChange, options, id }: {
  label: string
  error?: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  id?: string
}) {
  const autoId = useId()
  const selectId = id ?? autoId
  return (
    <div className="min-w-0">
      <label htmlFor={selectId} className="mb-1 block text-[13px] font-medium text-ink">{label}</label>
      <select
        id={selectId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${selectId}-err` : undefined}
        className={cx(
          'h-10 w-full rounded-lg border bg-surface px-3 text-sm text-ink focus:border-signal-edge focus:ring-2 focus:ring-sky focus:outline-none',
          error ? 'border-negative' : 'border-line-strong',
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && <p id={`${selectId}-err`} className="mt-1 text-xs text-negative">{error}</p>}
    </div>
  )
}

// ── Tabs ────────────────────────────────────────────────────────────────────

export interface TabItem<K extends string> {
  key: K
  label: ReactNode
  badge?: ReactNode
}

/** WAI-ARIA tabs with roving tabindex and arrow-key navigation. */
export function Tabs<K extends string>({ items, value, onChange, label, idPrefix }: {
  items: TabItem<K>[]
  value: K
  onChange: (k: K) => void
  label: string
  idPrefix: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: KeyboardEvent, i: number) => {
    const move = (to: number) => {
      e.preventDefault()
      const n = (to + items.length) % items.length
      refs.current[n]?.focus()
      onChange(items[n].key)
    }
    if (e.key === 'ArrowRight') move(i + 1)
    else if (e.key === 'ArrowLeft') move(i - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(items.length - 1)
  }
  return (
    <div role="tablist" aria-label={label} className="relative -mb-px flex gap-1 overflow-x-auto">
      {items.map((t, i) => {
        const active = t.key === value
        return (
          <button
            key={t.key}
            ref={(el) => { refs.current[i] = el }}
            role="tab"
            type="button"
            id={`${idPrefix}-tab-${t.key}`}
            aria-selected={active}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx(
              'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors',
              active ? 'border-ink font-medium text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
            {t.badge}
          </button>
        )
      })}
    </div>
  )
}

export function TabPanel({ idPrefix, active, children }: { idPrefix: string; active: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel`} aria-labelledby={`${idPrefix}-tab-${active}`} tabIndex={-1} className="focus-visible:outline-none">
      {children}
    </div>
  )
}

// ── Modal ───────────────────────────────────────────────────────────────────

/** Native <dialog>: focus trap, Esc to close and inert background come from the browser. */
export function Modal({ open, onClose, title, description, children, footer, width = 'md' }: {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className={cx(
        'm-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-surface p-0 text-ink shadow-[0_12px_45px_rgba(17,12,46,0.12)]',
        width === 'sm' ? 'max-w-md' : width === 'md' ? 'max-w-2xl' : 'max-w-4xl',
      )}
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-lg font-semibold">{title}</h2>
              {description && <p id={descId} className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Закрыть" className="-mr-2 rounded-full p-1.5 text-muted hover:bg-wash hover:text-ink">
              <X className="size-4" aria-hidden />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas px-6 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}

/** Confirmation for irreversible actions. */
export function ConfirmDialog({ open, title, text, confirmLabel, tone = 'danger', onConfirm, onClose }: {
  open: boolean
  title: string
  text: ReactNode
  confirmLabel: string
  tone?: 'danger' | 'primary'
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} autoFocus>Отмена</Button>
          <Button
            variant={tone === 'danger' ? 'dark' : 'primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-body">{text}</div>
    </Modal>
  )
}

// ── Misc ────────────────────────────────────────────────────────────────────

export function KeyValue({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cx('grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm', className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right font-medium text-ink tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>
}
