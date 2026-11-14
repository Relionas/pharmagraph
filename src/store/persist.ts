import { CATEGORIES, createSeed, PHARMACIES, PRODUCTS, STATE_VERSION } from '../domain/seed'
import type { AppState } from '../domain/types'
import { isDayKey } from '../lib/time'

export const STORAGE_KEY = 'simbad-pharmagraph'
export const UI_STORAGE_KEY = 'simbad-pharmagraph:ui'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface LoadResult {
  state: AppState
  /** Shown once to the user when saved data could not be used. */
  notice: string | null
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const isArrOf = (v: unknown, check: (x: Obj) => boolean) => Array.isArray(v) && v.every((x) => isObj(x) && check(x))

const isPos = (v: unknown): v is number => isInt(v) && v > 0
const isNonNeg = (v: unknown): v is number => isInt(v) && v >= 0
const isNullableStr = (v: unknown) => v === null || isStr(v)

const ORDER_STATUSES: readonly unknown[] = ['pending', 'redeemed', 'returned', 'cancelled']
const APPROVALS: readonly unknown[] = ['pending', 'approved', 'rejected', 'finished']
const PHARMACY_IDS: readonly unknown[] = PHARMACIES.map((p) => p.id)
const SKUS: readonly unknown[] = PRODUCTS.map((p) => p.sku)
const CATEGORY_IDS: readonly unknown[] = CATEGORIES.map((c) => c.id)

/**
 * Shape, reference and money-invariant check, so a hand-edited or truncated payload cannot
 * crash the UI: screens look products and pharmacies up by id and would throw on an unknown one.
 */
export function isAppState(v: unknown): v is AppState {
  if (!isObj(v)) return false
  if (!isInt(v.version) || !isStr(v.seededAt) || !isStr(v.currentSessionId)) return false
  if (!isObj(v.seq) || !isNonNeg(v.seq.campaign) || !isNonNeg(v.seq.order) || !isNonNeg(v.seq.session)) return false
  if (!isObj(v.experiment) || !isObj(v.experiment.control) || !isObj(v.experiment.treatment)) return false
  if (!Array.isArray(v.processedEventIds) || !v.processedEventIds.every(isStr)) return false

  const shapeOk =
    isArrOf(v.inventory, (i) =>
      PHARMACY_IDS.includes(i.pharmacyId) && SKUS.includes(i.sku) && isPos(i.price) && isNonNeg(i.stock) && isStr(i.updatedAt)) &&
    isArrOf(v.signals, (s) =>
      PHARMACY_IDS.includes(s.pharmacyId) && CATEGORY_IDS.includes(s.category) && isNonNeg(s.views7d) && isObj(s.searches)) &&
    isArrOf(v.campaigns, (c) =>
      isStr(c.id) && isInt(c.number) && isStr(c.name) && PHARMACY_IDS.includes(c.pharmacyId) && SKUS.includes(c.sku) &&
      isStr(c.startDate) && isDayKey(c.startDate) && isStr(c.endDate) && isDayKey(c.endDate) &&
      isPos(c.adBudget) && isPos(c.discountBudget) && isPos(c.cpc) && isPos(c.discountPerUnit) &&
      APPROVALS.includes(c.approval) && typeof c.paused === 'boolean' && (c.agreedPrice === null || isPos(c.agreedPrice))) &&
    isArrOf(v.sessions, (s) => isStr(s.id) && isInt(s.number)) &&
    isArrOf(v.clicks, (k) =>
      isStr(k.id) && isStr(k.campaignId) && PHARMACY_IDS.includes(k.pharmacyId) && isStr(k.sessionId) && isStr(k.at) &&
      isNonNeg(k.cost) && isNonNeg(k.pharmacyShare) && isNonNeg(k.platformShare)) &&
    isArrOf(v.orders, (o) =>
      isStr(o.id) && isInt(o.number) && PHARMACY_IDS.includes(o.pharmacyId) && SKUS.includes(o.sku) && isStr(o.sessionId) &&
      isNullableStr(o.campaignId) && isNullableStr(o.clickId) &&
      isPos(o.unitPrice) && isNonNeg(o.discount) && isNonNeg(o.total) && ORDER_STATUSES.includes(o.status) && isStr(o.createdAt) &&
      isArrOf(o.history, (h) => ORDER_STATUSES.includes(h.status) && isStr(h.at) && isStr(h.eventId)))
  if (!shapeOk) return false

  // Every click and attributed order points at a campaign that exists.
  const s = v as unknown as AppState
  const campaignIds = new Set(s.campaigns.map((c) => c.id))
  return s.clicks.every((k) => campaignIds.has(k.campaignId)) && s.orders.every((o) => o.campaignId === null || campaignIds.has(o.campaignId))
}

export function loadState(storage: StorageLike | null, now: Date): LoadResult {
  const fresh = () => createSeed(now)
  if (!storage) return { state: fresh(), notice: null }
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return { state: fresh(), notice: 'Хранилище браузера недоступно — изменения не сохранятся после перезагрузки' }
  }
  if (raw === null) return { state: fresh(), notice: null }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isObj(parsed) && isInt(parsed.version) && parsed.version !== STATE_VERSION) {
      return { state: fresh(), notice: 'Сохраненные данные от другой версии прототипа — загружено исходное демо' }
    }
    if (!isAppState(parsed)) throw new Error('shape')
    return { state: parsed, notice: null }
  } catch {
    return { state: fresh(), notice: 'Сохраненные данные повреждены — загружено исходное демо' }
  }
}

export function saveState(storage: StorageLike | null, state: AppState): boolean {
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function browserStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
  } catch {
    return null
  }
}
