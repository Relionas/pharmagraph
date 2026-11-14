import { BadgePercent, Info, PackageCheck, Repeat2, ShoppingCart, Undo2, User, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { quoteOrder } from '../../domain/actions'
import { findInventory } from '../../domain/metrics'
import { campaignStatus, joinRu, ORDER_STATUS_LABELS, resumeOutlook, type Tone } from '../../domain/rules'
import { BRAND, getPharmacy, getProduct, PHARMACIES, PRODUCTS } from '../../domain/seed'
import type { Campaign, Order, OrderStatus } from '../../domain/types'
import { int, tenge } from '../../lib/format'
import { formatDateTime } from '../../lib/time'
import { commands, go } from '../../store/commands'
import { today, useStore } from '../../store/store'
import { ProductPack } from '../../ui/ProductPack'
import { Badge, Button, Card, cx, Notice } from '../../ui/primitives'

const ORDER_TONES: Record<OrderStatus, Tone> = {
  pending: 'info',
  redeemed: 'positive',
  cancelled: 'neutral',
  returned: 'warning',
}

const scrollToOrder = () =>
  window.setTimeout(() => document.getElementById('storefront-order')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30)

export function StorefrontView() {
  const pharmacyId = useStore((s) => s.ui.storefrontPharmacyId)
  const data = useStore((s) => s.data)
  const setUi = useStore((s) => s.setUi)
  const t = today()
  const pharmacy = getPharmacy(pharmacyId)
  const mine = data.campaigns.filter((c) => c.pharmacyId === pharmacyId).sort((a, b) => b.number - a.number)
  const live = mine.find((c) => campaignStatus(data, c, t).live)
  const [selected, setSelected] = useState<string>(live?.sku ?? PRODUCTS[0].sku)
  const session = data.sessions.find((s) => s.id === data.currentSessionId)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs tracking-wide text-muted uppercase">Тестовая витрина</p>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.015em]">{pharmacy.name} · онлайн</h1>
          <p className="mt-0.5 text-sm text-muted">Так покупатель видит аптеку. Заказы отсюда попадают в кабинет аптеки и в результаты бренда.</p>
        </div>
        <div role="group" aria-label="Витрина аптеки" className="flex rounded-full border border-line bg-surface p-0.5">
          {PHARMACIES.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={p.id === pharmacyId}
              onClick={() => setUi({ storefrontPharmacyId: p.id })}
              className={cx(
                'rounded-full px-3.5 py-1.5 text-sm transition-colors',
                p.id === pharmacyId ? 'bg-soot font-medium text-white' : 'text-body hover:bg-wash hover:text-ink',
              )}
            >
              {p.city}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <User className="size-4 shrink-0 text-muted" aria-hidden />
          <span>
            Покупатель: <strong className="font-medium tabular-nums">сессия №{session?.number ?? 1}</strong>
            <span className="text-muted"> · повторный клик того же покупателя не тарифицируется</span>
          </span>
        </p>
        <Button size="sm" icon={<UserPlus className="size-4" aria-hidden />} onClick={() => commands.newBuyer()}>
          Новый покупатель
        </Button>
      </div>

      <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {live ? (
            <AdCard
              c={live}
              onOpen={() => {
                const r = commands.click(live.id)
                if (r.ok) {
                  setSelected(live.sku)
                  scrollToOrder()
                }
              }}
            />
          ) : (
            <NoAdHint campaigns={mine} />
          )}

          <section aria-labelledby="storefront-catalog">
            <h2 id="storefront-catalog" className="mb-3 text-sm font-semibold">Каталог · уход и гигиена</h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
              {PRODUCTS.map((p) => {
                const item = findInventory(data, pharmacyId, p.sku)
                const active = p.sku === selected
                return (
                  <li key={p.sku}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setSelected(p.sku)
                        scrollToOrder()
                      }}
                      className={cx(
                        'flex h-full w-full flex-col rounded-card border bg-surface p-3 text-left transition-colors',
                        active ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-line-strong',
                      )}
                    >
                      <span className="flex justify-center rounded-lg bg-canvas py-3">
                        <ProductPack sku={p.sku} size={64} />
                      </span>
                      <span className="mt-2 text-sm leading-snug font-medium text-ink">{p.shortName}</span>
                      <span className="text-xs text-muted">{p.volume}</span>
                      <span className="mt-auto pt-2 text-sm font-semibold tabular-nums">{item ? tenge(item.price) : '—'}</span>
                      <span className={cx('text-xs', item && item.stock > 0 ? 'text-positive' : 'text-negative')}>
                        {item && item.stock > 0 ? `В наличии: ${int(item.stock)} шт.` : 'Нет в наличии'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>

        <div className="min-w-0 space-y-6 @4xl:sticky @4xl:top-20">
          <OrderPanel pharmacyId={pharmacyId} sku={selected} liveCampaign={live} />
          <DemoControls pharmacyId={pharmacyId} />
        </div>
      </div>
    </div>
  )
}

// ── Ad card ─────────────────────────────────────────────────────────────────

function AdCard({ c, onOpen }: { c: Campaign; onOpen: () => void }) {
  const data = useStore((s) => s.data)
  const product = getProduct(c.sku)
  const item = findInventory(data, c.pharmacyId, c.sku)
  const price = item?.price ?? 0
  const clicked = data.clicks.some((k) => k.campaignId === c.id && k.sessionId === data.currentSessionId)

  return (
    <Card as="article" aria-label={`Реклама: ${product.name}`} className="overflow-hidden border-sky">
      <div className="flex flex-col gap-5 p-5 @xl:flex-row @xl:items-stretch">
        <div className="flex shrink-0 items-center justify-center rounded-xl bg-sky-soft px-8 py-5">
          <ProductPack sku={c.sku} size={104} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded border border-line-strong bg-surface px-1.5 py-px text-[11px] font-semibold tracking-wide text-body uppercase">Реклама</span>
            <span className="text-xs text-muted">{BRAND.name}</span>
          </div>
          <h3 className="mt-2 font-display text-lg leading-snug font-semibold">{product.name}</h3>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-display text-2xl font-semibold tabular-nums">
              <span className="sr-only">Цена со скидкой </span>
              {tenge(price - c.discountPerUnit)}
            </span>
            <s className="text-sm text-muted tabular-nums">
              <span className="sr-only">Обычная цена </span>
              {tenge(price)}
            </s>
            <Badge tone="info">−{tenge(c.discountPerUnit)}</Badge>
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-body">
            <BadgePercent className="size-4 text-signal-ink" aria-hidden /> Скидку финансирует бренд
          </p>
          <p className="mt-0.5 text-xs text-positive">В наличии: {int(item?.stock ?? 0)} шт.</p>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Button variant="primary" icon={<ShoppingCart className="size-4" aria-hidden />} onClick={onOpen}>
              Перейти к товару
            </Button>
            <span className="text-xs text-muted">
              {clicked ? 'Клик этой сессии уже засчитан' : `Для демо: клик спишет ${tenge(c.cpc)} с бюджета бренда`}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}

function NoAdHint({ campaigns }: { campaigns: Campaign[] }) {
  const data = useStore((s) => s.data)
  const t = today()
  const stopped = campaigns.find((c) => c.approval === 'approved')
  const pending = campaigns.find((c) => c.approval === 'pending')

  if (stopped) {
    const st = campaignStatus(data, stopped, t)
    const { final, needs } = resumeOutlook(st.blockers)
    const reasons = st.blockers.length > 0 ? st.blockers.map((b) => b.message).join('; ') : st.label
    return (
      <Notice tone="warning" icon={<Info className="size-4" />}>
        <span className="font-medium">Реклама кампании №{stopped.number} сейчас не показывается.</span>{' '}
        {st.blockers.length > 1 ? 'Причины' : 'Причина'}: {reasons}.{' '}
        {final
          ? 'Эта кампания больше не покажет карточку — бренд может завершить ее и запустить новую.'
          : needs.length > 0 && `Карточка вернется, когда ${joinRu(needs)}.`}
      </Notice>
    )
  }
  if (pending) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-dashed border-line-strong bg-surface px-5 py-4 text-sm">
        <p className="text-body">Кампания №{pending.number} ждет подтверждения аптеки — рекламная карточка появится после него.</p>
        <Button size="sm" onClick={() => go.pharmacy(pending.pharmacyId, 'offers')}>Открыть кабинет аптеки</Button>
      </div>
    )
  }
  return (
    <div className="rounded-card border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-sm text-muted">
      Здесь появится рекламная карточка, когда аптека подтвердит кампанию бренда.
    </div>
  )
}

// ── Order ───────────────────────────────────────────────────────────────────

function OrderPanel({ pharmacyId, sku, liveCampaign }: { pharmacyId: string; sku: string; liveCampaign: Campaign | undefined }) {
  const data = useStore((s) => s.data)
  const q = quoteOrder(data, pharmacyId, sku, today())
  const product = getProduct(sku)
  const adHint = liveCampaign?.sku === sku && q.discount === 0 && !q.noDiscountReason

  return (
    <Card id="storefront-order" className="scroll-mt-24 p-5">
      <h2 className="text-sm font-semibold">Тестовый заказ</h2>
      <div className="mt-3 flex items-center gap-3">
        <ProductPack sku={sku} size={48} />
        <div className="min-w-0">
          <p className="text-sm font-medium">{product.name}</p>
          <p className="text-xs text-muted">1 шт. · самовывоз из аптеки</p>
        </div>
      </div>

      <dl className="mt-4 space-y-1.5 text-sm tabular-nums">
        <div className="flex justify-between gap-3"><dt className="text-muted">Цена</dt><dd>{tenge(q.unitPrice)}</dd></div>
        {q.discount > 0 && (
          <div className="flex justify-between gap-3"><dt className="text-muted">Скидка бренда</dt><dd className="text-positive">−{tenge(q.discount)}</dd></div>
        )}
        <div className="flex justify-between gap-3 border-t border-line pt-1.5 font-semibold"><dt>Итого</dt><dd>{tenge(q.total)}</dd></div>
      </dl>

      <div className="mt-3 space-y-2">
        {q.discount > 0 && (
          <Notice tone="positive">Скидка из рекламы применена. Бренд компенсирует ее аптеке после выкупа.</Notice>
        )}
        {q.noDiscountReason && <Notice tone="neutral">{q.noDiscountReason}</Notice>}
        {adHint && <Notice tone="info">Скидка действует при переходе из рекламной карточки.</Notice>}
        {!q.available && q.unavailableReason && <Notice tone="negative">{q.unavailableReason}</Notice>}
      </div>

      <Button
        variant="dark"
        className="mt-4 w-full"
        icon={<ShoppingCart className="size-4" aria-hidden />}
        disabledReason={q.available ? null : q.unavailableReason}
        // A mouse double click is one intent: only its first click places an order (keyboard activation has detail 0).
        onClick={(e) => e.detail <= 1 && commands.order(pharmacyId, sku)}
      >
        Оформить тестовый заказ
      </Button>
      <p className="mt-2 text-xs text-muted">
        Один товар, одна штука. Без ввода персональных и платежных данных. После оформления заказ получает статус «Ожидает выкупа».
      </p>
    </Card>
  )
}

// ── Demo controls ───────────────────────────────────────────────────────────

function DemoControls({ pharmacyId }: { pharmacyId: string }) {
  const orders = useStore((s) => s.data.orders)
  const lastEvent = useStore((s) => s.lastEvent)
  const replayLast = useStore((s) => s.replayLast)
  const mine = orders.filter((o) => o.pharmacyId === pharmacyId).sort((a, b) => b.number - a.number)

  return (
    <Card className="p-5" aria-labelledby="demo-controls">
      <h2 id="demo-controls" className="text-sm font-semibold">Управление демо</h2>
      <p className="mt-0.5 text-xs text-muted">
        Имитирует то, что в жизни делает аптека: выдачу, отмену и возврат. Компенсация начисляется только после выкупа — за сам заказ ее нет.
      </p>

      {mine.length === 0 ? (
        <p className="mt-4 rounded-lg bg-canvas px-3 py-3 text-sm text-muted">Заказов в этой аптеке пока нет.</p>
      ) : (
        <ul className="mt-3 max-h-[360px] divide-y divide-line overflow-y-auto">
          {mine.map((o) => <OrderRow key={o.id} o={o} />)}
        </ul>
      )}

      <div className="mt-4 border-t border-line pt-4">
        <Button
          size="sm"
          icon={<Repeat2 className="size-4" aria-hidden />}
          disabledReason={lastEvent ? null : 'Пока нечего повторять: сначала сделайте клик, заказ или выкуп'}
          onClick={replayLast}
        >
          Повторить последнее событие
        </Button>
        <p className="mt-1.5 text-xs text-muted">
          {lastEvent
            ? `Отправит «${lastEvent.label}» еще раз с тем же идентификатором — итоги не изменятся.`
            : 'Проверка идемпотентности: повтор события с тем же идентификатором не меняет итоги.'}
        </p>
      </div>
    </Card>
  )
}

function OrderRow({ o }: { o: Order }) {
  const product = getProduct(o.sku)
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Заказ №{o.number} · {product.shortName}</p>
          <p className="text-xs text-muted tabular-nums">
            {tenge(o.total)}
            {o.discount > 0 ? ` · скидка ${tenge(o.discount)}` : ' · без скидки'}
            {' · '}
            {formatDateTime(o.createdAt)}
          </p>
        </div>
        <Badge tone={ORDER_TONES[o.status]} dot>{ORDER_STATUS_LABELS[o.status]}</Badge>
      </div>
      {o.status === 'pending' && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" icon={<PackageCheck className="size-4" aria-hidden />} onClick={() => commands.transition(o.id, 'redeemed')}>
            Подтвердить выкуп
          </Button>
          <Button size="sm" variant="ghost" icon={<X className="size-4" aria-hidden />} onClick={() => commands.transition(o.id, 'cancelled')}>
            Отменить заказ
          </Button>
        </div>
      )}
      {o.status === 'redeemed' && (
        <div className="mt-2">
          <Button size="sm" icon={<Undo2 className="size-4" aria-hidden />} onClick={() => commands.transition(o.id, 'returned')}>
            Симулировать возврат
          </Button>
        </div>
      )}
    </li>
  )
}
