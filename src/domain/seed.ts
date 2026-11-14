import type { AppState, Brand, Category, CategoryId, InventoryItem, InterestSignal, Pharmacy, Product, SyntheticExperiment } from './types'

/** Bump when the persisted shape changes; older data is replaced by a fresh seed. */
export const STATE_VERSION = 1

/** Pharmacy share of ad revenue, percent. */
export const PHARMACY_AD_SHARE_PCT = 70

export const BRAND: Brand = { id: 'democare', name: 'DemoCare' }

export const PHARMACIES: Pharmacy[] = [
  {
    id: 'arna',
    name: 'Аптека «Арна»',
    city: 'Алматы',
    address: 'ул. Демонстрационная, 12',
    adSlot: { name: 'Карточка в каталоге, позиция 1', available: true },
  },
  {
    id: 'shuaq',
    name: 'Аптека «Шуақ»',
    city: 'Астана',
    address: 'пр. Тестовый, 7',
    adSlot: { name: 'Карточка в каталоге, позиция 1', available: true },
  },
]

export const CATEGORIES: Category[] = [
  { id: 'oral', label: 'Уход за полостью рта' },
  { id: 'skin', label: 'Уход за кожей рук' },
  { id: 'sun', label: 'Солнцезащитные средства' },
  { id: 'lips', label: 'Уход за губами' },
  { id: 'hygiene', label: 'Гигиена' },
]

export const PRODUCTS: Product[] = [
  { sku: 'DC-ORAL-250', brandId: 'democare', name: 'DemoCare — уход за полостью рта', shortName: 'Ополаскиватель', category: 'oral', volume: '250 мл', tint: '#3ba6f1' },
  { sku: 'DC-HAND-075', brandId: 'democare', name: 'DemoCare — крем для рук', shortName: 'Крем для рук', category: 'skin', volume: '75 мл', tint: '#a8a29e' },
  { sku: 'DC-SUN-050', brandId: 'democare', name: 'DemoCare — солнцезащитный флюид SPF 50', shortName: 'Флюид SPF 50', category: 'sun', volume: '50 мл', tint: '#e0b04a' },
  { sku: 'DC-LIP-004', brandId: 'democare', name: 'DemoCare — бальзам для губ', shortName: 'Бальзам для губ', category: 'lips', volume: '4 г', tint: '#d98c8c' },
  { sku: 'DC-WIPE-020', brandId: 'democare', name: 'DemoCare — гигиенические салфетки', shortName: 'Салфетки', category: 'hygiene', volume: '20 шт.', tint: '#7fb59a' },
]

export const SYNTHETIC_EXPERIMENT: SyntheticExperiment = {
  control: { participants: 10_000, buyers: 500 },
  treatment: { participants: 10_000, buyers: 650 },
  adSpend: 200_000,
  discountPerBuyer: 500,
}

export function getPharmacy(id: string): Pharmacy {
  const p = PHARMACIES.find((x) => x.id === id)
  if (!p) throw new Error(`Unknown pharmacy ${id}`)
  return p
}

export function getProduct(sku: string): Product {
  const p = PRODUCTS.find((x) => x.sku === sku)
  if (!p) throw new Error(`Unknown SKU ${sku}`)
  return p
}

export function findProduct(sku: string): Product | undefined {
  return PRODUCTS.find((x) => x.sku === sku)
}

export function getCategory(id: CategoryId): Category {
  return CATEGORIES.find((c) => c.id === id) ?? { id, label: id }
}

function minutesAgo(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString()
}

/** The initial demo state: catalog, stock and interest signals, no campaign activity. */
export function createSeed(now: Date = new Date()): AppState {
  const inv = (pharmacyId: string, sku: string, price: number, stock: number, ago: number): InventoryItem => ({
    pharmacyId,
    sku,
    price,
    stock,
    updatedAt: minutesAgo(now, ago),
  })

  const inventory: InventoryItem[] = [
    inv('arna', 'DC-ORAL-250', 4000, 120, 14),
    inv('arna', 'DC-HAND-075', 2800, 64, 14),
    inv('arna', 'DC-SUN-050', 6500, 18, 14),
    inv('arna', 'DC-LIP-004', 1500, 45, 14),
    inv('arna', 'DC-WIPE-020', 900, 300, 14),
    inv('shuaq', 'DC-ORAL-250', 4100, 38, 32),
    inv('shuaq', 'DC-HAND-075', 2900, 0, 32),
    inv('shuaq', 'DC-SUN-050', 6400, 22, 32),
    inv('shuaq', 'DC-LIP-004', 1450, 80, 32),
    inv('shuaq', 'DC-WIPE-020', 950, 150, 32),
  ]

  const sig = (pharmacyId: string, category: CategoryId, views7d: number, searches: Record<string, number>, ago: number): InterestSignal => ({
    pharmacyId,
    category,
    views7d,
    searches,
    updatedAt: minutesAgo(now, ago),
  })

  const signals: InterestSignal[] = [
    sig('arna', 'oral', 3000, { 'DC-ORAL-250': 140 }, 20),
    sig('arna', 'skin', 820, { 'DC-HAND-075': 31 }, 20),
    sig('arna', 'sun', 410, { 'DC-SUN-050': 12 }, 20),
    sig('arna', 'lips', 560, { 'DC-LIP-004': 18 }, 20),
    sig('arna', 'hygiene', 0, {}, 20),
    sig('shuaq', 'oral', 640, { 'DC-ORAL-250': 22 }, 45),
    sig('shuaq', 'skin', 2400, { 'DC-HAND-075': 210 }, 45),
    sig('shuaq', 'sun', 1800, { 'DC-SUN-050': 64 }, 45),
    sig('shuaq', 'lips', 300, { 'DC-LIP-004': 9 }, 45),
    sig('shuaq', 'hygiene', 150, {}, 45),
  ]

  return {
    version: STATE_VERSION,
    seededAt: now.toISOString(),
    inventory,
    signals,
    campaigns: [],
    sessions: [{ id: 'session-1', number: 1, startedAt: now.toISOString() }],
    currentSessionId: 'session-1',
    clicks: [],
    orders: [],
    processedEventIds: [],
    seq: { campaign: 0, order: 0, session: 1 },
    experiment: { ...SYNTHETIC_EXPERIMENT, control: { ...SYNTHETIC_EXPERIMENT.control }, treatment: { ...SYNTHETIC_EXPERIMENT.treatment } },
  }
}
