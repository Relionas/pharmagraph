import { PHARMACY_AD_SHARE_PCT } from './seed'
import type { AppState, Campaign, InventoryItem, LedgerEntry, Order } from './types'

/**
 * Split one click between pharmacy and platform.
 * Rule: pharmacy share = 70% of CPC rounded half-up to whole tenge; the platform gets the remainder,
 * so the two parts always add up to the CPC exactly.
 */
export function splitClick(cpc: number): { pharmacyShare: number; platformShare: number } {
  const pharmacyShare = Math.floor((cpc * PHARMACY_AD_SHARE_PCT + 50) / 100)
  return { pharmacyShare, platformShare: cpc - pharmacyShare }
}

export function findInventory(state: AppState, pharmacyId: string, sku: string): InventoryItem | undefined {
  return state.inventory.find((i) => i.pharmacyId === pharmacyId && i.sku === sku)
}

/** Units held by pending orders (reserved, not yet redeemed). */
export function reservedUnits(state: AppState, pharmacyId: string, sku: string): number {
  return state.orders.filter((o) => o.pharmacyId === pharmacyId && o.sku === sku && o.status === 'pending').length
}

export interface BudgetCapacity {
  maxClicks: number
  maxRedemptions: number
  totalLimit: number
  customerPrice: number | null
}

/** Budget capacity, not a sales forecast. Invalid inputs yield zeros. */
export function budgetCapacity(input: {
  adBudget: number | null
  discountBudget: number | null
  cpc: number | null
  discountPerUnit: number | null
  price: number | null
}): BudgetCapacity {
  const pos = (v: number | null) => (v !== null && Number.isFinite(v) && v > 0 ? v : null)
  const ad = pos(input.adBudget)
  const disc = pos(input.discountBudget)
  const cpc = pos(input.cpc)
  const unit = pos(input.discountPerUnit)
  const price = pos(input.price)
  return {
    maxClicks: ad && cpc ? Math.floor(ad / cpc) : 0,
    maxRedemptions: disc && unit ? Math.floor(disc / unit) : 0,
    totalLimit: (ad ?? 0) + (disc ?? 0),
    customerPrice: price !== null && unit !== null ? price - unit : null,
  }
}

export interface CampaignMetrics {
  adSpend: number
  pharmacyAdRevenue: number
  platformRevenue: number
  validClicks: number
  orders: number
  pending: number
  redeemed: number
  cancelled: number
  returned: number
  confirmedDiscounts: number
  reservedDiscounts: number
  /** Actual brand spend = ad spend + confirmed discount compensation. Reserves excluded. */
  brandSpend: number
  adBudgetLeft: number
  discountBudgetAvailable: number
  /** (adSpend + confirmedDiscounts) / redeemed; null when nothing is redeemed. */
  costPerRedemption: number | null
}

function campaignOrders(state: AppState, campaignId: string): Order[] {
  return state.orders.filter((o) => o.campaignId === campaignId)
}

export function campaignMetrics(state: AppState, campaign: Campaign): CampaignMetrics {
  const clicks = state.clicks.filter((c) => c.campaignId === campaign.id)
  const orders = campaignOrders(state, campaign.id)
  const adSpend = clicks.reduce((s, c) => s + c.cost, 0)
  const pharmacyAdRevenue = clicks.reduce((s, c) => s + c.pharmacyShare, 0)
  const platformRevenue = clicks.reduce((s, c) => s + c.platformShare, 0)
  const sumDiscount = (status: Order['status']) =>
    orders.filter((o) => o.status === status).reduce((s, o) => s + o.discount, 0)
  const count = (status: Order['status']) => orders.filter((o) => o.status === status).length

  const confirmedDiscounts = sumDiscount('redeemed')
  const reservedDiscounts = sumDiscount('pending')
  const redeemed = count('redeemed')
  const brandSpend = adSpend + confirmedDiscounts

  return {
    adSpend,
    pharmacyAdRevenue,
    platformRevenue,
    validClicks: clicks.length,
    orders: orders.length,
    pending: count('pending'),
    redeemed,
    cancelled: count('cancelled'),
    returned: count('returned'),
    confirmedDiscounts,
    reservedDiscounts,
    brandSpend,
    adBudgetLeft: campaign.adBudget - adSpend,
    discountBudgetAvailable: campaign.discountBudget - confirmedDiscounts - reservedDiscounts,
    costPerRedemption: redeemed > 0 ? Math.round(brandSpend / redeemed) : null,
  }
}

/** Sum of metrics across campaigns (costPerRedemption recomputed from totals). */
export function sumMetrics(list: CampaignMetrics[]): CampaignMetrics {
  const zero: CampaignMetrics = {
    adSpend: 0, pharmacyAdRevenue: 0, platformRevenue: 0, validClicks: 0, orders: 0, pending: 0, redeemed: 0,
    cancelled: 0, returned: 0, confirmedDiscounts: 0, reservedDiscounts: 0, brandSpend: 0, adBudgetLeft: 0,
    discountBudgetAvailable: 0, costPerRedemption: null,
  }
  const total = list.reduce<CampaignMetrics>((acc, m) => {
    const next = { ...acc }
    for (const key of Object.keys(zero) as (keyof CampaignMetrics)[]) {
      if (key === 'costPerRedemption') continue
      next[key] = (acc[key] as number) + (m[key] as number)
    }
    return next
  }, zero)
  total.costPerRedemption = total.redeemed > 0 ? Math.round(total.brandSpend / total.redeemed) : null
  return total
}

export interface PharmacySettlement {
  adRevenue: number
  confirmedCompensation: number
  reservedDiscounts: number
  /** Total to accrue = ad revenue + confirmed compensation. Reserves excluded. */
  totalAccrued: number
}

export function pharmacySettlement(state: AppState, pharmacyId: string): PharmacySettlement {
  const adRevenue = state.clicks.filter((c) => c.pharmacyId === pharmacyId).reduce((s, c) => s + c.pharmacyShare, 0)
  const campaignOrdersHere = state.orders.filter((o) => o.pharmacyId === pharmacyId && o.campaignId !== null)
  const confirmedCompensation = campaignOrdersHere.filter((o) => o.status === 'redeemed').reduce((s, o) => s + o.discount, 0)
  const reservedDiscounts = campaignOrdersHere.filter((o) => o.status === 'pending').reduce((s, o) => s + o.discount, 0)
  return { adRevenue, confirmedCompensation, reservedDiscounts, totalAccrued: adRevenue + confirmedCompensation }
}

export function platformTotals(state: AppState): { platformRevenue: number; adSpend: number } {
  return {
    platformRevenue: state.clicks.reduce((s, c) => s + c.platformShare, 0),
    adSpend: state.clicks.reduce((s, c) => s + c.cost, 0),
  }
}

/**
 * Derived operations journal. Built from clicks and order histories, so it can never drift
 * from the numbers above.
 */
export function buildLedger(state: AppState, filter: { pharmacyId?: string; campaignId?: string } = {}): LedgerEntry[] {
  const entries: LedgerEntry[] = []
  const match = (pharmacyId: string, campaignId: string) =>
    (!filter.pharmacyId || filter.pharmacyId === pharmacyId) && (!filter.campaignId || filter.campaignId === campaignId)

  for (const c of state.clicks) {
    if (!match(c.pharmacyId, c.campaignId)) continue
    entries.push({
      id: `click-${c.id}`, at: c.at, campaignId: c.campaignId, pharmacyId: c.pharmacyId, orderNumber: null,
      kind: 'ad_click', amount: c.cost, pharmacyAccrual: c.pharmacyShare, platformAmount: c.platformShare, status: 'Начислено',
    })
  }

  for (const o of state.orders) {
    if (!o.campaignId || !match(o.pharmacyId, o.campaignId)) continue
    for (const ev of o.history) {
      const base = { at: ev.at, campaignId: o.campaignId, pharmacyId: o.pharmacyId, orderNumber: o.number, platformAmount: 0 }
      if (ev.status === 'pending') {
        const status = o.status === 'pending' ? 'В резерве' : o.status === 'cancelled' ? 'Резерв освобожден' : 'Переведен в компенсацию'
        entries.push({ ...base, id: `${o.id}-reserve`, kind: 'discount_reserved', amount: o.discount, pharmacyAccrual: 0, status })
      } else if (ev.status === 'cancelled') {
        entries.push({ ...base, id: `${o.id}-release`, kind: 'discount_released', amount: o.discount, pharmacyAccrual: 0, status: 'Проведено' })
      } else if (ev.status === 'redeemed') {
        const status = o.status === 'returned' ? 'Сторнировано' : 'Подтверждено'
        entries.push({ ...base, id: `${o.id}-confirm`, kind: 'discount_confirmed', amount: o.discount, pharmacyAccrual: o.discount, status })
      } else if (ev.status === 'returned') {
        entries.push({ ...base, id: `${o.id}-reverse`, kind: 'discount_reversed', amount: o.discount, pharmacyAccrual: -o.discount, status: 'Проведено' })
      }
    }
  }

  // Newest first. Events of one command share a timestamp, so ties fall back to insertion order
  // (clicks before orders, an order's history in sequence), reversed.
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.at < b.e.at ? 1 : a.e.at > b.e.at ? -1 : b.i - a.i))
    .map(({ e }) => e)
}

export const LEDGER_LABELS: Record<LedgerEntry['kind'], string> = {
  ad_click: 'Рекламный клик',
  discount_reserved: 'Резерв скидки',
  discount_released: 'Освобождение резерва',
  discount_confirmed: 'Компенсация скидки',
  discount_reversed: 'Сторно компенсации',
}
