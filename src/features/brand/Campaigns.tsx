import { BarChart3, Building2, CirclePause, CirclePlay, Flag, Megaphone, Plus, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { campaignMetrics } from '../../domain/metrics'
import { campaignStatus, joinRu, resumeOutlook } from '../../domain/rules'
import { getPharmacy, getProduct } from '../../domain/seed'
import type { Campaign } from '../../domain/types'
import { int, tenge } from '../../lib/format'
import { formatDayKeyShort } from '../../lib/time'
import { commands, go } from '../../store/commands'
import { today, useStore } from '../../store/store'
import { Meter, SERIES, SERIES_SOFT } from '../../ui/charts'
import { ProductPack } from '../../ui/ProductPack'
import { Badge, Button, Card, ConfirmDialog, EmptyState, SectionTitle } from '../../ui/primitives'

export function Campaigns() {
  const data = useStore((s) => s.data)
  const openForm = useStore((s) => s.openForm)
  const list = [...data.campaigns].sort((a, b) => b.number - a.number)

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Кампании"
        subtitle="Одна аптека и один товар на кампанию. Показ идет, только пока выполнены все условия; при их восстановлении он возобновляется сам, кроме ручной паузы."
        action={<Button variant="secondary" icon={<Plus className="size-4" aria-hidden />} onClick={() => openForm()}>Новая кампания</Button>}
      />
      {list.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="size-8" />}
          title="Кампаний пока нет"
          text="Начните с вкладки «Возможности»: там видно, в какой аптеке есть интерес к товару, остаток и свободное рекламное место."
          action={<Button variant="primary" onClick={() => go.brand('opportunities')}>Перейти к возможностям</Button>}
        />
      ) : (
        <div className="space-y-4">
          {list.map((c) => <CampaignCard key={c.id} c={c} />)}
        </div>
      )}
    </div>
  )
}

function CampaignCard({ c }: { c: Campaign }) {
  const data = useStore((s) => s.data)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const t = today()
  const status = campaignStatus(data, c, t)
  const m = campaignMetrics(data, c)
  const pharmacy = getPharmacy(c.pharmacyId)
  const product = getProduct(c.sku)
  const approved = c.approval === 'approved'
  const closed = c.approval === 'rejected' || c.approval === 'finished'
  const autoBlockers = status.blockers.filter((b) => b.code !== 'paused' && b.code !== 'not_approved' && b.code !== 'rejected' && b.code !== 'finished')
  const outlook = resumeOutlook(autoBlockers)
  const titleId = `campaign-${c.id}-title`

  return (
    <Card as="article" id={`campaign-${c.id}`} tabIndex={-1} aria-labelledby={titleId} className="scroll-mt-24 p-5 focus-visible:ring-2 focus-visible:ring-sky">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ProductPack sku={c.sku} size={44} />
          <div className="min-w-0">
            <h3 id={titleId} className="font-display text-base font-semibold">
              <span className="text-muted">№{c.number}</span> {c.name}
            </h3>
            <p className="text-sm text-muted">
              {pharmacy.name}, {pharmacy.city} · {product.shortName} · {formatDayKeyShort(c.startDate)} — {formatDayKeyShort(c.endDate)}
            </p>
          </div>
        </div>
        <Badge tone={status.tone} dot>{status.label}</Badge>
      </div>

      {c.approval === 'pending' && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-sky-soft px-3 py-2.5 text-sm text-signal-ink">
          <span>Предложение отправлено в кабинет аптеки. Показ начнется после ее подтверждения.</span>
          <Button size="sm" variant="secondary" icon={<Building2 className="size-3.5" aria-hidden />} onClick={() => go.pharmacy(c.pharmacyId, 'offers')}>
            Открыть кабинет аптеки
          </Button>
        </div>
      )}

      {approved && autoBlockers.length > 0 && (
        <div role="status" className="mt-4 rounded-lg border border-[#f1c9c5] bg-negative-soft px-3 py-2.5 text-sm text-negative">
          <p className="flex items-center gap-1.5 font-medium">
            <TriangleAlert className="size-4 shrink-0" aria-hidden /> Почему показ остановлен
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-6">
            {autoBlockers.map((b) => <li key={b.code}>{b.message}</li>)}
          </ul>
          <p className="mt-1.5 text-xs text-body">
            {outlook.final
              ? 'Эта кампания больше не возобновит показ. Завершите ее, чтобы запустить новую для этой аптеки и товара.'
              : outlook.needs.length > 0 && `Показ возобновится сам, когда ${joinRu(outlook.needs)}.`}
          </p>
          {autoBlockers.some((b) => b.code === 'price_changed' || b.code === 'no_stock') && (
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => go.pharmacy(c.pharmacyId, autoBlockers.some((b) => b.code === 'price_changed') ? 'offers' : 'catalog')}>
              Открыть кабинет аптеки
            </Button>
          )}
        </div>
      )}
      {approved && c.paused && (
        <p className="mt-4 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          Ручная пауза: показ не возобновится сам, пока вы не снимете паузу.
        </p>
      )}

      <div className="mt-5 grid gap-5 @3xl:grid-cols-[1fr_1fr_1.2fr]">
        <Meter
          label="Рекламный бюджет"
          max={c.adBudget}
          parts={[{ key: 'spent', value: m.adSpend, color: SERIES[0] }]}
          display={`${tenge(m.adSpend)} из ${tenge(c.adBudget)}`}
        />
        <div>
          <Meter
            label="Бюджет скидок"
            max={c.discountBudget}
            parts={[
              { key: 'confirmed', value: m.confirmedDiscounts, color: SERIES[0] },
              { key: 'reserved', value: m.reservedDiscounts, color: SERIES_SOFT },
            ]}
            display={`${tenge(m.confirmedDiscounts + m.reservedDiscounts)} из ${tenge(c.discountBudget)}`}
          />
          <p className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1"><span aria-hidden className="size-2 rounded-sm" style={{ background: SERIES[0] }} />подтверждено {tenge(m.confirmedDiscounts)}</span>
            <span className="inline-flex items-center gap-1"><span aria-hidden className="size-2 rounded-sm" style={{ background: SERIES_SOFT }} />в резерве {tenge(m.reservedDiscounts)}</span>
          </p>
        </div>
        <dl className="grid grid-cols-4 gap-2 text-sm">
          <Mini label="Клики" value={int(m.validClicks)} />
          <Mini label="Заказы" value={int(m.orders)} />
          <Mini label="Выкупы" value={int(m.redeemed)} />
          <Mini label="Расход" value={tenge(m.brandSpend)} />
        </dl>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        <Button size="sm" variant="secondary" icon={<BarChart3 className="size-3.5" aria-hidden />} onClick={() => go.brand('results', { resultsCampaignId: c.id })}>
          Результаты
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={c.paused ? <CirclePlay className="size-3.5" aria-hidden /> : <CirclePause className="size-3.5" aria-hidden />}
          disabledReason={!approved ? (closed ? 'Кампания уже закрыта' : 'Пауза доступна после подтверждения аптеки') : null}
          onClick={() => commands.setPaused(c.id, !c.paused)}
        >
          {c.paused ? 'Снять с паузы' : 'Пауза'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Flag className="size-3.5" aria-hidden />}
          disabledReason={closed ? 'Кампания уже закрыта' : null}
          onClick={() => setConfirmFinish(true)}
        >
          Завершить
        </Button>
      </div>

      <ConfirmDialog
        open={confirmFinish}
        title={`Завершить кампанию №${c.number}?`}
        text={
          <>
            Показ прекратится навсегда. Уже созданные заказы можно будет выкупить или отменить, начисления сохранятся.
            {m.pending > 0 && ` Сейчас ожидают выкупа: ${m.pending}.`}
          </>
        }
        confirmLabel="Завершить"
        onConfirm={() => commands.finish(c.id)}
        onClose={() => setConfirmFinish(false)}
      />
    </Card>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate font-medium text-ink tabular-nums">{value}</dd>
    </div>
  )
}
