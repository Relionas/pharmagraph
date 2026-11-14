import { buildLedger, pharmacySettlement } from '../../domain/metrics'
import { PHARMACY_AD_SHARE_PCT } from '../../domain/seed'
import { tenge } from '../../lib/format'
import { useStore } from '../../store/store'
import { LedgerTable } from '../../ui/LedgerTable'
import { Card, Notice, SectionTitle, Stat } from '../../ui/primitives'

export function Settlements({ pharmacyId }: { pharmacyId: string }) {
  const data = useStore((s) => s.data)
  const s = pharmacySettlement(data, pharmacyId)
  const ledger = buildLedger(data, { pharmacyId })

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Расчеты"
        subtitle="Начисления по рекламе и компенсациям скидок. Все суммы — в тенге, без реальных выплат."
      />
      <Card className="p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-6 @3xl:grid-cols-4">
          <Stat
            label="Доход от рекламы"
            value={tenge(s.adRevenue)}
            hint={`${PHARMACY_AD_SHARE_PCT} % от каждого засчитанного клика`}
          />
          <Stat
            label="Подтвержденные компенсации"
            value={tenge(s.confirmedCompensation)}
            hint="скидки по выкупленным заказам"
          />
          <Stat label="Итого начислено" value={tenge(s.totalAccrued)} hint="реклама + компенсации" emphasis />
          <Stat
            label="В резерве"
            value={tenge(s.reservedDiscounts)}
            hint="не входит в «Итого» до выкупа"
            info="Скидки по заказам, которые ожидают выкупа. После выкупа станут компенсацией, после отмены — освободятся."
          />
        </div>
        <p className="mt-5 rounded-lg bg-canvas px-3 py-2 text-xs text-body tabular-nums">
          Итого начислено: {tenge(s.totalAccrued)} = {tenge(s.adRevenue)} доход от рекламы + {tenge(s.confirmedCompensation)} подтвержденные компенсации
        </p>
      </Card>

      <Notice tone="neutral">
        Компенсация — это возмещение скидки, которую аптека дала покупателю за счет бренда, а не прибыль. В прототипе нет реальных выплат: суммы показывают, что было бы начислено.
      </Notice>

      <LedgerTable
        state={data}
        entries={ledger}
        showPharmacyAccrual
        caption="Операции аптеки"
        emptyText="Операции появятся, когда покупатель кликнет по рекламе этой аптеки в витрине."
      />
    </div>
  )
}
