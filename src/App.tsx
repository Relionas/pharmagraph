import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BrandView } from './features/brand/BrandView'
import { CampaignForm } from './features/brand/CampaignForm'
import { PharmacyView } from './features/pharmacy/PharmacyView'
import { ScenarioPanel } from './features/scenario/ScenarioPanel'
import { StorefrontView } from './features/storefront/StorefrontView'
import { useWideScreen } from './lib/media'
import { useStore, type ToastTone } from './store/store'
import { ConfirmDialog, cx } from './ui/primitives'
import { TopBar } from './ui/TopBar'

export default function App() {
  const role = useStore((s) => s.ui.role)
  const scenarioOpen = useStore((s) => s.ui.scenarioOpen)
  const setUi = useStore((s) => s.setUi)
  const reset = useStore((s) => s.reset)
  const [confirmReset, setConfirmReset] = useState(false)

  const openReset = () => setConfirmReset(true)
  const closeScenario = () => setUi({ scenarioOpen: false })

  // Each role switch starts at the top of the page.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [role])

  // Below xl the scenario is an overlay drawer: it takes focus when opened, Escape closes it
  // (unless a dialog above it handles the key), and focus goes back to where it came from.
  // Re-evaluated when the window crosses the breakpoint while the panel is open.
  const asideRef = useRef<HTMLElement>(null)
  const wide = useWideScreen()
  useEffect(() => {
    if (!scenarioOpen || wide) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    asideRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]')) return
      setUi({ scenarioOpen: false })
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (opener?.isConnected && (document.activeElement === document.body || document.activeElement === null)) opener.focus()
    }
  }, [scenarioOpen, wide, setUi])

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-soot px-4 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Перейти к содержимому
      </a>
      <TopBar onReset={openReset} />

      <div
        className={cx(
          'mx-auto px-4 py-6 sm:px-6 sm:py-8',
          scenarioOpen ? 'max-w-[1680px] xl:grid xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start xl:gap-6' : 'max-w-[1280px]',
        )}
      >
        {/* Footer lives in the main column so the sticky scenario panel's grid area reaches the page bottom. */}
        <div className="min-w-0">
          <main id="main" tabIndex={-1} className="@container min-w-0 focus-visible:outline-none">
            {role === 'brand' && <BrandView />}
            {role === 'pharmacy' && <PharmacyView />}
            {role === 'storefront' && <StorefrontView />}
          </main>
          <footer className="mt-10 text-xs text-muted">
            Демо-прототип. Все участники, товары, операции и результаты вымышленные. Реальных интеграций, выплат и платежей нет.
          </footer>
        </div>

        {scenarioOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-soot/20 xl:hidden" onClick={closeScenario} aria-hidden />
            <aside
              ref={asideRef}
              tabIndex={-1}
              aria-label="Сценарий демо"
              className={cx(
                'fixed inset-y-0 right-0 z-40 w-[min(380px,100vw)] border-l border-line bg-surface shadow-[0_12px_45px_rgba(17,12,46,0.16)] outline-none',
                'xl:sticky xl:top-20 xl:z-auto xl:h-[calc(100dvh-7rem)] xl:w-auto xl:overflow-hidden xl:rounded-card xl:border xl:shadow-none',
              )}
            >
              <ScenarioPanel onReset={openReset} onClose={closeScenario} />
            </aside>
          </>
        )}
      </div>

      <CampaignForm />
      <ConfirmDialog
        open={confirmReset}
        title="Сбросить демо?"
        text="Кампании, клики, заказы и изменения каталога будут удалены, данные вернутся к исходному состоянию. Отменить сброс нельзя."
        confirmLabel="Сбросить"
        onConfirm={reset}
        onClose={() => setConfirmReset(false)}
      />
      <Toasts />
    </div>
  )
}

// ── Toasts ──────────────────────────────────────────────────────────────────

const TOAST_STYLE: Record<ToastTone, { icon: ReactNode; className: string }> = {
  success: { icon: <CircleCheck className="size-4 text-positive" aria-hidden />, className: 'border-[#cbe9d5]' },
  info: { icon: <Info className="size-4 text-signal-ink" aria-hidden />, className: 'border-sky' },
  warning: { icon: <TriangleAlert className="size-4 text-warning" aria-hidden />, className: 'border-[#f1dfb5]' },
  error: { icon: <CircleAlert className="size-4 text-negative" aria-hidden />, className: 'border-[#f1c9c5]' },
}

/**
 * Bottom-left notification stack. Rendered as a manual popover so it sits in the top layer
 * and stays visible above open modal dialogs.
 */
function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  const ref = useRef<HTMLDivElement>(null)
  const lastId = toasts.at(-1)?.id ?? 0

  useEffect(() => {
    const el = ref.current
    if (!el || typeof el.showPopover !== 'function') return
    try {
      if (el.matches(':popover-open')) el.hidePopover()
      el.showPopover()
    } catch {
      /* popover unsupported: the stack still renders as a fixed element */
    }
  }, [lastId])

  return (
    <div
      ref={ref}
      popover="manual"
      role="region"
      aria-label="Уведомления"
      aria-live="polite"
      className="pointer-events-none fixed inset-auto bottom-4 left-4 z-50 m-0 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2 overflow-visible border-0 bg-transparent p-0"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            'pointer-events-auto flex animate-fade-in items-start gap-2.5 rounded-xl border bg-surface px-3.5 py-3 text-sm text-ink shadow-[0_8px_30px_rgba(17,12,46,0.12)]',
            TOAST_STYLE[t.tone].className,
          )}
        >
          <span className="mt-0.5 shrink-0">{TOAST_STYLE[t.tone].icon}</span>
          <p className="min-w-0 flex-1">{t.text}</p>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Скрыть уведомление"
            className="-my-1.5 -mr-2 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-wash hover:text-ink"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}
