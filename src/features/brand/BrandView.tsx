import { BRAND } from '../../domain/seed'
import { go } from '../../store/commands'
import { useStore, type BrandTab } from '../../store/store'
import { TabPanel, Tabs } from '../../ui/primitives'
import { Campaigns } from './Campaigns'
import { Opportunities } from './Opportunities'
import { Results } from './Results'
import { Uplift } from './Uplift'

export function BrandView() {
  const tab = useStore((s) => s.ui.brandTab)
  const campaignCount = useStore((s) => s.data.campaigns.length)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs tracking-wide text-muted uppercase">Кабинет бренда</p>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.015em]">{BRAND.name}</h1>
        </div>
        <p className="text-sm text-muted">Уход и гигиена · безрецептурные товары</p>
      </header>
      <div className="border-b border-line">
        <Tabs<BrandTab>
          label="Разделы кабинета бренда"
          idPrefix="brand"
          value={tab}
          onChange={(k) => go.brand(k)}
          items={[
            { key: 'opportunities', label: 'Возможности' },
            {
              key: 'campaigns',
              label: 'Кампании',
              badge: campaignCount > 0 ? <span className="rounded-full bg-wash px-1.5 text-xs text-body tabular-nums">{campaignCount}</span> : undefined,
            },
            { key: 'results', label: 'Результаты' },
            { key: 'uplift', label: 'Пример оценки прироста' },
          ]}
        />
      </div>
      <TabPanel idPrefix="brand" active={tab}>
        {tab === 'opportunities' && <Opportunities />}
        {tab === 'campaigns' && <Campaigns />}
        {tab === 'results' && <Results />}
        {tab === 'uplift' && <Uplift />}
      </TabPanel>
    </div>
  )
}
