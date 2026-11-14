import { ReceiptText } from 'lucide-react'
import { LEDGER_LABELS } from '../domain/metrics'
import type { AppState, LedgerEntry } from '../domain/types'
import { signedTenge, tenge } from '../lib/format'
import { formatDateTime } from '../lib/time'
import { Badge, EmptyState, cx } from './primitives'
import type { Tone } from '../domain/rules'

const STATUS_TONE: Record<string, Tone> = {
  'Начислено': 'positive',
  'Подтверждено': 'positive',
  'В резерве': 'info',
  'Резерв освобожден': 'neutral',
  'Переведен в компенсацию': 'neutral',
  'Сторнировано': 'warning',
  'Проведено': 'neutral',
}

/** Operations journal derived from clicks and order histories. */
export function LedgerTable({ state, entries, showPharmacyAccrual, caption, emptyText }: {
  state: AppState
  entries: LedgerEntry[]
  showPharmacyAccrual?: boolean
  caption: string
  emptyText: string
}) {
  if (entries.length === 0) {
    return <EmptyState icon={<ReceiptText className="size-6" />} title="Операций пока нет" text={emptyText} />
  }
  const campaignNo = (id: string) => state.campaigns.find((c) => c.id === id)?.number
  return (
    <div className="relative overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full min-w-[720px] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th scope="col" className="px-4 py-2.5 font-medium">Дата</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Кампания</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Заказ / событие</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Операция</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">Сумма</th>
            {showPharmacyAccrual && <th scope="col" className="px-4 py-2.5 text-right font-medium">Начисление аптеке</th>}
            <th scope="col" className="px-4 py-2.5 font-medium">Статус</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const negative = e.kind === 'discount_reversed'
            return (
              <tr key={e.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 whitespace-nowrap text-muted tabular-nums">{formatDateTime(e.at)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">№{campaignNo(e.campaignId) ?? '—'}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{e.orderNumber !== null ? `Заказ №${e.orderNumber}` : 'Клик по карточке'}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{LEDGER_LABELS[e.kind]}</td>
                <td className={cx('px-4 py-2.5 text-right whitespace-nowrap tabular-nums', negative && 'text-negative')}>
                  {negative ? signedTenge(-e.amount) : tenge(e.amount)}
                </td>
                {showPharmacyAccrual && (
                  <td className={cx('px-4 py-2.5 text-right whitespace-nowrap tabular-nums', e.pharmacyAccrual < 0 ? 'text-negative' : e.pharmacyAccrual === 0 ? 'text-muted' : 'text-ink')}>
                    {e.pharmacyAccrual === 0 ? '—' : signedTenge(e.pharmacyAccrual)}
                  </td>
                )}
                <td className="px-4 py-2.5 whitespace-nowrap"><Badge tone={STATUS_TONE[e.status] ?? 'neutral'}>{e.status}</Badge></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
