import { Check, ListChecks, Play, RotateCcw, X } from 'lucide-react'
import { useEffect } from 'react'
import { campaignMetrics, findInventory } from '../../domain/metrics'
import { placementBlockers } from '../../domain/rules'
import type { AppState, Campaign } from '../../domain/types'
import { tenge } from '../../lib/format'
import { isWideScreen } from '../../lib/media'
import { commands, go } from '../../store/commands'
import { today, useStore, type Role, type UiState } from '../../store/store'
import { Button, cx } from '../../ui/primitives'

const PHARMACY = 'arna'
const SKU = 'DC-ORAL-250'
const OPPORTUNITY = `${PHARMACY}:${SKU}`

const ROLE_LABEL: Record<Role, string> = { brand: 'Бренд', pharmacy: 'Аптека', storefront: 'Витрина' }

interface Ctx {
  data: AppState
  ui: UiState
  t: string
  /** The newest campaign for the scenario pharmacy and product. */
  campaign: Campaign | undefined
}

interface Step {
  title: string
  text: string
  role: Role
  done: (c: Ctx) => boolean
  /** Why «Выполнить» cannot run yet; null when it can. */
  blocked: (c: Ctx) => string | null
  go: (c: Ctx) => void
  run: (c: Ctx) => void
  extra?: (c: Ctx) => string | null
}

const scenarioCtx = (data: AppState, ui: UiState): Ctx => ({
  data,
  ui,
  t: today(),
  campaign: data.campaigns.filter((c) => c.pharmacyId === PHARMACY && c.sku === SKU).sort((a, b) => b.number - a.number)[0],
})

/** Context from the store as it is now, not as of the last render: a fast double click must see the first click's order. */
const freshCtx = () => {
  const { data, ui } = useStore.getState()
  return scenarioCtx(data, ui)
}

const scenarioOrders = (c: Ctx) => (c.campaign ? c.data.orders.filter((o) => o.campaignId === c.campaign?.id) : [])

const STEPS: Step[] = [
  {
    title: 'Найти, где запускать',
    text: 'Карточка возможности: интерес к категории, остаток, цена и свободное место. Открываем основания.',
    role: 'brand',
    done: (c) => c.ui.visited.why,
    blocked: () => null,
    go: () => go.brand('opportunities'),
    run: () => go.why(OPPORTUNITY),
  },
  {
    title: 'Создать кампанию',
    text: 'Форма уже заполнена: 100 000 ₸ на рекламу, 50 000 ₸ на скидки, CPC 100 ₸, скидка 500 ₸. Отправляем аптеке.',
    role: 'brand',
    done: (c) => Boolean(c.campaign),
    blocked: (c) => (c.campaign ? `Кампания №${c.campaign.number} уже создана` : null),
    go: () => go.brand('opportunities'),
    run: () => {
      go.brand('opportunities')
      useStore.getState().openForm({ pharmacyId: PHARMACY, sku: SKU })
    },
  },
  {
    title: 'Аптека подтверждает',
    text: 'Аптека видит условия и компенсацию за выкуп. После подтверждения цена фиксируется, реклама начинает показываться.',
    role: 'pharmacy',
    done: (c) => c.campaign?.agreedPrice != null,
    blocked: (c) =>
      !c.campaign ? 'Сначала создайте кампанию (шаг 2)' : c.campaign.approval !== 'pending' ? 'Кампания уже не ждет подтверждения' : null,
    go: () => go.pharmacy(PHARMACY, 'offers'),
    run: (c) => {
      go.pharmacy(PHARMACY, 'offers')
      if (c.campaign) commands.approve(c.campaign.id)
    },
  },
  {
    title: 'Покупатель кликает рекламу',
    text: 'В витрине — карточка с пометкой «Реклама» и ценой со скидкой. Клик тарифицируется один раз за сессию.',
    role: 'storefront',
    done: (c) => Boolean(c.campaign && c.data.clicks.some((k) => k.campaignId === c.campaign?.id)),
    blocked: (c) => {
      if (!c.campaign || c.campaign.approval !== 'approved') return 'Сначала аптека должна подтвердить кампанию (шаг 3)'
      const b = placementBlockers(c.data, c.campaign, c.t)
      return b.length ? `Показ остановлен: ${b[0].message}` : null
    },
    go: () => go.storefront(PHARMACY),
    run: (c) => {
      go.storefront(PHARMACY)
      if (c.campaign) commands.click(c.campaign.id)
    },
  },
  {
    title: 'Заказ и выкуп',
    text: 'Тестовый заказ резервирует 1 шт. и скидку. Компенсация начисляется только после подтверждения выкупа.',
    role: 'storefront',
    done: (c) => scenarioOrders(c).some((o) => o.status === 'redeemed' || o.status === 'returned'),
    blocked: (c) => {
      if (!c.campaign || !c.data.clicks.some((k) => k.campaignId === c.campaign?.id)) return 'Сначала нужен клик по рекламе (шаг 4)'
      return null
    },
    go: () => go.storefront(PHARMACY),
    run: (c) => {
      go.storefront(PHARMACY)
      const pending = scenarioOrders(c).find((o) => o.status === 'pending')
      if (pending) {
        commands.transition(pending.id, 'redeemed')
        return
      }
      const r = commands.order(PHARMACY, SKU)
      if (r.ok && r.value) commands.transition(r.value.id, 'redeemed')
    },
  },
  {
    title: 'Результаты кампании',
    text: 'Расход бренда по факту: клики плюс подтвержденные компенсации. Резервы показаны отдельно.',
    role: 'brand',
    done: (c) => c.ui.visited.results && scenarioOrders(c).some((o) => o.status === 'redeemed' || o.status === 'returned'),
    blocked: (c) => (c.campaign ? null : 'Сначала создайте кампанию (шаг 2)'),
    go: (c) => go.brand('results', { resultsCampaignId: c.campaign?.id ?? null }),
    run: (c) => go.brand('results', { resultsCampaignId: c.campaign?.id ?? null }),
    extra: (c) => {
      if (!c.campaign) return null
      const m = campaignMetrics(c.data, c.campaign)
      if (m.validClicks === 0) return null
      return `Сверка: ${tenge(m.brandSpend)} = ${tenge(m.pharmacyAdRevenue)} аптеке за клики + ${tenge(m.confirmedDiscounts)} компенсация + ${tenge(m.platformRevenue)} платформе`
    },
  },
  {
    title: 'Возврат',
    text: 'Компенсация сторнируется, единица возвращается в остаток. Рекламный расход за клик остается.',
    role: 'storefront',
    done: (c) => scenarioOrders(c).some((o) => o.status === 'returned'),
    blocked: (c) => (scenarioOrders(c).some((o) => o.status === 'redeemed') ? null : 'Нет выкупленного заказа — сначала шаг 5'),
    go: () => go.storefront(PHARMACY),
    run: (c) => {
      go.storefront(PHARMACY)
      const redeemed = scenarioOrders(c).find((o) => o.status === 'redeemed')
      if (redeemed) commands.transition(redeemed.id, 'returned')
    },
    extra: (c) => {
      if (!c.campaign || !scenarioOrders(c).some((o) => o.status === 'returned')) return null
      const m = campaignMetrics(c.data, c.campaign)
      return `После возврата: расход ${tenge(m.brandSpend)}, аптеке ${tenge(m.pharmacyAdRevenue + m.confirmedDiscounts)}, компенсации ${tenge(m.confirmedDiscounts)}, платформе ${tenge(m.platformRevenue)}`
    },
  },
  {
    title: 'Остаток закончился',
    text: 'Аптека обнуляет остаток — показ останавливается с понятной причиной и вернется сам после пополнения.',
    role: 'pharmacy',
    done: (c) => Boolean(c.campaign && placementBlockers(c.data, c.campaign, c.t).some((b) => b.code === 'no_stock')),
    blocked: (c) => {
      if (!c.campaign || c.campaign.approval !== 'approved') return 'Сначала аптека должна подтвердить кампанию (шаг 3)'
      return findInventory(c.data, PHARMACY, SKU)?.stock === 0 ? 'Остаток уже 0' : null
    },
    go: () => go.pharmacy(PHARMACY, 'catalog'),
    run: (c) => {
      go.pharmacy(PHARMACY, 'catalog')
      const item = findInventory(c.data, PHARMACY, SKU)
      if (item) commands.updateItem(PHARMACY, SKU, item.price, 0)
    },
  },
  {
    title: 'Пример оценки прироста',
    text: 'Синтетический эксперимент: сколько покупателей реклама добавила сверх тех, кто купил бы и так.',
    role: 'brand',
    done: (c) => c.ui.visited.uplift,
    blocked: () => null,
    go: () => go.brand('uplift'),
    run: () => go.brand('uplift'),
  },
]

export function ScenarioPanel({ onReset, onClose }: { onReset: () => void; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const ui = useStore((s) => s.ui)
  const setUi = useStore((s) => s.setUi)
  const ctx = scenarioCtx(data, ui)

  const derived = STEPS.map((s, i) => (s.done(ctx) ? i + 1 : 0)).filter(Boolean)
  const newlyDone = derived.filter((n) => !ui.scenarioDone.includes(n))
  const newlyKey = newlyDone.join(',')

  // Completed steps stay ticked even when later steps change the state (e.g. stock refilled).
  useEffect(() => {
    if (!newlyKey) return
    const current = useStore.getState().ui.scenarioDone
    const add = newlyKey.split(',').map(Number).filter((n) => !current.includes(n))
    if (add.length) setUi({ scenarioDone: [...current, ...add].sort((a, b) => a - b) })
  }, [newlyKey, setUi])

  // On narrow screens the panel covers the page: close it so the presenter sees where "Перейти" led.
  const goTo = (s: (typeof STEPS)[number]) => {
    s.go(ctx)
    if (isWideScreen()) return
    onClose()
    requestAnimationFrame(() => {
      if (!document.querySelector('dialog[open]')) document.getElementById('main')?.focus({ preventScroll: true })
    })
  }

  const isDone = (i: number) => ui.scenarioDone.includes(i + 1) || derived.includes(i + 1)
  const doneCount = STEPS.filter((_, i) => isDone(i)).length
  const currentIdx = STEPS.findIndex((_, i) => !isDone(i))

  return (
    <section aria-labelledby="scenario-title" className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 id="scenario-title" className="flex items-center gap-2 font-display text-base font-semibold">
            <ListChecks className="size-4" aria-hidden /> Сценарий демо
          </h2>
          <p className="mt-0.5 text-xs text-muted tabular-nums" aria-live="polite">
            Выполнено {doneCount} из {STEPS.length}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Закрыть сценарий" className="-mr-1.5 rounded-full p-1.5 text-muted hover:bg-wash hover:text-ink">
          <X className="size-4" aria-hidden />
        </button>
      </header>

      <div className="h-1 bg-wash" aria-hidden>
        <div className="h-1 bg-signal transition-[width]" style={{ width: `${(doneCount / STEPS.length) * 100}%` }} />
      </div>

      <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {STEPS.map((s, i) => {
          const done = isDone(i)
          const current = i === currentIdx
          const reason = s.blocked(ctx)
          const extra = s.extra?.(ctx)
          return (
            <li
              key={s.title}
              aria-current={current ? 'step' : undefined}
              className={cx('rounded-xl px-3 py-3', current ? 'bg-sky-soft ring-1 ring-sky' : 'hover:bg-wash/60')}
            >
              <div className="flex gap-3">
                <span
                  className={cx(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                    done ? 'bg-positive text-white' : current ? 'bg-ink text-white' : 'border border-line-strong bg-surface text-muted',
                  )}
                >
                  {done ? (
                    <>
                      <Check className="size-3.5" aria-hidden />
                      <span className="sr-only">Выполнено:</span>
                    </>
                  ) : (
                    i + 1
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <h3 className={cx('text-sm font-medium', done && !current ? 'text-body' : 'text-ink')}>{s.title}</h3>
                    <span className="text-[11px] text-muted">{ROLE_LABEL[s.role]}</span>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{s.text}</p>
                  {extra && <p className="mt-1.5 rounded-md bg-surface px-2 py-1 text-xs text-body tabular-nums ring-1 ring-line">{extra}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => goTo(s)} aria-label={`Перейти: ${s.title}`}>
                      Перейти
                    </Button>
                    <Button
                      size="sm"
                      variant={current ? 'primary' : 'secondary'}
                      icon={<Play className="size-3.5" aria-hidden />}
                      disabledReason={reason}
                      onClick={(e) => {
                        if (e.detail > 1) return
                        const c = freshCtx()
                        if (!s.blocked(c)) s.run(c)
                      }}
                      aria-label={`Выполнить: ${s.title}`}
                    >
                      Выполнить
                    </Button>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      <footer className="border-t border-line px-5 py-3">
        <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" aria-hidden />} onClick={onReset} className="w-full">
          Сбросить демо
        </Button>
      </footer>
    </section>
  )
}
