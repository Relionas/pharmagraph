import { tenge } from '../lib/format'
import { formatDayKey, isDayKey } from '../lib/time'
import { campaignMetrics, findInventory } from './metrics'
import { getPharmacy } from './seed'
import type { AppState, Campaign, OrderStatus } from './types'

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

export type BlockerCode =
  | 'not_approved'
  | 'rejected'
  | 'finished'
  | 'not_started'
  | 'ended'
  | 'paused'
  | 'no_slot'
  | 'no_inventory'
  | 'no_stock'
  | 'price_changed'
  | 'ad_budget'
  | 'discount_budget'

export interface Blocker {
  code: BlockerCode
  message: string
}

/**
 * Why a campaign cannot run a new placement right now.
 * scope 'placement' — showing the ad card or charging a click (all checks).
 * scope 'order'     — creating a discounted order after a click (the click is already paid,
 *                     so the ad budget is not required).
 * An empty list means the action is allowed.
 */
export function placementBlockers(
  state: AppState,
  campaign: Campaign,
  today: string,
  scope: 'placement' | 'order' = 'placement',
): Blocker[] {
  const out: Blocker[] = []
  if (campaign.approval === 'pending') out.push({ code: 'not_approved', message: 'Аптека еще не подтвердила условия' })
  if (campaign.approval === 'rejected') out.push({ code: 'rejected', message: 'Аптека отклонила предложение' })
  if (campaign.approval === 'finished') out.push({ code: 'finished', message: 'Кампания завершена' })
  if (out.length) return out

  if (today < campaign.startDate) out.push({ code: 'not_started', message: `Кампания начнется ${formatDayKey(campaign.startDate)}` })
  if (today > campaign.endDate) out.push({ code: 'ended', message: `Период кампании закончился ${formatDayKey(campaign.endDate)}` })
  if (campaign.paused) out.push({ code: 'paused', message: 'Кампания на ручной паузе' })

  const pharmacy = getPharmacy(campaign.pharmacyId)
  if (!pharmacy.adSlot.available) out.push({ code: 'no_slot', message: 'Рекламное место в аптеке недоступно' })

  const item = findInventory(state, campaign.pharmacyId, campaign.sku)
  if (!item) {
    out.push({ code: 'no_inventory', message: 'Товара нет в ассортименте аптеки' })
    return out
  }
  if (item.stock <= 0) out.push({ code: 'no_stock', message: 'Доступный остаток товара равен нулю' })
  if (campaign.agreedPrice !== null && item.price !== campaign.agreedPrice) {
    out.push({
      code: 'price_changed',
      message: `Цена изменилась: согласовано ${tenge(campaign.agreedPrice)}, сейчас ${tenge(item.price)}. Нужно повторное подтверждение аптеки`,
    })
  }

  const m = campaignMetrics(state, campaign)
  if (scope === 'placement' && m.adBudgetLeft < campaign.cpc) {
    out.push({
      code: 'ad_budget',
      message: `Рекламного бюджета не хватает на следующий клик: осталось ${tenge(m.adBudgetLeft)}, CPC ${tenge(campaign.cpc)}`,
    })
  }
  if (m.discountBudgetAvailable < campaign.discountPerUnit) {
    out.push({
      code: 'discount_budget',
      message: `Бюджета скидок не хватает на следующую скидку: доступно ${tenge(m.discountBudgetAvailable)} с учетом резерва ${tenge(m.reservedDiscounts)}`,
    })
  }
  return out
}

/** What has to happen for a stopped placement to resume, per blocker that can clear. */
const RESUMES_WHEN: Partial<Record<BlockerCode, string>> = {
  not_started: 'наступит дата начала',
  no_stock: 'аптека пополнит остаток',
  discount_budget: 'отмена или возврат заказа освободит бюджет скидок',
  price_changed: 'аптека подтвердит новую цену',
  paused: 'бренд снимет паузу',
}

export interface ResumeOutlook {
  /** The campaign will never show again: clicks are never reversed and the period never extends. */
  final: boolean
  /** Conditions that bring the placement back, in a stable order. */
  needs: string[]
}

export function resumeOutlook(blockers: Blocker[]): ResumeOutlook {
  const codes = new Set(blockers.map((b) => b.code))
  return {
    final: codes.has('ad_budget') || codes.has('ended'),
    needs: (Object.keys(RESUMES_WHEN) as BlockerCode[]).filter((c) => codes.has(c)).map((c) => RESUMES_WHEN[c] as string),
  }
}

/** "a", "a и b", "a, b и c". */
export const joinRu = (parts: string[]) =>
  parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} и ${parts[parts.length - 1]}`

/** A campaign that still blocks creating another one for the same pharmacy + SKU. */
export function openCampaignFor(state: AppState, pharmacyId: string, sku: string, today: string): Campaign | undefined {
  return state.campaigns.find(
    (c) =>
      c.pharmacyId === pharmacyId &&
      c.sku === sku &&
      (c.approval === 'pending' || c.approval === 'approved') &&
      c.endDate >= today,
  )
}

export interface CampaignDraft {
  name: string
  pharmacyId: string
  sku: string
  startDate: string
  endDate: string
  adBudget: number | null
  discountBudget: number | null
  cpc: number | null
  discountPerUnit: number | null
}

export type DraftErrors = Partial<Record<keyof CampaignDraft, string>>

const isPositiveInt = (v: number | null): v is number => v !== null && Number.isInteger(v) && v > 0

export function validateCampaignDraft(state: AppState, d: CampaignDraft, today?: string): DraftErrors {
  const e: DraftErrors = {}
  if (!d.name.trim()) e.name = 'Введите название кампании'
  else if (d.name.trim().length > 80) e.name = 'Название не длиннее 80 символов'
  if (!d.pharmacyId) e.pharmacyId = 'Выберите аптеку'
  if (!d.sku) e.sku = 'Выберите товар'

  if (!isDayKey(d.startDate)) e.startDate = 'Укажите дату начала'
  else if (today && d.startDate < today) e.startDate = 'Дата начала не может быть в прошлом'
  if (!isDayKey(d.endDate)) e.endDate = 'Укажите дату окончания'
  else if (isDayKey(d.startDate) && d.endDate < d.startDate) e.endDate = 'Дата окончания не может быть раньше начала'

  const money = 'Введите целое положительное число тенге'
  if (!isPositiveInt(d.adBudget)) e.adBudget = money
  if (!isPositiveInt(d.cpc)) e.cpc = money
  if (!isPositiveInt(d.discountBudget)) e.discountBudget = money
  if (!isPositiveInt(d.discountPerUnit)) e.discountPerUnit = money

  if (isPositiveInt(d.adBudget) && isPositiveInt(d.cpc) && d.adBudget < d.cpc) {
    e.adBudget = 'Рекламного бюджета не хватит даже на один клик'
  }
  if (isPositiveInt(d.discountBudget) && isPositiveInt(d.discountPerUnit) && d.discountBudget < d.discountPerUnit) {
    e.discountBudget = 'Бюджета скидок не хватит даже на один выкуп'
  }

  if (d.pharmacyId && d.sku) {
    const item = findInventory(state, d.pharmacyId, d.sku)
    if (!item) e.sku = 'Этого товара нет в ассортименте выбранной аптеки'
    else if (isPositiveInt(d.discountPerUnit) && d.discountPerUnit >= item.price) {
      e.discountPerUnit = `Скидка должна быть меньше цены товара (${tenge(item.price)})`
    }
  }
  return e
}

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['redeemed', 'cancelled'],
  redeemed: ['returned'],
  returned: [],
  cancelled: [],
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to)
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Ожидает выкупа',
  redeemed: 'Выкуплен',
  cancelled: 'Отменен',
  returned: 'Возврат',
}

export type Tone = 'neutral' | 'positive' | 'warning' | 'negative' | 'info'

export interface CampaignStatus {
  label: string
  tone: Tone
  /** True when the ad card is shown and clicks are charged. */
  live: boolean
  blockers: Blocker[]
}

export function campaignStatus(state: AppState, c: Campaign, today: string): CampaignStatus {
  if (c.approval === 'pending') return { label: 'Ожидает подтверждения аптеки', tone: 'info', live: false, blockers: placementBlockers(state, c, today) }
  if (c.approval === 'rejected') return { label: 'Отклонена аптекой', tone: 'negative', live: false, blockers: placementBlockers(state, c, today) }
  if (c.approval === 'finished') return { label: 'Завершена', tone: 'neutral', live: false, blockers: placementBlockers(state, c, today) }
  const blockers = placementBlockers(state, c, today)
  if (blockers.length === 0) return { label: 'Активна', tone: 'positive', live: true, blockers }
  const codes = new Set(blockers.map((b) => b.code))
  if (codes.has('price_changed')) return { label: 'Нужно повторное подтверждение', tone: 'warning', live: false, blockers }
  if (codes.has('ended')) return { label: 'Период завершен', tone: 'neutral', live: false, blockers }
  if (codes.has('not_started')) return { label: 'Запланирована', tone: 'info', live: false, blockers }
  if (codes.has('paused')) return { label: 'На паузе', tone: 'warning', live: false, blockers }
  return { label: 'Показ остановлен', tone: 'negative', live: false, blockers }
}

/** True when the pharmacy has to act on the campaign (new offer or changed price). */
export function needsPharmacyDecision(state: AppState, c: Campaign, today: string): boolean {
  if (c.approval === 'pending') return true
  if (c.approval !== 'approved') return false
  return placementBlockers(state, c, today).some((b) => b.code === 'price_changed')
}

/**
 * Human-readable placement changes between two states, for toasts:
 * a campaign that stopped (with the reason) or resumed automatically.
 * A manual pause is not repeated here: the pause command already announces it.
 */
export function placementChanges(before: AppState, after: AppState, today: string): string[] {
  const out: string[] = []
  for (const c of after.campaigns) {
    const prev = before.campaigns.find((x) => x.id === c.id)
    if (!prev || prev.approval !== 'approved' || c.approval !== 'approved') continue
    const wasLive = placementBlockers(before, prev, today).length === 0
    const nowBlockers = placementBlockers(after, c, today)
    const justPaused = c.paused && !prev.paused
    if (wasLive && nowBlockers.length > 0 && !justPaused) out.push(`Кампания №${c.number} остановлена: ${lowerFirst(nowBlockers[0].message)}`)
    if (!wasLive && nowBlockers.length === 0) out.push(`Кампания №${c.number} снова показывается`)
  }
  return out
}
