/**
 * Domain model for SIMB-AD PharmaGraph demo.
 * All money values are integer tenge (KZT). Timestamps are ISO strings;
 * campaign date ranges use 'YYYY-MM-DD' keys in the Asia/Almaty timezone.
 */

export type City = 'Алматы' | 'Астана'

export interface Brand {
  id: string
  name: string
}

export interface Pharmacy {
  id: string
  name: string
  city: City
  address: string
  /** One ad format in MVP: a promoted card in the catalog. */
  adSlot: { name: string; available: boolean }
}

export type CategoryId = 'oral' | 'skin' | 'sun' | 'lips' | 'hygiene'

export interface Category {
  id: CategoryId
  label: string
}

export interface Product {
  sku: string
  brandId: string
  name: string
  shortName: string
  category: CategoryId
  volume: string
  /** Neutral pack illustration colour. */
  tint: string
}

export interface InventoryItem {
  pharmacyId: string
  sku: string
  /** Current shelf price, integer tenge. */
  price: number
  /** Available units (excludes units reserved by pending orders). */
  stock: number
  updatedAt: string
}

/** Interest signal in the last 7 days. A signal of interest, not guaranteed demand. */
export interface InterestSignal {
  pharmacyId: string
  category: CategoryId
  views7d: number
  /** Searches for specific SKUs within the category, keyed by SKU. */
  searches: Record<string, number>
  updatedAt: string
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'finished'

export interface Campaign {
  id: string
  number: number
  name: string
  brandId: string
  pharmacyId: string
  sku: string
  startDate: string
  endDate: string
  adBudget: number
  discountBudget: number
  cpc: number
  discountPerUnit: number
  approval: ApprovalStatus
  /** Shelf price fixed at the moment the pharmacy confirmed the terms. */
  agreedPrice: number | null
  paused: boolean
  createdAt: string
  decidedAt: string | null
}

export interface DemoSession {
  id: string
  number: number
  startedAt: string
}

export interface AdClick {
  id: string
  campaignId: string
  pharmacyId: string
  sessionId: string
  at: string
  /** CPC charged, integer tenge. */
  cost: number
  pharmacyShare: number
  platformShare: number
}

export type OrderStatus = 'pending' | 'redeemed' | 'returned' | 'cancelled'

export interface OrderEvent {
  status: OrderStatus
  at: string
  eventId: string
}

export interface Order {
  id: string
  number: number
  pharmacyId: string
  sku: string
  sessionId: string
  /** Attributed campaign: last ad click for this pharmacy+SKU in the session. */
  campaignId: string | null
  clickId: string | null
  /** Snapshot at order time, integer tenge. */
  unitPrice: number
  discount: number
  total: number
  status: OrderStatus
  history: OrderEvent[]
  createdAt: string
}

/** Synthetic finished experiment for the uplift explainer. Never mutated by the app. */
export interface SyntheticExperiment {
  control: { participants: number; buyers: number }
  treatment: { participants: number; buyers: number }
  adSpend: number
  discountPerBuyer: number
}

export interface AppState {
  version: number
  seededAt: string
  inventory: InventoryItem[]
  signals: InterestSignal[]
  campaigns: Campaign[]
  sessions: DemoSession[]
  currentSessionId: string
  clicks: AdClick[]
  orders: Order[]
  /** Idempotency keys of every processed event. */
  processedEventIds: string[]
  seq: { campaign: number; order: number; session: number }
  experiment: SyntheticExperiment
}

export type LedgerKind =
  | 'ad_click'
  | 'discount_reserved'
  | 'discount_released'
  | 'discount_confirmed'
  | 'discount_reversed'

export interface LedgerEntry {
  id: string
  at: string
  campaignId: string
  pharmacyId: string
  orderNumber: number | null
  kind: LedgerKind
  /** Amount of the operation itself (always positive). */
  amount: number
  /** Signed effect on pharmacy accrual (0 for reserves and releases). */
  pharmacyAccrual: number
  /** Signed effect on platform revenue. */
  platformAmount: number
  status: string
}

export type Result<T = undefined> =
  | { ok: true; state: AppState; duplicate?: boolean; info?: string; value?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; ref?: string }
