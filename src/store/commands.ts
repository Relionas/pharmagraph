/**
 * UI intents → domain transitions. Every screen and the demo scenario go through these,
 * so a button in the pharmacy cabinet and the scenario's «Выполнить» run identical logic.
 */
import {
  applyInventoryCsv,
  approveCampaign,
  createCampaign,
  createOrder,
  finishCampaign,
  registerClick,
  rejectCampaign,
  setCampaignPaused,
  startNewSession,
  transitionOrder,
  updateInventoryItem,
} from '../domain/actions'
import type { CsvPreviewRow } from '../domain/csv'
import type { CampaignDraft } from '../domain/rules'
import type { OrderStatus } from '../domain/types'
import { useStore, type BrandTab, type PharmacyTab } from './store'

const run = () => useStore.getState().run

export const commands = {
  createCampaign: (draft: CampaignDraft) =>
    run()('Создание кампании', (s, now, id) => createCampaign(s, draft, now, id)),
  approve: (campaignId: string) =>
    run()('Подтверждение аптеки', (s, now, id) => approveCampaign(s, campaignId, now, id)),
  reject: (campaignId: string) =>
    run()('Отклонение предложения', (s, now, id) => rejectCampaign(s, campaignId, now, id)),
  setPaused: (campaignId: string, paused: boolean) =>
    run()(paused ? 'Пауза' : 'Снятие с паузы', (s, _now, id) => setCampaignPaused(s, campaignId, paused, id)),
  finish: (campaignId: string) =>
    run()('Завершение кампании', (s, _now, id) => finishCampaign(s, campaignId, id)),

  click: (campaignId: string) =>
    run()('Клик по рекламе', (s, now, id) => registerClick(s, campaignId, now, id), { replayable: true }),
  order: (pharmacyId: string, sku: string) =>
    run()('Тестовый заказ', (s, now, id) => createOrder(s, { pharmacyId, sku }, now, id), { replayable: true }),
  transition: (orderId: string, to: OrderStatus) =>
    run()(
      to === 'redeemed' ? 'Подтверждение выкупа' : to === 'cancelled' ? 'Отмена заказа' : 'Возврат',
      (s, now, id) => transitionOrder(s, orderId, to, now, id),
      { replayable: true },
    ),
  newBuyer: () => run()('Новый покупатель', (s, now) => startNewSession(s, now)),

  updateItem: (pharmacyId: string, sku: string, price: number | null, stock: number | null) =>
    run()('Изменение каталога', (s, now) => updateInventoryItem(s, { pharmacyId, sku, price, stock }, now)),
  applyCsv: (pharmacyId: string, rows: CsvPreviewRow[]) =>
    run()('Импорт CSV', (s, now) => applyInventoryCsv(s, pharmacyId, rows, now)),
}

/** Cross-role navigation shared by screens and the scenario panel. */
export const go = {
  brand: (brandTab: BrandTab, extra: { resultsCampaignId?: string | null } = {}) => {
    const { setUi, ui } = useStore.getState()
    setUi({
      role: 'brand',
      brandTab,
      ...extra,
      visited: { ...ui.visited, results: ui.visited.results || brandTab === 'results', uplift: ui.visited.uplift || brandTab === 'uplift' },
    })
  },
  pharmacy: (pharmacyId: string, pharmacyTab: PharmacyTab) => useStore.getState().setUi({ role: 'pharmacy', pharmacyId, pharmacyTab }),
  storefront: (pharmacyId: string) => useStore.getState().setUi({ role: 'storefront', storefrontPharmacyId: pharmacyId }),
  why: (opportunityId: string) => {
    const { setUi, ui } = useStore.getState()
    setUi({ role: 'brand', brandTab: 'opportunities', whyOpportunityId: opportunityId, visited: { ...ui.visited, why: true } })
    window.setTimeout(() => {
      const el = document.getElementById('why-panel')
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      el?.focus({ preventScroll: true })
    }, 60)
  },
  /** Open the campaigns tab and bring one campaign card into view. */
  campaign: (campaignId: string) => {
    go.brand('campaigns')
    window.setTimeout(() => {
      const el = document.getElementById(`campaign-${campaignId}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.focus({ preventScroll: true })
    }, 60)
  },
}
