/**
 * Pure state transitions. Every function takes the current state and returns a new one
 * (never mutates). Events carry an id; an id that was already processed is a no-op, so
 * a replayed click, order or status change can never be charged twice.
 */
import { tenge } from '../lib/format'
import { dayKey } from '../lib/time'
import type { CsvPreviewRow } from './csv'
import { findInventory, splitClick } from './metrics'
import {
  canTransition,
  needsPharmacyDecision,
  openCampaignFor,
  ORDER_STATUS_LABELS,
  placementBlockers,
  validateCampaignDraft,
  type CampaignDraft,
} from './rules'
import { BRAND, getProduct } from './seed'
import type { AdClick, AppState, Campaign, DemoSession, InventoryItem, Order, OrderStatus, Result } from './types'

export const DUPLICATE_INFO = 'Событие с этим идентификатором уже обработано — повтор не изменил данные'

/** Run `apply` once per event id. Failed events are not recorded, so they can be retried. */
function once<T>(state: AppState, eventId: string, apply: () => Result<T>): Result<T> {
  if (state.processedEventIds.includes(eventId)) return { ok: true, state, duplicate: true, info: DUPLICATE_INFO }
  const r = apply()
  if (!r.ok) return r
  return { ...r, state: { ...r.state, processedEventIds: [...r.state.processedEventIds, eventId] } }
}

const fail = (error: string, extra: { fieldErrors?: Record<string, string>; ref?: string } = {}) =>
  ({ ok: false, error, ...extra }) as const

function replaceCampaign(state: AppState, next: Campaign): AppState {
  return { ...state, campaigns: state.campaigns.map((c) => (c.id === next.id ? next : c)) }
}

function adjustStock(state: AppState, pharmacyId: string, sku: string, delta: number, now: Date): AppState {
  return {
    ...state,
    inventory: state.inventory.map((i) =>
      i.pharmacyId === pharmacyId && i.sku === sku ? { ...i, stock: i.stock + delta, updatedAt: now.toISOString() } : i,
    ),
  }
}

// ── Campaigns ───────────────────────────────────────────────────────────────

export function createCampaign(state: AppState, draft: CampaignDraft, now: Date, eventId: string): Result<Campaign> {
  return once(state, eventId, () => {
    const today = dayKey(now)
    const errors = validateCampaignDraft(state, draft, today)
    if (Object.keys(errors).length > 0) {
      return fail('Проверьте выделенные поля', { fieldErrors: errors as Record<string, string> })
    }
    const existing = openCampaignFor(state, draft.pharmacyId, draft.sku, today)
    if (existing) {
      return fail(`Для этой аптеки и товара уже есть незавершенная кампания №${existing.number}`, { ref: existing.id })
    }
    const number = state.seq.campaign + 1
    const campaign: Campaign = {
      id: `cmp-${number}`,
      number,
      name: draft.name.trim(),
      brandId: BRAND.id,
      pharmacyId: draft.pharmacyId,
      sku: draft.sku,
      startDate: draft.startDate,
      endDate: draft.endDate,
      adBudget: draft.adBudget as number,
      discountBudget: draft.discountBudget as number,
      cpc: draft.cpc as number,
      discountPerUnit: draft.discountPerUnit as number,
      approval: 'pending',
      agreedPrice: null,
      paused: false,
      createdAt: now.toISOString(),
      decidedAt: null,
    }
    return {
      ok: true,
      state: { ...state, campaigns: [...state.campaigns, campaign], seq: { ...state.seq, campaign: number } },
      value: campaign,
      info: `Кампания №${number} отправлена аптеке на подтверждение`,
    }
  })
}

/**
 * Pharmacy confirms the offer — or re-confirms after a price change. The current shelf
 * price becomes the agreed price; orders placed earlier keep their own snapshot.
 */
export function approveCampaign(state: AppState, campaignId: string, now: Date, eventId: string): Result<Campaign> {
  return once(state, eventId, () => {
    const c = state.campaigns.find((x) => x.id === campaignId)
    if (!c) return fail('Кампания не найдена')
    if (!needsPharmacyDecision(state, c, dayKey(now))) return fail('Кампания не ожидает решения аптеки')
    const item = findInventory(state, c.pharmacyId, c.sku)
    if (!item) return fail('Товара нет в ассортименте аптеки — подтвердить нельзя')
    if (c.discountPerUnit >= item.price) {
      return fail(`Скидка ${tenge(c.discountPerUnit)} не меньше текущей цены ${tenge(item.price)} — подтвердить нельзя`)
    }
    const reapproval = c.approval === 'approved'
    const next: Campaign = { ...c, approval: 'approved', agreedPrice: item.price, decidedAt: now.toISOString() }
    return {
      ok: true,
      state: replaceCampaign(state, next),
      value: next,
      info: reapproval
        ? `Новая цена ${tenge(item.price)} согласована для кампании №${c.number}`
        : `Участие подтверждено. Согласованная цена — ${tenge(item.price)}`,
    }
  })
}

export function rejectCampaign(state: AppState, campaignId: string, now: Date, eventId: string): Result<Campaign> {
  return once(state, eventId, () => {
    const c = state.campaigns.find((x) => x.id === campaignId)
    if (!c) return fail('Кампания не найдена')
    if (!needsPharmacyDecision(state, c, dayKey(now))) return fail('Кампания не ожидает решения аптеки')
    const next: Campaign = { ...c, approval: 'rejected', decidedAt: now.toISOString() }
    return { ok: true, state: replaceCampaign(state, next), value: next, info: `Предложение по кампании №${c.number} отклонено` }
  })
}

/** Manual pause. Never lifted automatically — only by this call with paused=false. */
export function setCampaignPaused(state: AppState, campaignId: string, paused: boolean, eventId: string): Result<Campaign> {
  return once(state, eventId, () => {
    const c = state.campaigns.find((x) => x.id === campaignId)
    if (!c) return fail('Кампания не найдена')
    if (c.approval !== 'approved') return fail('Пауза доступна только для подтвержденной кампании')
    if (c.paused === paused) return fail(paused ? 'Кампания уже на паузе' : 'Кампания не на паузе')
    const next: Campaign = { ...c, paused }
    return {
      ok: true,
      state: replaceCampaign(state, next),
      value: next,
      info: paused ? `Кампания №${c.number} поставлена на паузу` : `Кампания №${c.number} снята с паузы`,
    }
  })
}

/** Brand ends the campaign early. Pending orders can still be redeemed or cancelled. */
export function finishCampaign(state: AppState, campaignId: string, eventId: string): Result<Campaign> {
  return once(state, eventId, () => {
    const c = state.campaigns.find((x) => x.id === campaignId)
    if (!c) return fail('Кампания не найдена')
    if (c.approval !== 'pending' && c.approval !== 'approved') return fail('Кампания уже закрыта')
    const next: Campaign = { ...c, approval: 'finished' }
    return { ok: true, state: replaceCampaign(state, next), value: next, info: `Кампания №${c.number} завершена` }
  })
}

// ── Storefront ──────────────────────────────────────────────────────────────

/**
 * Valid ad click: charged once per campaign per buyer session. A repeat click in the same
 * session succeeds for the buyer but costs the brand nothing.
 */
export function registerClick(state: AppState, campaignId: string, now: Date, eventId: string): Result<AdClick> {
  return once(state, eventId, () => {
    const c = state.campaigns.find((x) => x.id === campaignId)
    if (!c) return fail('Кампания не найдена')
    const sessionId = state.currentSessionId
    const existing = state.clicks.find((k) => k.campaignId === c.id && k.sessionId === sessionId)
    if (existing) {
      return { ok: true, state, duplicate: true, value: existing, info: 'Повторный клик этого покупателя не тарифицируется' }
    }
    const blockers = placementBlockers(state, c, dayKey(now), 'placement')
    if (blockers.length > 0) return fail(`Показ остановлен: ${blockers[0].message}`)
    const { pharmacyShare, platformShare } = splitClick(c.cpc)
    const click: AdClick = {
      id: `clk-${state.clicks.length + 1}`,
      campaignId: c.id,
      pharmacyId: c.pharmacyId,
      sessionId,
      at: now.toISOString(),
      cost: c.cpc,
      pharmacyShare,
      platformShare,
    }
    return { ok: true, state: { ...state, clicks: [...state.clicks, click] }, value: click, info: `Клик засчитан: ${tenge(c.cpc)}` }
  })
}

export interface OrderQuote {
  available: boolean
  /** Why the order cannot be placed at all. */
  unavailableReason: string | null
  unitPrice: number
  discount: number
  total: number
  campaignId: string | null
  clickId: string | null
  /** Why a discount the buyer might expect does not apply. */
  noDiscountReason: string | null
}

/**
 * What an order would cost right now in the current buyer session.
 * Attribution: the last ad click on this SKU in this pharmacy within the session.
 * One discounted order per click; a cancelled order frees the click again.
 */
export function quoteOrder(state: AppState, pharmacyId: string, sku: string, today: string): OrderQuote {
  const item = findInventory(state, pharmacyId, sku)
  const base: OrderQuote = {
    available: false, unavailableReason: null, unitPrice: item?.price ?? 0, discount: 0, total: item?.price ?? 0,
    campaignId: null, clickId: null, noDiscountReason: null,
  }
  if (!item) return { ...base, unavailableReason: 'Товара нет в ассортименте этой аптеки' }
  if (item.stock <= 0) return { ...base, unavailableReason: 'Нет в наличии: доступный остаток 0 шт.' }

  const lastClick = [...state.clicks]
    .reverse()
    .find((k) => {
      if (k.sessionId !== state.currentSessionId || k.pharmacyId !== pharmacyId) return false
      return state.campaigns.find((c) => c.id === k.campaignId)?.sku === sku
    })
  if (!lastClick) return { ...base, available: true }

  const used = state.orders.some((o) => o.clickId === lastClick.id && o.status !== 'cancelled')
  if (used) {
    return { ...base, available: true, noDiscountReason: 'Скидка по этому рекламному клику уже использована в текущей сессии' }
  }
  const campaign = state.campaigns.find((c) => c.id === lastClick.campaignId)
  if (!campaign) return { ...base, available: true }
  const blockers = placementBlockers(state, campaign, today, 'order')
  if (blockers.length > 0) return { ...base, available: true, noDiscountReason: `Скидка недоступна: ${blockers[0].message}` }

  return {
    ...base,
    available: true,
    discount: campaign.discountPerUnit,
    total: item.price - campaign.discountPerUnit,
    campaignId: campaign.id,
    clickId: lastClick.id,
  }
}

/**
 * Test order: one SKU, one unit. Re-checks stock and discount budget, reserves one unit and
 * (when attributed) one discount, and snapshots price and discount. No compensation yet.
 */
export function createOrder(
  state: AppState,
  input: { pharmacyId: string; sku: string },
  now: Date,
  eventId: string,
): Result<Order> {
  return once(state, eventId, () => {
    const quote = quoteOrder(state, input.pharmacyId, input.sku, dayKey(now))
    if (!quote.available) return fail(quote.unavailableReason ?? 'Заказ недоступен')
    const number = state.seq.order + 1
    const order: Order = {
      id: `ord-${number}`,
      number,
      pharmacyId: input.pharmacyId,
      sku: input.sku,
      sessionId: state.currentSessionId,
      campaignId: quote.campaignId,
      clickId: quote.clickId,
      unitPrice: quote.unitPrice,
      discount: quote.discount,
      total: quote.total,
      status: 'pending',
      history: [{ status: 'pending', at: now.toISOString(), eventId }],
      createdAt: now.toISOString(),
    }
    const withOrder: AppState = { ...state, orders: [...state.orders, order], seq: { ...state.seq, order: number } }
    const info = quote.discount > 0
      ? `Заказ №${number} создан. Резерв: 1 шт. и скидка ${tenge(quote.discount)}`
      : `Заказ №${number} создан без скидки бренда`
    return { ok: true, state: adjustStock(withOrder, input.pharmacyId, input.sku, -1, now), value: order, info }
  })
}

/**
 * pending → redeemed: reserve becomes confirmed compensation (stock already left on reserve).
 * pending → cancelled: reserve and unit are released.
 * redeemed → returned: sale and compensation reversed, unit back on stock, ad spend stays.
 * Redemption of an existing order is never blocked by campaign placement rules.
 */
export function transitionOrder(state: AppState, orderId: string, to: OrderStatus, now: Date, eventId: string): Result<Order> {
  return once(state, eventId, () => {
    const o = state.orders.find((x) => x.id === orderId)
    if (!o) return fail('Заказ не найден')
    if (!canTransition(o.status, to)) {
      return fail(`Нельзя перевести заказ №${o.number} из статуса «${ORDER_STATUS_LABELS[o.status]}» в «${ORDER_STATUS_LABELS[to]}»`)
    }
    const next: Order = { ...o, status: to, history: [...o.history, { status: to, at: now.toISOString(), eventId }] }
    let s: AppState = { ...state, orders: state.orders.map((x) => (x.id === o.id ? next : x)) }
    if (to === 'cancelled' || to === 'returned') s = adjustStock(s, o.pharmacyId, o.sku, +1, now)
    const product = getProduct(o.sku).shortName
    const info =
      to === 'redeemed'
        ? o.discount > 0 ? `Выкуп подтвержден. Компенсация аптеке: ${tenge(o.discount)}` : `Выкуп заказа №${o.number} подтвержден`
        : to === 'cancelled'
          ? `Заказ №${o.number} отменен. Резерв освобожден, ${product} — 1 шт. вернулась в остаток`
          : `Возврат по заказу №${o.number} проведен. Компенсация сторнирована, рекламный расход сохранен`
    return { ok: true, state: s, value: next, info }
  })
}

export function startNewSession(state: AppState, now: Date): Result<DemoSession> {
  const number = state.seq.session + 1
  const session: DemoSession = { id: `session-${number}`, number, startedAt: now.toISOString() }
  return {
    ok: true,
    state: { ...state, sessions: [...state.sessions, session], currentSessionId: session.id, seq: { ...state.seq, session: number } },
    value: session,
    info: `Новый покупатель: сессия №${number}`,
  }
}

// ── Pharmacy catalog ────────────────────────────────────────────────────────

export const MAX_PRICE = 10_000_000
export const MAX_STOCK = 1_000_000

export function validateInventoryValues(price: number | null, stock: number | null): Record<string, string> {
  const e: Record<string, string> = {}
  if (price === null || !Number.isInteger(price) || price <= 0) e.price = 'Цена — целое положительное число тенге'
  else if (price > MAX_PRICE) e.price = `Цена не больше ${tenge(MAX_PRICE)}`
  if (stock === null || !Number.isInteger(stock) || stock < 0) e.stock = 'Остаток — целое число не меньше нуля'
  else if (stock > MAX_STOCK) e.stock = 'Слишком большой остаток'
  return e
}

/** Manual catalog edit. `stock` is available units; reserved units of pending orders are separate. */
export function updateInventoryItem(
  state: AppState,
  input: { pharmacyId: string; sku: string; price: number | null; stock: number | null },
  now: Date,
): Result<InventoryItem> {
  const item = findInventory(state, input.pharmacyId, input.sku)
  if (!item) return fail('Позиция не найдена')
  const errors = validateInventoryValues(input.price, input.stock)
  if (Object.keys(errors).length > 0) return fail('Проверьте значения', { fieldErrors: errors })
  const next: InventoryItem = { ...item, price: input.price as number, stock: input.stock as number, updatedAt: now.toISOString() }
  return {
    ok: true,
    state: { ...state, inventory: state.inventory.map((i) => (i === item ? next : i)) },
    value: next,
    info: `${getProduct(item.sku).shortName}: сохранено`,
  }
}

/** Applies a CSV preview. Callers must pass only a fully valid file (see parseInventoryCsv). */
export function applyInventoryCsv(state: AppState, pharmacyId: string, rows: CsvPreviewRow[], now: Date): Result<number> {
  if (rows.length === 0) return fail('В файле нет строк для применения')
  if (rows.some((r) => r.errors.length > 0 || r.price === null || r.stock === null)) {
    return fail('Файл содержит ошибки — исправьте их и загрузите снова')
  }
  const at = now.toISOString()
  const bySku = new Map(rows.map((r) => [r.sku, r]))
  const inventory = state.inventory.map((i) => {
    const r = i.pharmacyId === pharmacyId ? bySku.get(i.sku) : undefined
    return r ? { ...i, price: r.price as number, stock: r.stock as number, updatedAt: at } : i
  })
  return { ok: true, state: { ...state, inventory }, value: rows.length, info: `Каталог обновлен из CSV: ${rows.length} поз.` }
}
