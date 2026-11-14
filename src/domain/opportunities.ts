import { int, tenge } from '../lib/format'
import { findInventory } from './metrics'
import { openCampaignFor } from './rules'
import { getCategory, getPharmacy, PRODUCTS } from './seed'
import type { AppState, Campaign, CategoryId } from './types'

/** Below this many available units an ad would risk sending buyers to an empty shelf. */
export const MIN_STOCK_FOR_LAUNCH = 10

export type InterestLevel = 'high' | 'medium' | 'low'

export interface Opportunity {
  id: string
  kind: 'ready' | 'restock'
  pharmacyId: string
  sku: string
  category: CategoryId
  views7d: number
  searches: number
  interest: InterestLevel
  stock: number
  price: number
  slotName: string
  slotAvailable: boolean
  signalUpdatedAt: string
  inventoryUpdatedAt: string
  headline: string
  reasons: string[]
  score: number
  openCampaign: Campaign | undefined
}

export const INTEREST_LABELS: Record<InterestLevel, string> = {
  high: 'Высокий интерес',
  medium: 'Средний интерес',
  low: 'Низкий интерес',
}

function interestLevel(views7d: number): InterestLevel {
  if (views7d >= 1500) return 'high'
  if (views7d >= 500) return 'medium'
  return 'low'
}

/** Every pharmacy × SKU pair with a non-zero interest signal, best first. */
export function buildOpportunities(state: AppState, today: string): Opportunity[] {
  const out: Opportunity[] = []
  for (const signal of state.signals) {
    if (signal.views7d <= 0) continue
    const pharmacy = getPharmacy(signal.pharmacyId)
    for (const product of PRODUCTS.filter((p) => p.category === signal.category)) {
      const item = findInventory(state, pharmacy.id, product.sku)
      if (!item) continue
      const searches = signal.searches[product.sku] ?? 0
      const interest = interestLevel(signal.views7d)
      const slotAvailable = pharmacy.adSlot.available
      const ready = item.stock >= MIN_STOCK_FOR_LAUNCH && slotAvailable
      const categoryLabel = getCategory(signal.category).label
      const reasons = [
        `${int(signal.views7d)} просмотров категории «${categoryLabel}» за 7 дней`,
        `${int(searches)} поисков этого товара за 7 дней`,
        `Доступно ${int(item.stock)} шт. по цене ${tenge(item.price)}`,
        slotAvailable ? `Рекламное место «${pharmacy.adSlot.name}» свободно` : 'Рекламное место сейчас недоступно',
      ]
      const headline = ready
        ? `${pharmacy.city}: интерес к категории есть, товар в наличии`
        : item.stock === 0
          ? `${pharmacy.city}: интерес есть, но товара нет в наличии`
          : `${pharmacy.city}: интерес есть, но товара мало`
      out.push({
        id: `${pharmacy.id}:${product.sku}`,
        kind: ready ? 'ready' : 'restock',
        pharmacyId: pharmacy.id,
        sku: product.sku,
        category: signal.category,
        views7d: signal.views7d,
        searches,
        interest,
        stock: item.stock,
        price: item.price,
        slotName: pharmacy.adSlot.name,
        slotAvailable,
        signalUpdatedAt: signal.updatedAt,
        inventoryUpdatedAt: item.updatedAt,
        headline,
        reasons,
        score: signal.views7d + searches * 5,
        openCampaign: openCampaignFor(state, pharmacy.id, product.sku, today),
      })
    }
  }
  return out.sort((a, b) => b.score - a.score)
}

/** The short list for the main screen: two best launch-ready pairs and the strongest restock case. */
export function featuredOpportunities(all: Opportunity[]): Opportunity[] {
  const ready = all.filter((o) => o.kind === 'ready' && o.interest !== 'low').slice(0, 2)
  const restock = all.filter((o) => o.kind === 'restock' && o.interest !== 'low').slice(0, 1)
  return [...ready, ...restock]
}
