import { Check, Inbox, X } from 'lucide-react'
import { findInventory, splitClick } from '../../domain/metrics'
import { campaignStatus, needsPharmacyDecision } from '../../domain/rules'
import { BRAND, getProduct, PHARMACY_AD_SHARE_PCT } from '../../domain/seed'
import type { Campaign } from '../../domain/types'
import { int, plural, tenge } from '../../lib/format'
import { formatDayKeyShort } from '../../lib/time'
import { commands } from '../../store/commands'
import { today, useStore } from '../../store/store'
import { ProductPack } from '../../ui/ProductPack'
import { Badge, Button, Card, EmptyState, KeyValue, Notice, SectionTitle } from '../../ui/primitives'

export function Offers({ pharmacyId }: { pharmacyId: string }) {
  const data = useStore((s) => s.data)
  const t = today()
  const mine = data.campaigns.filter((c) => c.pharmacyId === pharmacyId).sort((a, b) => b.number - a.number)
  const toDecide = mine.filter((c) => needsPharmacyDecision(data, c, t))
  const others = mine.filter((c) => !toDecide.includes(c))

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Предложения брендов"
        subtitle="Бренд оплачивает клики и компенсирует скидку за каждый выкупленный заказ. Показ начнется только после вашего подтверждения."
      />
      {toDecide.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-8" />}
          title="Новых предложений нет"
          text="Когда бренд отправит кампанию в эту аптеку или цена товара изменится в действующей кампании, предложение появится здесь."
        />
      ) : (
        <div className="grid gap-4 @4xl:grid-cols-2">
          {toDecide.map((c) => <OfferCard key={c.id} c={c} />)}
        </div>
      )}

      {others.length > 0 && (
        <Card className="overflow-hidden">
          <h3 className="border-b border-line px-5 py-3 text-sm font-semibold">Все кампании в аптеке</h3>
          <ul className="divide-y divide-line">
            {others.map((c) => {
              const st = campaignStatus(data, c, t)
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="text-muted">№{c.number}</span> {c.name}
                    <span className="block text-xs text-muted">
                      {formatDayKeyShort(c.startDate)} — {formatDayKeyShort(c.endDate)}
                      {c.agreedPrice !== null && ` · согласованная цена ${tenge(c.agreedPrice)}`}
                    </span>
                  </span>
                  <Badge tone={st.tone} dot>{st.label}</Badge>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}

function OfferCard({ c }: { c: Campaign }) {
  const data = useStore((s) => s.data)
  const product = getProduct(c.sku)
  const item = findInventory(data, c.pharmacyId, c.sku)
  const price = item?.price ?? 0
  const split = splitClick(c.cpc)
  const maxClicks = Math.floor(c.adBudget / c.cpc)
  const reapproval = c.approval === 'approved'
  const invalid = !item
    ? 'Товара нет в ассортименте — подтвердить нельзя'
    : c.discountPerUnit >= price
      ? `Скидка ${tenge(c.discountPerUnit)} не меньше текущей цены ${tenge(price)}. Измените цену в ассортименте или отклоните`
      : null

  return (
    <Card as="article" className="flex flex-col p-5" aria-label={`Предложение по кампании №${c.number}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ProductPack sku={c.sku} size={48} />
          <div className="min-w-0">
            <p className="text-xs text-muted">{BRAND.name} · кампания №{c.number}</p>
            <h3 className="font-display text-base font-semibold">{product.name}</h3>
          </div>
        </div>
        {reapproval ? <Badge tone="warning" dot>Новая цена</Badge> : <Badge tone="info" dot>Новое предложение</Badge>}
      </div>

      {reapproval && c.agreedPrice !== null && (
        <Notice tone="warning" className="mt-4">
          Цена изменилась: было согласовано {tenge(c.agreedPrice)}, сейчас {tenge(price)}. Показ остановлен до вашего решения. Уже созданные заказы сохраняют свою цену.
        </Notice>
      )}

      <KeyValue
        className="mt-4"
        items={[
          ['Период', `${formatDayKeyShort(c.startDate)} — ${formatDayKeyShort(c.endDate)}`],
          ['Формат', 'Карточка в каталоге, позиция 1'],
          ['Текущая цена', tenge(price)],
          ['Цена со скидкой бренда', price > c.discountPerUnit ? tenge(price - c.discountPerUnit) : '—'],
          ['Компенсация за выкуп', `${tenge(c.discountPerUnit)} за единицу`],
          ['Бюджет скидок', tenge(c.discountBudget)],
          ['Рекламный бюджет / CPC', `${tenge(c.adBudget)} / ${tenge(c.cpc)}`],
          [`Доля аптеки, ${PHARMACY_AD_SHARE_PCT} %`, `${tenge(split.pharmacyShare)} за клик, до ${tenge(split.pharmacyShare * maxClicks)}`],
        ]}
      />
      <p className="mt-3 text-xs text-muted">
        Компенсация начисляется только за выкупленный заказ и сторнируется при возврате. Это возмещение скидки покупателю, а не доход аптеки. До {int(maxClicks)} {plural(maxClicks, ['оплачиваемого клика', 'оплачиваемых кликов', 'оплачиваемых кликов'])}.
      </p>

      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <Button variant="primary" icon={<Check className="size-4" aria-hidden />} disabledReason={invalid} onClick={() => commands.approve(c.id)}>
          {reapproval ? 'Подтвердить новую цену' : 'Подтвердить участие'}
        </Button>
        <Button variant="ghost" icon={<X className="size-4" aria-hidden />} onClick={() => commands.reject(c.id)}>
          Отклонить
        </Button>
      </div>
    </Card>
  )
}
