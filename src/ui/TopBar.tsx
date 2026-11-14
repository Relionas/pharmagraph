import { Building2, ListChecks, RotateCcw, ShoppingBag, Store } from 'lucide-react'
import type { ReactNode } from 'react'
import { useStore, type Role } from '../store/store'
import { Button, cx } from './primitives'

const ROLES: { key: Role; label: string; icon: ReactNode }[] = [
  { key: 'brand', label: 'Бренд', icon: <ShoppingBag className="size-4" aria-hidden /> },
  { key: 'pharmacy', label: 'Аптека', icon: <Building2 className="size-4" aria-hidden /> },
  { key: 'storefront', label: 'Витрина', icon: <Store className="size-4" aria-hidden /> },
]

function Logo() {
  return (
    <svg viewBox="0 0 28 28" className="size-7 shrink-0" aria-hidden>
      <rect width="28" height="28" rx="7" fill="#0c0a09" />
      <circle cx="8.5" cy="9" r="2.6" fill="#3ba6f1" />
      <circle cx="19.5" cy="9" r="2.6" fill="white" />
      <circle cx="14" cy="19.5" r="2.6" fill="white" />
      <path d="M8.5 9h11M8.5 9l5.5 10.5M19.5 9 14 19.5" stroke="white" strokeOpacity="0.55" strokeWidth="1.3" />
    </svg>
  )
}

export function TopBar({ onReset }: { onReset: () => void }) {
  const role = useStore((s) => s.ui.role)
  const scenarioOpen = useStore((s) => s.ui.scenarioOpen)
  const setUi = useStore((s) => s.setUi)

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur supports-[backdrop-filter]:bg-canvas/75">
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo />
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <span className="font-display text-[15px] font-semibold tracking-[-0.01em] whitespace-nowrap">SIMB-AD PharmaGraph</span>
              <span className="rounded-full border border-sky bg-sky-soft px-2 py-px text-[11px] font-medium text-signal-ink">Демо</span>
            </div>
            <p className="hidden truncate text-xs text-muted md:block">От подходящей аптеки до прозрачного результата кампании</p>
          </div>
        </div>

        <nav aria-label="Роль" className="order-3 flex w-full rounded-full border border-line bg-surface p-0.5 sm:order-none sm:mx-auto sm:w-auto">
          {ROLES.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={role === r.key}
              onClick={() => setUi({ role: r.key })}
              className={cx(
                'flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-colors sm:flex-none',
                role === r.key ? 'bg-soot font-medium text-white' : 'text-body hover:bg-wash hover:text-ink',
              )}
            >
              {r.icon}
              {r.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <Button
            variant={scenarioOpen ? 'dark' : 'primary'}
            size="sm"
            icon={<ListChecks className="size-4" aria-hidden />}
            aria-pressed={scenarioOpen}
            onClick={() => setUi({ scenarioOpen: !scenarioOpen })}
          >
            Сценарий демо
          </Button>
          <Button variant="secondary" size="sm" icon={<RotateCcw className="size-4" aria-hidden />} onClick={onReset} aria-label="Сбросить демо">
            <span className="hidden lg:inline">Сбросить</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
