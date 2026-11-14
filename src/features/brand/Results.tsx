import { BarChart3 } from 'lucide-react'
import { useMemo } from 'react'
import { buildLedger, campaignMetrics, sumMetrics } from '../../domain/metrics'
import { getPharmacy, getProduct } from '../../domain/seed'
import { int, plural, tenge } from '../../lib/format'
import { go } from '../../store/commands'
import { useStore } from '../../store/store'
import { HBars, SegmentedBar, SERIES } from '../../ui/charts'
import { LedgerTable } from '../../ui/LedgerTable'
import { Button, Card, EmptyState, InfoTip, Notice, SectionTitle, SelectField, Stat } from '../../ui/primitives'

const ATTRIBUTION =
  'Заказ относится к кампании, если в той же сессии покупателя перед заказом был последний рекламный клик по этому товару в этой аптеке. Один клик дает скидку на один заказ; отмена заказа освобождает клик.'

export function Results() {
  const data = useStore((s) => s.data)
  const selected = useStore((s) => s.ui.resultsCampaignId)
  const setUi = useStore((s) => s.setUi)

  const campaign = data.campaigns.find((c) => c.id === selected) ?? null
  const m = useMemo(
    () => sumMetrics((campaign ? [campaign] : data.campaigns).map((c) => campaignMetrics(data, c))),
    [data, campaign],
  )
  const ledger = useMemo(() => buildLedger(data, campaign ? { campaignId: campaign.id } : {}), [data, campaign])

  if (data.campaigns.length === 0) {
    return (
      <div className="space-y-6">
        <SectionTitle title="Результаты" />
        <EmptyState
          icon={<BarChart3 className="size-8" />}
          title="Результатов пока нет"
          text="Результаты появятся после первого клика по рекламной карточке в витрине."
          action={<Button variant="primary" onClick={() => go.brand('opportunities')}>Перейти к возможностям</Button>}
        />
      </div>
    )
  }

  const pharmacyAd = m.pharmacyAdRevenue
  const platform = m.platformRevenue
  const comp = m.confirmedDiscounts

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Результаты"
        subtitle="От клика до выкупа: фактические расходы бренда и куда они ушли. Без прогнозов ROI и прибыли."
        action={
          <div className="w-full sm:w-80">
            <SelectField
              label="Кампания"
              value={campaign?.id ?? 'all'}
              onChange={(v) => setUi({ resultsCampaignId: v === 'all' ? null : v })}
              options={[
                { value: 'all', label: `Все кампании (${data.campaigns.length})` },
                ...[...data.campaigns]
                  .sort((a, b) => b.number - a.number)
                  .map((c) => ({ value: c.id, label: `№${c.number} · ${getProduct(c.sku).shortName}, ${getPharmacy(c.pharmacyId).city}` })),
              ]}
            />
          </div>
        }
      />

      <Card className="p-5 sm:p-6">
        <div className="grid gap-6 @3xl:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <Stat
            label="Итого расход бренда"
            value={tenge(m.brandSpend)}
            hint="рекламный расход + подтвержденные компенсации"
            emphasis
          />
          <Stat label="Рекламный расход" value={tenge(m.adSpend)} hint={`${int(m.validClicks)} ${plural(m.validClicks, ['клик', 'клика', 'кликов'])}`} />
          <Stat label="Подтвержденные компенсации" value={tenge(m.confirmedDiscounts)} hint="скидки по выкупленным заказам" />
          <Stat
            label="В резерве"
            value={tenge(m.reservedDiscounts)}
            hint="не входит в расход до выкупа"
            info="Скидка по заказу, который еще не выкуплен. После выкупа станет компенсацией, после отмены — освободится."
          />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-6 border-t border-line pt-5 @2xl:grid-cols-3 @4xl:grid-cols-6">
          <Stat label="Засчитанные клики" value={int(m.validClicks)} info="Повторный клик того же покупателя в той же сессии не тарифицируется." />
          <Stat label="Заказы" value={int(m.orders)} info={ATTRIBUTION} />
          <Stat label="Выкупы (нетто)" value={int(m.redeemed)} hint="без отмен и возвратов" />
          <Stat label="Отмены" value={int(m.cancelled)} />
          <Stat label="Возвраты" value={int(m.returned)} />
          <Stat
            label="Расход на выкуп"
            value={m.costPerRedemption !== null ? tenge(m.costPerRedemption) : '—'}
            hint={m.costPerRedemption !== null ? '(реклама + компенсации) / выкупы' : 'нет выкупов — делить не на что'}
          />
        </div>
      </Card>

      <div className="grid gap-4 @4xl:grid-cols-2">
        <Card className="p-5">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            Воронка: клик → заказ → выкуп
            <InfoTip text={ATTRIBUTION} label="Атрибуция" />
          </h3>
          <p className="mt-0.5 mb-4 text-xs text-muted">Количество событий по атрибутированным заказам</p>
          <HBars
            label="Воронка кампании"
            rows={[
              { key: 'clicks', label: 'Клики', value: m.validClicks, display: int(m.validClicks), color: SERIES[0] },
              { key: 'orders', label: 'Заказы', value: m.orders, display: int(m.orders), hint: 'со скидкой бренда', color: SERIES[0] },
              { key: 'redeemed', label: 'Выкупы', value: m.redeemed, display: int(m.redeemed), hint: 'нетто, без возвратов', color: SERIES[0] },
            ]}
          />
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold">Куда ушли деньги бренда</h3>
          <p className="mt-0.5 mb-4 text-xs text-muted">Только подтвержденные суммы; резерв не показан</p>
          <SegmentedBar
            label="Распределение расхода бренда"
            emptyText="Расходов пока нет"
            parts={[
              { key: 'ph-ad', label: 'Аптеке за рекламу', value: pharmacyAd, display: tenge(pharmacyAd), color: SERIES[0] },
              { key: 'platform', label: 'Платформе', value: platform, display: tenge(platform), color: SERIES[1] },
              { key: 'comp', label: 'Компенсации скидок аптеке', value: comp, display: tenge(comp), color: SERIES[2] },
            ]}
          />
          <p className="mt-4 rounded-lg bg-canvas px-3 py-2 text-xs text-body tabular-nums">
            Сверка: {tenge(m.brandSpend)} = {tenge(pharmacyAd)} аптеке за рекламу + {tenge(comp)} компенсации + {tenge(platform)} платформе
          </p>
        </Card>
      </div>

      <Notice tone="neutral">
        Здесь нет прогноза ROI и прибыли бренда: прототип показывает только фактические клики, заказы и деньги. Чтобы оценить, сколько продаж кампания добавила, нужен эксперимент с контрольной группой — пример на вкладке «Пример оценки прироста».
      </Notice>

      <LedgerTable
        state={data}
        entries={ledger}
        caption={campaign ? `Операции кампании №${campaign.number}` : 'Операции всех кампаний'}
        emptyText="Операции появятся после первого клика по рекламе в витрине."
      />
    </div>
  )
}
