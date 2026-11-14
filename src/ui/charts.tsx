/**
 * Two small, dependency-free chart forms. Colors come from a validated categorical palette
 * (slots 1–3 pass CVD and normal-vision separation on a white surface; slot 3 is under 3:1,
 * so every chart here ships visible labels and a value list as the table view).
 */
import { cx } from './primitives'

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'] as const
/** Lighter step of the slot-1 ramp, for a de-emphasised comparison mark. */
export const SERIES_SOFT = '#86b6ef'

const tipClass =
  'pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-56 -translate-x-1/2 rounded-md bg-soot px-2.5 py-1.5 text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100'

export interface Part {
  key: string
  label: string
  value: number
  display: string
  color: string
}

const shareOf = (value: number, total: number) => {
  const share = total > 0 ? (value / total) * 100 : 0
  return `${share > 0 && share < 1 ? '<1' : Math.round(share)} %`
}

/**
 * One whole split into parts (tall segmented bar). Shares are printed in the legend in ink,
 * not on the colored fills: white or dark text on the palette fills stays under 4.5:1.
 */
export function SegmentedBar({ parts, label, emptyText }: { parts: Part[]; label: string; emptyText: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  const visible = parts.filter((p) => p.value > 0)
  return (
    <figure className="m-0">
      {total === 0 ? (
        <div className="flex h-7 items-center justify-center rounded bg-wash text-xs text-muted">{emptyText}</div>
      ) : (
        <div role="group" aria-label={label} className="flex h-7 gap-0.5">
          {visible.map((p) => {
            const shareText = shareOf(p.value, total)
            return (
              <div
                key={p.key}
                role="img"
                tabIndex={0}
                aria-label={`${p.label}: ${p.display}, ${shareText}`}
                className="group relative h-full min-w-1 rounded-[4px] outline-offset-2"
                style={{ flexGrow: p.value, flexBasis: 0, background: p.color }}
              >
                <span aria-hidden className={tipClass}>
                  <span className="font-medium">{p.label}</span>
                  <br />
                  {p.display} · {shareText}
                </span>
              </div>
            )
          })}
        </div>
      )}
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-body">
        {parts.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: p.color }} />
            {p.label}
            <span className="font-medium text-ink tabular-nums">{p.display}</span>
            {total > 0 && <span className="text-muted tabular-nums">· {shareOf(p.value, total)}</span>}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}

/** Budget meter: used parts in the slot-1 ramp over a lighter track of the same ramp. */
export function Meter({ label, parts, max, display }: {
  label: string
  parts: { key: string; value: number; color: string }[]
  max: number
  display: string
}) {
  const used = parts.reduce((s, p) => s + p.value, 0)
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-medium text-ink tabular-nums">{display}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(used, max)}
        aria-valuetext={display}
        className="mt-1.5 flex h-2 gap-px overflow-hidden rounded-full bg-[#e3eefb]"
      >
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.key} className="h-full" style={{ width: `${Math.min(100, (p.value / Math.max(max, 1)) * 100)}%`, minWidth: 3, background: p.color }} />
        ))}
      </div>
    </div>
  )
}

export interface BarRow {
  key: string
  label: string
  value: number
  display: string
  hint?: string
  color: string
}

/** Horizontal bars from one baseline; value at the tip; hover/focus tooltip per bar. */
export function HBars({ rows, label, max }: { rows: BarRow[]; label: string; max?: number }) {
  const top = Math.max(max ?? 0, ...rows.map((r) => r.value), 1)
  return (
    <div role="list" aria-label={label} className="space-y-1">
      {rows.map((r) => {
        const pct = (r.value / top) * 100
        return (
          <div key={r.key} role="listitem" className="grid grid-cols-[minmax(84px,34%)_1fr] items-center gap-3">
            <span className="text-sm leading-tight text-pretty text-body">{r.label}</span>
            <div
              role="img"
              tabIndex={0}
              aria-label={`${r.label}: ${r.display}${r.hint ? `, ${r.hint}` : ''}`}
              className="group relative flex h-9 items-center border-l border-line-strong outline-offset-2"
            >
              <div
                className={cx('h-6 shrink-0 rounded-r-[4px]', r.value === 0 && 'w-0')}
                style={{ width: r.value === 0 ? 0 : `max(calc((100% - 5.5rem) * ${pct / 100}), 3px)`, background: r.color }}
              />
              <span className="ml-2 text-sm font-medium text-ink tabular-nums">{r.display}</span>
              <span aria-hidden className={tipClass}>
                <span className="font-medium">{r.label}</span>
                <br />
                {r.display}
                {r.hint && <> · {r.hint}</>}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
