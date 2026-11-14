import { FlaskConical } from 'lucide-react'
import { computeUplift } from '../../domain/uplift'
import { int, percent, tenge } from '../../lib/format'
import { useStore } from '../../store/store'
import { HBars, SERIES, SERIES_SOFT } from '../../ui/charts'
import { Card, Notice, SectionTitle, Stat } from '../../ui/primitives'

const pp = (v: number) => `${v > 0 ? '+' : ''}${String(v).replace('.', ',')} п.п.`

export function Uplift() {
  const e = useStore((s) => s.data.experiment)
  const u = computeUplift(e)

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Пример оценки прироста"
        subtitle="Как бренд мог бы понять, сколько покупателей кампания добавила сверх тех, кто купил бы и без нее."
      />

      <Notice tone="warning" icon={<FlaskConical className="size-4" />}>
        <strong className="font-medium">Синтетический пример завершенного эксперимента. Не связан с текущими тестовыми заказами.</strong>
      </Notice>

      <div className="grid gap-4 @4xl:grid-cols-[1.1fr_1fr]">
        <Card className="p-5 sm:p-6">
          <h3 className="text-sm font-semibold">Доля покупателей в группах</h3>
          <p className="mt-0.5 mb-5 text-xs text-muted">
            Участники случайно разделены на две равные группы по {int(e.control.participants)} человек. Контрольная группа рекламу не видела.
          </p>
          <HBars
            label="Доля покупателей: контрольная и тестовая группы"
            max={Math.ceil(u.treatmentRate)}
            rows={[
              {
                key: 'control',
                label: 'Контроль, без рекламы',
                value: u.controlRate,
                display: percent(u.controlRate),
                hint: `${int(e.control.buyers)} покупателей из ${int(e.control.participants)}`,
                color: SERIES_SOFT,
              },
              {
                key: 'treatment',
                label: 'Тест, с рекламой и скидкой',
                value: u.treatmentRate,
                display: percent(u.treatmentRate),
                hint: `${int(e.treatment.buyers)} покупателей из ${int(e.treatment.participants)}`,
                color: SERIES[0],
              },
            ]}
          />
          <table className="mt-5 w-full text-sm">
            <caption className="sr-only">Данные эксперимента</caption>
            <thead>
              <tr className="text-left text-xs text-muted">
                <th scope="col" className="py-1.5 font-medium">Группа</th>
                <th scope="col" className="py-1.5 text-right font-medium">Участники</th>
                <th scope="col" className="py-1.5 text-right font-medium">Покупатели</th>
                <th scope="col" className="py-1.5 text-right font-medium">Доля</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr className="border-t border-line">
                <th scope="row" className="py-1.5 text-left font-normal">Контроль</th>
                <td className="py-1.5 text-right">{int(e.control.participants)}</td>
                <td className="py-1.5 text-right">{int(e.control.buyers)}</td>
                <td className="py-1.5 text-right">{percent(u.controlRate)}</td>
              </tr>
              <tr className="border-t border-line">
                <th scope="row" className="py-1.5 text-left font-normal">Тест</th>
                <td className="py-1.5 text-right">{int(e.treatment.participants)}</td>
                <td className="py-1.5 text-right">{int(e.treatment.buyers)}</td>
                <td className="py-1.5 text-right">{percent(u.treatmentRate)}</td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card className="p-5 sm:p-6">
          <h3 className="text-sm font-semibold">Что это значит</h3>
          <div className="mt-4 grid grid-cols-2 gap-5">
            <Stat label="Разница долей" value={pp(u.diffPp)} hint={`${percent(u.treatmentRate)} против ${percent(u.controlRate)}`} />
            <Stat label="Относительный прирост" value={`+${percent(u.relativePct)}`} />
            <Stat label="Дополнительные покупатели" value={int(u.extraBuyers)} hint={`${int(e.treatment.buyers)} − ${int(e.control.buyers)} ожидаемых без рекламы`} />
            <Stat
              label="Расход на доп. покупателя"
              value={u.costPerExtraBuyer !== null ? tenge(u.costPerExtraBuyer) : '—'}
              hint={`${tenge(u.totalSpend)} / ${int(u.extraBuyers)}`}
              emphasis
            />
          </div>
          <dl className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm tabular-nums">
            <div className="flex justify-between gap-3"><dt className="text-muted">Рекламный расход</dt><dd>{tenge(e.adSpend)}</dd></div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Скидки: {int(e.treatment.buyers)} × {tenge(e.discountPerBuyer)}</dt>
              <dd>{tenge(u.discountSpend)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-line pt-1.5 font-medium"><dt>Всего</dt><dd>{tenge(u.totalSpend)}</dd></div>
          </dl>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Ограничения примера</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-body">
          <li>Это точечная оценка по одному синтетическому эксперименту. Статистическая значимость здесь не рассчитывается.</li>
          <li>Скидку получали все покупатели тестовой группы, в том числе те, кто купил бы и без рекламы, поэтому расход на дополнительного покупателя выше, чем на обычный выкуп.</li>
          <li>Для реальной оценки нужны случайное разделение аудитории, заранее заданный срок и одинаковые условия в аптеках обеих групп.</li>
          <li>Результат не переносится напрямую на другие товары, города и периоды.</li>
        </ul>
      </Card>
    </div>
  )
}
