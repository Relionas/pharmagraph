import { MapPin } from 'lucide-react'
import { needsPharmacyDecision } from '../../domain/rules'
import { getPharmacy, PHARMACIES } from '../../domain/seed'
import { today, useStore, type PharmacyTab } from '../../store/store'
import { cx, TabPanel, Tabs } from '../../ui/primitives'
import { Catalog } from './Catalog'
import { Offers } from './Offers'
import { Settlements } from './Settlements'

export function PharmacyView() {
  const pharmacyId = useStore((s) => s.ui.pharmacyId)
  const tab = useStore((s) => s.ui.pharmacyTab)
  const data = useStore((s) => s.data)
  const setUi = useStore((s) => s.setUi)
  const pharmacy = getPharmacy(pharmacyId)
  const t = today()
  const pendingFor = (id: string) => data.campaigns.filter((c) => c.pharmacyId === id && needsPharmacyDecision(data, c, t)).length
  const pending = pendingFor(pharmacyId)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs tracking-wide text-muted uppercase">Кабинет аптеки</p>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.015em]">{pharmacy.name}</h1>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
            <MapPin className="size-3.5" aria-hidden /> {pharmacy.city}, {pharmacy.address}
          </p>
        </div>
        <div role="group" aria-label="Аптека" className="flex rounded-full border border-line bg-surface p-0.5">
          {PHARMACIES.map((p) => {
            const n = pendingFor(p.id)
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={p.id === pharmacyId}
                onClick={() => setUi({ pharmacyId: p.id })}
                className={cx(
                  'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors',
                  p.id === pharmacyId ? 'bg-soot font-medium text-white' : 'text-body hover:bg-wash hover:text-ink',
                )}
              >
                {p.city}
                {n > 0 && (
                  <span className="rounded-full bg-signal px-1.5 text-xs font-medium text-ink tabular-nums" aria-label={`${n} требует решения`}>
                    {n}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </header>

      <div className="border-b border-line">
        <Tabs<PharmacyTab>
          label="Разделы кабинета аптеки"
          idPrefix="pharmacy"
          value={tab}
          onChange={(k) => setUi({ pharmacyTab: k })}
          items={[
            {
              key: 'offers',
              label: 'Предложения',
              badge: pending > 0 ? <span className="rounded-full bg-signal px-1.5 text-xs font-medium text-ink tabular-nums">{pending}</span> : undefined,
            },
            { key: 'settlements', label: 'Расчеты' },
            { key: 'catalog', label: 'Ассортимент' },
          ]}
        />
      </div>

      <TabPanel idPrefix="pharmacy" active={tab}>
        {tab === 'offers' && <Offers pharmacyId={pharmacyId} />}
        {tab === 'settlements' && <Settlements pharmacyId={pharmacyId} />}
        {tab === 'catalog' && <Catalog pharmacyId={pharmacyId} />}
      </TabPanel>
    </div>
  )
}
