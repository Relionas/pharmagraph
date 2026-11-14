import { ArrowRight, Boxes, Building2, ChevronRight, Eye, MapPin, PackageX, Search, ShoppingBag, Sparkles, X } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { buildOpportunities, featuredOpportunities, INTEREST_LABELS, MIN_STOCK_FOR_LAUNCH, type Opportunity } from '../../domain/opportunities'
import { BRAND, getCategory, getPharmacy, getProduct } from '../../domain/seed'
import { int, tenge } from '../../lib/format'
import { formatRelative } from '../../lib/time'
import { go } from '../../store/commands'
import { today, useStore } from '../../store/store'
import { ProductPack } from '../../ui/ProductPack'
import { Badge, Button, Card, InfoTip, Notice, SectionTitle, cx } from '../../ui/primitives'

const INTEREST_TIP =
  'Сигнал интереса — просмотры категории в каталоге аптеки за 7 дней. Это не прогноз спроса и не гарантия продаж: он показывает, где покупатели уже ищут товары этой категории.'

export function Opportunities() {
  const data = useStore((s) => s.data)
  const whyId = useStore((s) => s.ui.whyOpportunityId)
  const setUi = useStore((s) => s.setUi)
  const t = today()
  const all = useMemo(() => buildOpportunities(data, t), [data, t])
  const featured = useMemo(() => featuredOpportunities(all), [all])
  const why = all.find((o) => o.id === whyId) ?? null

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Где запустить следующую кампанию"
        subtitle={`${BRAND.name}: пары «аптека × товар», где есть интерес покупателей, товар в наличии и свободно рекламное место. Данные вымышленные.`}
      />

      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2 @5xl:grid-cols-3">
        {featured.map((o) => (
          <OpportunityCard key={o.id} o={o} selected={o.id === whyId} />
        ))}
      </div>

      {why && <WhyPanel o={why} all={all} onClose={() => setUi({ whyOpportunityId: null })} />}

      <AllSignals all={all} />
    </div>
  )
}

function OpportunityCard({ o, selected }: { o: Opportunity; selected: boolean }) {
  const pharmacy = getPharmacy(o.pharmacyId)
  const product = getProduct(o.sku)
  const openForm = useStore((s) => s.openForm)
  const ready = o.kind === 'ready'

  return (
    <Card as="article" className={cx('flex flex-col p-5 transition-shadow', selected && 'border-signal-edge ring-2 ring-sky')} aria-label={`${pharmacy.city}, ${product.shortName}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm text-muted">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span>{pharmacy.city} · {pharmacy.name}</span>
          </div>
        </div>
        {ready ? (
          <Badge tone="positive" dot>Можно запускать</Badge>
        ) : (
          <Badge tone="warning" dot>Сначала пополнить ассортимент</Badge>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <ProductPack sku={o.sku} size={52} />
        <div className="min-w-0">
          <h3 className="font-display text-base leading-snug font-semibold">{product.name}</h3>
          <p className="text-xs text-muted">{product.sku} · {product.volume}</p>
        </div>
      </div>

      <p className="mt-4 text-sm text-body">{o.headline}</p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-canvas p-3 text-sm">
        <Metric
          icon={<Eye className="size-3.5" aria-hidden />}
          label={<span className="inline-flex items-center gap-1">Интерес, 7 дн. <InfoTip text={INTEREST_TIP} label="Интерес" /></span>}
          value={int(o.views7d)}
          hint={`${INTEREST_LABELS[o.interest].toLowerCase()} · просмотров категории`}
        />
        <Metric icon={<Search className="size-3.5" aria-hidden />} label="Поиски товара" value={int(o.searches)} hint="за 7 дней" />
        <Metric
          icon={o.stock === 0 ? <PackageX className="size-3.5" aria-hidden /> : <Boxes className="size-3.5" aria-hidden />}
          label="Доступно"
          value={<span className={cx(o.stock === 0 && 'text-negative')}>{int(o.stock)} шт.</span>}
          hint={o.stock < MIN_STOCK_FOR_LAUNCH ? `для запуска нужно от ${MIN_STOCK_FOR_LAUNCH} шт.` : 'в наличии'}
        />
        <Metric icon={<ShoppingBag className="size-3.5" aria-hidden />} label="Цена" value={tenge(o.price)} hint="на полке аптеки" />
      </dl>

      <div className="mt-3 space-y-1 text-xs text-muted">
        <p>
          Рекламное место: {o.slotName} — {o.slotAvailable ? <span className="text-positive">свободно</span> : <span className="text-negative">недоступно</span>}
        </p>
        <p>Обновлено: остатки {formatRelative(o.inventoryUpdatedAt)}, интерес {formatRelative(o.signalUpdatedAt)}</p>
      </div>

      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        {o.openCampaign ? (
          <Button variant="secondary" onClick={() => go.campaign(o.openCampaign!.id)} icon={<ArrowRight className="size-4" aria-hidden />}>
            Кампания №{o.openCampaign.number}
          </Button>
        ) : ready ? (
          <Button variant="primary" onClick={() => openForm({ pharmacyId: o.pharmacyId, sku: o.sku })}>
            Создать кампанию
          </Button>
        ) : (
          <Button
            variant="primary"
            disabledReason={
              o.stock === 0
                ? 'Доступно 0 шт.: реклама привела бы покупателей к пустой полке. Сначала аптека пополняет остаток'
                : `Доступно ${o.stock} шт. — меньше ${MIN_STOCK_FOR_LAUNCH}. Сначала аптека пополняет остаток`
            }
          >
            Создать кампанию
          </Button>
        )}
        <Button variant="ghost" aria-expanded={selected} aria-controls={selected ? 'why-panel' : undefined} onClick={() => go.why(o.id)}>
          {ready ? 'Почему эта возможность' : 'Посмотреть основания'}
        </Button>
      </div>
    </Card>
  )
}

function Metric({ icon, label, value, hint }: { icon: ReactNode; label: ReactNode; value: ReactNode; hint: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-xs text-muted">
        <span className="text-faint">{icon}</span>
        {label}
      </dt>
      <dd className="mt-0.5 font-display text-lg font-semibold text-ink tabular-nums">{value}</dd>
      <dd className="text-[11px] leading-tight text-muted">{hint}</dd>
    </div>
  )
}

// ── «Почему эта возможность» ────────────────────────────────────────────────

function WhyPanel({ o, all, onClose }: { o: Opportunity; all: Opportunity[]; onClose: () => void }) {
  const pharmacy = getPharmacy(o.pharmacyId)
  const product = getProduct(o.sku)
  const category = getCategory(o.category)
  const ready = o.kind === 'ready'
  const sameProductElsewhere = all.filter((x) => x.sku === o.sku && x.pharmacyId !== o.pharmacyId)

  return (
    <Card id="why-panel" tabIndex={-1} className="scroll-mt-24 p-5 outline-none sm:p-6" aria-labelledby="why-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id="why-title" className="font-display text-lg font-semibold">Почему эта возможность</h3>
          <p className="mt-0.5 text-sm text-muted">
            Путь в графе: бренд → товар → аптека → город. Каждая связь — факт из каталога и сигналов аптеки.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Закрыть пояснение" className="rounded-full p-1.5 text-muted hover:bg-wash hover:text-ink">
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <ol className="mt-5 flex flex-col items-stretch gap-0 @4xl:flex-row @4xl:items-center" aria-label="Путь возможности в графе">
        <GraphNode kind="Бренд" title={BRAND.name} sub="Небольшой бренд ухода и гигиены" icon={<Sparkles className="size-4" aria-hidden />} />
        <GraphEdge label="в портфеле бренда" />
        <GraphNode kind="Товар" title={product.shortName} sub={`${product.volume} · ${category.label}`} icon={<ProductPack sku={o.sku} size={22} className="rounded" />} />
        <GraphEdge label={o.stock > 0 ? `в наличии ${int(o.stock)} шт. · ${tenge(o.price)}` : 'нет в наличии'} warn={o.stock < MIN_STOCK_FOR_LAUNCH} />
        <GraphNode kind="Аптека" title={pharmacy.name} sub={o.slotAvailable ? 'рекламное место свободно' : 'рекламное место занято'} icon={<Building2 className="size-4" aria-hidden />} />
        <GraphEdge label={`интерес: ${int(o.views7d)} просмотров`} />
        <GraphNode kind="Город" title={pharmacy.city} sub={INTEREST_LABELS[o.interest]} icon={<MapPin className="size-4" aria-hidden />} highlight />
      </ol>

      <div className="mt-6 grid gap-6 @3xl:grid-cols-2">
        <div>
          <h4 className="text-sm font-medium">Основания</h4>
          <ul className="mt-2 space-y-1.5 text-sm text-body">
            {o.reasons.map((r) => (
              <li key={r} className="flex gap-2">
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
                {r}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">{INTEREST_TIP}</p>
        </div>
        <div className="space-y-3">
          {ready ? (
            <Notice tone="positive">
              Интерес есть, товар в наличии, рекламное место свободно. Бренд платит за клики и компенсирует скидку только за выкупленные заказы.
            </Notice>
          ) : (
            <Notice tone="warning" icon={<PackageX className="size-4" />}>
              <p className="font-medium">Сначала пополнить ассортимент</p>
              <p className="mt-0.5">
                Интерес есть, но доступно {int(o.stock)} шт. Реклама сейчас привела бы покупателей к пустой полке. Когда аптека пополнит остаток, карточка станет «Можно запускать».
              </p>
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => go.pharmacy(o.pharmacyId, 'catalog')}>
                Открыть каталог аптеки
              </Button>
            </Notice>
          )}
          {sameProductElsewhere.length > 0 && (
            <div>
              <h4 className="text-sm font-medium">Тот же товар в других аптеках</h4>
              <ul className="mt-2 divide-y divide-line rounded-lg border border-line text-sm">
                {sameProductElsewhere.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>{getPharmacy(x.pharmacyId).city} · {getPharmacy(x.pharmacyId).name}</span>
                    <span className="text-muted tabular-nums">{int(x.views7d)} просм. · {int(x.stock)} шт.</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function GraphNode({ kind, title, sub, icon, highlight }: { kind: string; title: string; sub: string; icon: ReactNode; highlight?: boolean }) {
  return (
    <li className={cx('min-w-0 flex-1 self-stretch rounded-lg border px-3 py-2.5', highlight ? 'border-signal-edge bg-sky-soft' : 'border-line bg-surface')}>
      <div className="flex items-start gap-2">
        <span className={cx('flex size-7 shrink-0 items-center justify-center rounded-md', highlight ? 'bg-signal text-ink' : 'bg-wash text-body')}>{icon}</span>
        <div className="min-w-0">
          <div className="text-[11px] tracking-wide text-muted uppercase">{kind}</div>
          <div className="text-sm leading-snug font-medium text-pretty hyphens-auto break-words text-ink">{title}</div>
        </div>
      </div>
      <div className="mt-1 text-xs leading-snug text-pretty break-words text-muted">{sub}</div>
    </li>
  )
}

function GraphEdge({ label, warn }: { label: string; warn?: boolean }) {
  return (
    <li aria-label={label} className="flex shrink-0 items-center justify-center py-1 @4xl:w-28 @4xl:flex-col @4xl:py-0">
      <span className={cx('order-2 px-2 text-center text-[11px] leading-tight @4xl:order-1 @4xl:mb-1', warn ? 'text-negative' : 'text-muted')}>{label}</span>
      <span aria-hidden className={cx('order-1 h-5 w-px @4xl:order-2 @4xl:h-px @4xl:w-full', warn ? 'bg-negative' : 'bg-line-strong')} />
    </li>
  )
}

function AllSignals({ all }: { all: Opportunity[] }) {
  return (
    <details className="group rounded-card border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
        Все сигналы по аптекам ({all.length})
        <ChevronRight className="size-4 text-muted transition-transform group-open:rotate-90" aria-hidden />
      </summary>
      <div className="relative overflow-x-auto border-t border-line">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Все пары аптека и товар с сигналом интереса</caption>
          <thead>
            <tr className="text-left text-xs text-muted">
              <th scope="col" className="px-5 py-2 font-medium">Аптека</th>
              <th scope="col" className="px-5 py-2 font-medium">Товар</th>
              <th scope="col" className="px-5 py-2 text-right font-medium">Просмотры, 7 дн.</th>
              <th scope="col" className="px-5 py-2 text-right font-medium">Поиски</th>
              <th scope="col" className="px-5 py-2 text-right font-medium">Доступно</th>
              <th scope="col" className="px-5 py-2 font-medium">Статус</th>
            </tr>
          </thead>
          <tbody>
            {all.map((o) => (
              <tr key={o.id} className="border-t border-line">
                <td className="px-5 py-2 whitespace-nowrap">{getPharmacy(o.pharmacyId).city} · {getPharmacy(o.pharmacyId).name}</td>
                <td className="px-5 py-2 whitespace-nowrap">{getProduct(o.sku).shortName}</td>
                <td className="px-5 py-2 text-right tabular-nums">{int(o.views7d)}</td>
                <td className="px-5 py-2 text-right tabular-nums">{int(o.searches)}</td>
                <td className="px-5 py-2 text-right tabular-nums">{int(o.stock)} шт.</td>
                <td className="px-5 py-2 whitespace-nowrap">
                  {o.openCampaign ? (
                    <Badge tone="info">Кампания №{o.openCampaign.number}</Badge>
                  ) : o.kind === 'ready' ? (
                    <Badge tone={o.interest === 'low' ? 'neutral' : 'positive'}>{o.interest === 'low' ? 'Низкий интерес' : 'Можно запускать'}</Badge>
                  ) : (
                    <Badge tone="warning">Пополнить</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
