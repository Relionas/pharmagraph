import { describe, expect, it } from 'vitest'
import { isAppState, loadState, saveState, STORAGE_KEY, type StorageLike } from '../store/persist'
import {
  approveCampaign,
  applyInventoryCsv,
  createCampaign,
  createOrder,
  quoteOrder,
  registerClick,
  rejectCampaign,
  setCampaignPaused,
  startNewSession,
  transitionOrder,
  updateInventoryItem,
} from './actions'
import { parseInventoryCsv, sampleCsv } from './csv'
import { budgetCapacity, buildLedger, campaignMetrics, findInventory, pharmacySettlement, splitClick } from './metrics'
import { buildOpportunities, featuredOpportunities } from './opportunities'
import { joinRu, placementBlockers, placementChanges, resumeOutlook, type Blocker, type CampaignDraft } from './rules'
import { createSeed, PRODUCTS } from './seed'
import type { AppState, Result } from './types'
import { computeUplift } from './uplift'

const NOW = new Date('2026-11-14T06:00:00Z') // 11:00 in Asia/Almaty
const TODAY = '2026-11-14'
const ORAL = 'DC-ORAL-250'

let seq = 0
const ev = () => `ev-${++seq}`

function ok<T>(r: Result<T>): { state: AppState; value: T; info?: string; duplicate?: boolean } {
  if (!r.ok) throw new Error(`Expected ok, got: ${r.error}`)
  return { state: r.state, value: r.value as T, info: r.info, duplicate: r.duplicate }
}

function err<T>(r: Result<T>): string {
  if (r.ok) throw new Error('Expected failure')
  return r.error
}

const draft = (over: Partial<CampaignDraft> = {}): CampaignDraft => ({
  name: 'Ополаскиватель — Алматы',
  pharmacyId: 'arna',
  sku: ORAL,
  startDate: TODAY,
  endDate: '2026-11-27',
  adBudget: 100_000,
  discountBudget: 50_000,
  cpc: 100,
  discountPerUnit: 500,
  ...over,
})

/** Seed → create campaign → pharmacy approves. */
function launched(over: Partial<CampaignDraft> = {}) {
  const created = ok(createCampaign(createSeed(NOW), draft(over), NOW, ev()))
  const approved = ok(approveCampaign(created.state, created.value.id, NOW, ev()))
  return { state: approved.state, id: created.value.id }
}

const campaign = (s: AppState, id: string) => s.campaigns.find((c) => c.id === id)!
const metrics = (s: AppState, id: string) => campaignMetrics(s, campaign(s, id))
const stock = (s: AppState, pharmacyId = 'arna', sku = ORAL) => findInventory(s, pharmacyId, sku)!.stock

/** Click the ad and place an order in the current session. */
function clickAndOrder(s: AppState, id: string) {
  const clicked = ok(registerClick(s, id, NOW, ev()))
  const ordered = ok(createOrder(clicked.state, { pharmacyId: 'arna', sku: ORAL }, NOW, ev()))
  return { state: ordered.state, orderId: ordered.value.id }
}

describe('click revenue split', () => {
  it('splits CPC 70/30 in whole tenge', () => {
    expect(splitClick(100)).toEqual({ pharmacyShare: 70, platformShare: 30 })
    expect(splitClick(99)).toEqual({ pharmacyShare: 69, platformShare: 30 })
    expect(splitClick(1)).toEqual({ pharmacyShare: 1, platformShare: 0 })
  })

  it('never loses or creates a tenge', () => {
    for (let cpc = 1; cpc <= 2_000; cpc++) {
      const { pharmacyShare, platformShare } = splitClick(cpc)
      expect(pharmacyShare + platformShare).toBe(cpc)
      expect(Number.isInteger(pharmacyShare)).toBe(true)
    }
  })
})

describe('budget capacity', () => {
  it('computes limits from the form, not a forecast', () => {
    expect(budgetCapacity({ adBudget: 100_000, discountBudget: 50_000, cpc: 100, discountPerUnit: 500, price: 4000 })).toEqual({
      maxClicks: 1000,
      maxRedemptions: 100,
      totalLimit: 150_000,
      customerPrice: 3500,
    })
  })
  it('floors partial units and tolerates empty fields', () => {
    expect(budgetCapacity({ adBudget: 250, discountBudget: 999, cpc: 100, discountPerUnit: 500, price: null }).maxClicks).toBe(2)
    expect(budgetCapacity({ adBudget: null, discountBudget: 999, cpc: 0, discountPerUnit: 500, price: null })).toMatchObject({ maxClicks: 0, maxRedemptions: 1 })
  })
})

describe('campaign lifecycle', () => {
  it('waits for the pharmacy and fixes the agreed price on approval', () => {
    const created = ok(createCampaign(createSeed(NOW), draft(), NOW, ev()))
    expect(created.value.approval).toBe('pending')
    expect(placementBlockers(created.state, created.value, TODAY).map((b) => b.code)).toEqual(['not_approved'])
    expect(err(registerClick(created.state, created.value.id, NOW, ev()))).toContain('не подтвердила')

    const approved = ok(approveCampaign(created.state, created.value.id, NOW, ev()))
    expect(approved.value.agreedPrice).toBe(4000)
    expect(placementBlockers(approved.state, approved.value, TODAY)).toEqual([])
  })

  it('allows one unfinished campaign per pharmacy + product and points to it', () => {
    const { state, id } = launched()
    const r = createCampaign(state, draft({ name: 'Дубль' }), NOW, ev())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.ref).toBe(id)
    // another product in the same pharmacy is fine
    expect(createCampaign(state, draft({ sku: 'DC-LIP-004' }), NOW, ev()).ok).toBe(true)
  })

  it('frees the pair after rejection', () => {
    const created = ok(createCampaign(createSeed(NOW), draft(), NOW, ev()))
    const rejected = ok(rejectCampaign(created.state, created.value.id, NOW, ev()))
    expect(rejected.value.approval).toBe('rejected')
    expect(createCampaign(rejected.state, draft(), NOW, ev()).ok).toBe(true)
  })

  it('validates the form', () => {
    const s = createSeed(NOW)
    const fields = (d: CampaignDraft) => {
      const r = createCampaign(s, d, NOW, ev())
      return r.ok ? {} : (r.fieldErrors ?? {})
    }
    expect(fields(draft({ discountPerUnit: 4000 }))).toHaveProperty('discountPerUnit')
    expect(fields(draft({ endDate: '2026-11-10' }))).toHaveProperty('endDate')
    expect(fields(draft({ startDate: '2026-11-01' }))).toHaveProperty('startDate')
    expect(fields(draft({ adBudget: 50 }))).toHaveProperty('adBudget')
    expect(fields(draft({ discountBudget: 100 }))).toHaveProperty('discountBudget')
    expect(fields(draft({ cpc: 12.5 }))).toHaveProperty('cpc')
    expect(fields(draft({ cpc: -1 }))).toHaveProperty('cpc')
    expect(fields(draft({ name: '   ' }))).toHaveProperty('name')
    expect(fields(draft({ sku: '' }))).toHaveProperty('sku')
  })
})

describe('reference scenario: 1 click + 1 redemption', () => {
  it('brand 600 = pharmacy 70 + compensation 500 + platform 30', () => {
    const { state: s0, id } = launched()
    const { state: s1, orderId } = clickAndOrder(s0, id)

    // Order alone creates no compensation — only a reserve.
    const pending = metrics(s1, id)
    expect(pending).toMatchObject({ adSpend: 100, confirmedDiscounts: 0, reservedDiscounts: 500, brandSpend: 100, discountBudgetAvailable: 49_500 })
    expect(stock(s1)).toBe(119)

    const s2 = ok(transitionOrder(s1, orderId, 'redeemed', NOW, ev())).state
    const m = metrics(s2, id)
    expect(m).toMatchObject({ brandSpend: 600, pharmacyAdRevenue: 70, confirmedDiscounts: 500, platformRevenue: 30, reservedDiscounts: 0, redeemed: 1 })
    expect(m.pharmacyAdRevenue + m.platformRevenue + m.confirmedDiscounts).toBe(m.brandSpend)
    expect(m.costPerRedemption).toBe(600)
    expect(stock(s2)).toBe(119) // redemption does not decrement a second time
    expect(pharmacySettlement(s2, 'arna')).toEqual({ adRevenue: 70, confirmedCompensation: 500, reservedDiscounts: 0, totalAccrued: 570 })

    // Return: compensation reversed, unit back, ad spend stays.
    const s3 = ok(transitionOrder(s2, orderId, 'returned', NOW, ev())).state
    expect(metrics(s3, id)).toMatchObject({ brandSpend: 100, pharmacyAdRevenue: 70, confirmedDiscounts: 0, platformRevenue: 30, redeemed: 0, returned: 1 })
    expect(metrics(s3, id).costPerRedemption).toBeNull()
    expect(stock(s3)).toBe(120)
    expect(pharmacySettlement(s3, 'arna').totalAccrued).toBe(70)

    const kinds = buildLedger(s3, { campaignId: id }).map((e) => e.kind).sort()
    expect(kinds).toEqual(['ad_click', 'discount_confirmed', 'discount_reserved', 'discount_reversed'])
    // All four events share NOW: ties keep their real sequence, newest first.
    expect(buildLedger(s3, { campaignId: id }).map((e) => e.kind)).toEqual(['discount_reversed', 'discount_confirmed', 'discount_reserved', 'ad_click'])
    const ledgerAccrual = buildLedger(s3, { pharmacyId: 'arna' }).reduce((sum, e) => sum + e.pharmacyAccrual, 0)
    expect(ledgerAccrual).toBe(pharmacySettlement(s3, 'arna').totalAccrued)
  })

  it('cancel releases the reserve and the unit', () => {
    const { state: s0, id } = launched()
    const { state: s1, orderId } = clickAndOrder(s0, id)
    const s2 = ok(transitionOrder(s1, orderId, 'cancelled', NOW, ev())).state
    expect(metrics(s2, id)).toMatchObject({ reservedDiscounts: 0, confirmedDiscounts: 0, discountBudgetAvailable: 50_000, brandSpend: 100, cancelled: 1 })
    expect(stock(s2)).toBe(120)
  })
})

describe('order state machine', () => {
  it('rejects transitions outside pending→redeemed→returned and pending→cancelled', () => {
    const { state: s0, id } = launched()
    const { state: s1, orderId } = clickAndOrder(s0, id)
    expect(err(transitionOrder(s1, orderId, 'returned', NOW, ev()))).toContain('Нельзя')
    const cancelled = ok(transitionOrder(s1, orderId, 'cancelled', NOW, ev())).state
    expect(transitionOrder(cancelled, orderId, 'redeemed', NOW, ev()).ok).toBe(false)
    const redeemed = ok(transitionOrder(s1, orderId, 'redeemed', NOW, ev())).state
    expect(transitionOrder(redeemed, orderId, 'cancelled', NOW, ev()).ok).toBe(false)
    const returned = ok(transitionOrder(redeemed, orderId, 'returned', NOW, ev())).state
    for (const to of ['pending', 'redeemed', 'cancelled', 'returned'] as const) {
      expect(transitionOrder(returned, orderId, to, NOW, ev()).ok).toBe(false)
    }
  })
})

describe('idempotency', () => {
  it('replaying the same event ids changes nothing', () => {
    const { state: s0, id } = launched()
    const clickEv = ev()
    const orderEv = ev()
    const redeemEv = ev()
    const s1 = ok(registerClick(s0, id, NOW, clickEv)).state
    const o = ok(createOrder(s1, { pharmacyId: 'arna', sku: ORAL }, NOW, orderEv))
    const s3 = ok(transitionOrder(o.state, o.value.id, 'redeemed', NOW, redeemEv)).state
    const before = JSON.stringify(s3)

    const replays: Result<unknown>[] = [
      registerClick(s3, id, NOW, clickEv),
      createOrder(s3, { pharmacyId: 'arna', sku: ORAL }, NOW, orderEv),
      transitionOrder(s3, o.value.id, 'redeemed', NOW, redeemEv),
    ]
    for (const r of replays) {
      const replay = ok(r)
      expect(replay.duplicate).toBe(true)
      expect(JSON.stringify(replay.state)).toBe(before)
    }
    expect(metrics(s3, id).brandSpend).toBe(600)
  })

  it('charges a repeat click in the same buyer session zero, a new buyer again', () => {
    const { state: s0, id } = launched()
    const s1 = ok(registerClick(s0, id, NOW, ev())).state
    const repeat = ok(registerClick(s1, id, NOW, ev()))
    expect(repeat.duplicate).toBe(true)
    expect(metrics(repeat.state, id).adSpend).toBe(100)
    const s2 = ok(startNewSession(repeat.state, NOW)).state
    const s3 = ok(registerClick(s2, id, NOW, ev())).state
    expect(metrics(s3, id)).toMatchObject({ adSpend: 200, validClicks: 2 })
  })
})

describe('attribution', () => {
  it('orders without a click in the session are organic and full price', () => {
    const { state: s0 } = launched()
    const o = ok(createOrder(s0, { pharmacyId: 'arna', sku: ORAL }, NOW, ev()))
    expect(o.value).toMatchObject({ campaignId: null, discount: 0, total: 4000 })
  })

  it('a click from another buyer session is not attributed', () => {
    const { state: s0, id } = launched()
    const s1 = ok(registerClick(s0, id, NOW, ev())).state
    const s2 = ok(startNewSession(s1, NOW)).state
    expect(quoteOrder(s2, 'arna', ORAL, TODAY)).toMatchObject({ campaignId: null, discount: 0 })
  })

  it('gives one discounted order per click; cancelling frees it', () => {
    const { state: s0, id } = launched()
    const { state: s1, orderId } = clickAndOrder(s0, id)
    expect(quoteOrder(s1, 'arna', ORAL, TODAY)).toMatchObject({ discount: 0 })
    expect(quoteOrder(s1, 'arna', ORAL, TODAY).noDiscountReason).toContain('уже использована')
    const s2 = ok(transitionOrder(s1, orderId, 'cancelled', NOW, ev())).state
    expect(quoteOrder(s2, 'arna', ORAL, TODAY)).toMatchObject({ discount: 500, campaignId: id })
  })
})

describe('placement blockers', () => {
  it('never promises a resume for a spent ad budget or an ended period', () => {
    const b = (...codes: Blocker['code'][]): Blocker[] => codes.map((code) => ({ code, message: code }))
    expect(resumeOutlook(b('ad_budget'))).toEqual({ final: true, needs: [] })
    expect(resumeOutlook(b('ended', 'no_stock')).final).toBe(true)
    expect(resumeOutlook(b('price_changed', 'no_stock'))).toEqual({
      final: false,
      needs: ['аптека пополнит остаток', 'аптека подтвердит новую цену'],
    })
    expect(joinRu(['а'])).toBe('а')
    expect(joinRu(['а', 'б', 'в'])).toBe('а, б и в')
  })

  it('stops clicks when the ad budget cannot cover the next one, but keeps the discount for a paid click', () => {
    const { state: s0, id } = launched({ adBudget: 150 })
    const s1 = ok(registerClick(s0, id, NOW, ev())).state
    expect(placementBlockers(s1, campaign(s1, id), TODAY).map((b) => b.code)).toEqual(['ad_budget'])
    // buyer who already clicked can still order with the discount
    expect(quoteOrder(s1, 'arna', ORAL, TODAY).discount).toBe(500)
    const s2 = ok(startNewSession(s1, NOW)).state
    expect(err(registerClick(s2, id, NOW, ev()))).toContain('Рекламного бюджета не хватает')
    expect(metrics(s2, id).adSpend).toBeLessThanOrEqual(150)
  })

  it('counts reserves against the discount budget and resumes when a reserve is released', () => {
    const { state: s0, id } = launched({ discountBudget: 1000 })
    const a = clickAndOrder(s0, id)
    const b = clickAndOrder(ok(startNewSession(a.state, NOW)).state, id)
    const s3 = ok(startNewSession(b.state, NOW)).state
    expect(metrics(s3, id)).toMatchObject({ reservedDiscounts: 1000, discountBudgetAvailable: 0 })
    expect(placementBlockers(s3, campaign(s3, id), TODAY).map((x) => x.code)).toEqual(['discount_budget'])
    expect(err(registerClick(s3, id, NOW, ev()))).toContain('Бюджета скидок не хватает')

    const s4 = ok(transitionOrder(s3, a.orderId, 'cancelled', NOW, ev())).state
    expect(placementBlockers(s4, campaign(s4, id), TODAY)).toEqual([])
    expect(placementChanges(s3, s4, TODAY)[0]).toContain('снова показывается')
  })

  it('never lets confirmed + reserved discounts exceed the discount budget', () => {
    let { state } = launched({ discountBudget: 1500 })
    const id = state.campaigns[0].id
    for (let i = 0; i < 6; i++) {
      state = ok(startNewSession(state, NOW)).state
      const click = registerClick(state, id, NOW, ev())
      if (!click.ok) continue
      const order = ok(createOrder(click.state, { pharmacyId: 'arna', sku: ORAL }, NOW, ev()))
      state = ok(transitionOrder(order.state, order.value.id, 'redeemed', NOW, ev())).state
    }
    const m = metrics(state, id)
    expect(m.confirmedDiscounts + m.reservedDiscounts).toBeLessThanOrEqual(1500)
    expect(m.redeemed).toBe(3)
  })

  it('stops at zero stock, still redeems existing orders, resumes on restock, keeps manual pause', () => {
    let s = launched().state
    const id = s.campaigns[0].id
    s = ok(updateInventoryItem(s, { pharmacyId: 'arna', sku: ORAL, price: 4000, stock: 1 }, NOW)).state
    const before = s
    const { state: s1, orderId } = clickAndOrder(s, id)
    expect(stock(s1)).toBe(0)
    expect(placementBlockers(s1, campaign(s1, id), TODAY).map((b) => b.code)).toEqual(['no_stock'])
    expect(placementChanges(before, s1, TODAY)[0]).toContain('остановлена')
    expect(quoteOrder(s1, 'arna', ORAL, TODAY).available).toBe(false)
    expect(createOrder(s1, { pharmacyId: 'arna', sku: ORAL }, NOW, ev()).ok).toBe(false)

    const s2 = ok(transitionOrder(s1, orderId, 'redeemed', NOW, ev())).state
    expect(metrics(s2, id).confirmedDiscounts).toBe(500)
    expect(stock(s2)).toBe(0) // no negative stock, no double decrement

    const paused = ok(setCampaignPaused(s2, id, true, ev())).state
    const restocked = ok(updateInventoryItem(paused, { pharmacyId: 'arna', sku: ORAL, price: 4000, stock: 5 }, NOW)).state
    expect(placementBlockers(restocked, campaign(restocked, id), TODAY).map((b) => b.code)).toEqual(['paused'])
    const unpaused = ok(setCampaignPaused(restocked, id, false, ev())).state
    expect(placementBlockers(unpaused, campaign(unpaused, id), TODAY)).toEqual([])
  })

  it('price change stops placement, keeps old order snapshots, needs re-approval', () => {
    const { state: s0, id } = launched()
    const { state: s1, orderId } = clickAndOrder(s0, id)
    const s2 = ok(updateInventoryItem(s1, { pharmacyId: 'arna', sku: ORAL, price: 4200, stock: 119 }, NOW)).state
    expect(placementBlockers(s2, campaign(s2, id), TODAY).map((b) => b.code)).toEqual(['price_changed'])
    expect(quoteOrder(s2, 'arna', ORAL, TODAY).discount).toBe(0)

    const s3 = ok(transitionOrder(s2, orderId, 'redeemed', NOW, ev())).state
    expect(s3.orders[0]).toMatchObject({ unitPrice: 4000, discount: 500, total: 3500, status: 'redeemed' })

    const re = ok(approveCampaign(s3, id, NOW, ev()))
    expect(re.value.agreedPrice).toBe(4200)
    expect(placementBlockers(re.state, campaign(re.state, id), TODAY)).toEqual([])
    const s4 = ok(startNewSession(re.state, NOW)).state
    const o2 = clickAndOrder(s4, id)
    expect(o2.state.orders.at(-1)).toMatchObject({ unitPrice: 4200, total: 3700 })
  })

  it('refuses re-approval when the discount is no longer below the new price', () => {
    const { state: s0, id } = launched()
    const s1 = ok(updateInventoryItem(s0, { pharmacyId: 'arna', sku: ORAL, price: 450, stock: 120 }, NOW)).state
    expect(err(approveCampaign(s1, id, NOW, ev()))).toContain('не меньше текущей цены')
  })

  it('respects campaign dates', () => {
    const { state, id } = launched({ startDate: '2026-11-20', endDate: '2026-11-30' })
    expect(placementBlockers(state, campaign(state, id), TODAY).map((b) => b.code)).toEqual(['not_started'])
    expect(placementBlockers(state, campaign(state, id), '2026-12-01').map((b) => b.code)).toEqual(['ended'])
  })

  it('does not repeat a manual pause as an automatic stop, but announces the resume', () => {
    const { state: s0, id } = launched()
    const paused = ok(setCampaignPaused(s0, id, true, ev())).state
    expect(placementChanges(s0, paused, TODAY)).toEqual([])
    const unpaused = ok(setCampaignPaused(paused, id, false, ev())).state
    expect(placementChanges(paused, unpaused, TODAY)[0]).toContain('снова показывается')
  })
})

describe('catalog CSV', () => {
  const skus = PRODUCTS.map((p) => p.sku)

  it('accepts a valid file with or without header, comma or semicolon', () => {
    expect(parseInventoryCsv('sku,price,stock\nDC-ORAL-250,4100,90\n', skus)).toMatchObject({ canApply: true, errorCount: 0 })
    expect(parseInventoryCsv('DC-ORAL-250;4100;90', skus)).toMatchObject({ canApply: true })
    expect(parseInventoryCsv('﻿sku,price,stock\r\nDC-LIP-004, 1500 , 0\r\n', skus).rows[0]).toMatchObject({ price: 1500, stock: 0, errors: [] })
  })

  it('reports errors per row and blocks applying the whole file', () => {
    const r = parseInventoryCsv(
      ['sku,price,stock', 'DC-ORAL-250,4100,90', 'DC-XXX-1,100,1', 'DC-LIP-004,-5,3', 'DC-HAND-075,2800,abc', 'DC-ORAL-250,4000,1', 'DC-SUN-050,6500'].join('\n'),
      skus,
    )
    expect(r.canApply).toBe(false)
    expect(r.errorCount).toBe(5)
    expect(r.rows.find((x) => x.line === 3)?.errors[0]).toContain('нет в ассортименте')
    expect(r.rows.find((x) => x.line === 6)?.errors[0]).toContain('повторяется')
    expect(r.rows.find((x) => x.line === 7)?.errors[0]).toContain('3 поля')
  })

  it('rejects empty files and wrong headers', () => {
    expect(parseInventoryCsv('', skus).fileError).toBe('Файл пустой')
    expect(parseInventoryCsv('sku,price,stock\n', skus).fileError).toContain('нет строк')
    expect(parseInventoryCsv('sku,stock,price\nDC-ORAL-250,1,2', skus).fileError).toContain('заголовком')
  })

  it('applies only valid rows to the selected pharmacy', () => {
    const s = createSeed(NOW)
    const parsed = parseInventoryCsv('sku,price,stock\nDC-HAND-075,2900,40', skus)
    const next = ok(applyInventoryCsv(s, 'shuaq', parsed.rows, NOW)).state
    expect(findInventory(next, 'shuaq', 'DC-HAND-075')).toMatchObject({ stock: 40 })
    expect(findInventory(next, 'arna', 'DC-HAND-075')).toMatchObject({ stock: 64 })
    const bad = parseInventoryCsv('DC-HAND-075,0,40', skus)
    expect(applyInventoryCsv(s, 'shuaq', bad.rows, NOW).ok).toBe(false)
  })

  it('offers a downloadable sample that parses cleanly for each pharmacy', () => {
    const s = createSeed(NOW)
    for (const pharmacyId of ['arna', 'shuaq']) {
      const parsed = parseInventoryCsv(sampleCsv(s, pharmacyId), skus)
      expect(parsed).toMatchObject({ fileError: null, errorCount: 0, canApply: true })
      expect(parsed.rows.length).toBe(PRODUCTS.length)
    }
  })
})

describe('opportunities', () => {
  it('shows two launch-ready pairs and one restock case from the seed', () => {
    const featured = featuredOpportunities(buildOpportunities(createSeed(NOW), TODAY))
    expect(featured.map((o) => [o.pharmacyId, o.sku, o.kind])).toEqual([
      ['arna', 'DC-ORAL-250', 'ready'],
      ['shuaq', 'DC-SUN-050', 'ready'],
      ['shuaq', 'DC-HAND-075', 'restock'],
    ])
  })

  it('turns the restock case into a launch-ready one after restocking', () => {
    const s = ok(updateInventoryItem(createSeed(NOW), { pharmacyId: 'shuaq', sku: 'DC-HAND-075', price: 2900, stock: 50 }, NOW)).state
    const hand = buildOpportunities(s, TODAY).find((o) => o.id === 'shuaq:DC-HAND-075')
    expect(hand?.kind).toBe('ready')
  })
})

describe('synthetic uplift example', () => {
  it('matches the reference arithmetic', () => {
    expect(computeUplift(createSeed(NOW).experiment)).toEqual({
      controlRate: 5,
      treatmentRate: 6.5,
      diffPp: 1.5,
      relativePct: 30,
      extraBuyers: 150,
      discountSpend: 325_000,
      totalSpend: 525_000,
      costPerExtraBuyer: 3500,
    })
  })
})

describe('persistence', () => {
  const memory = (): StorageLike & { data: Map<string, string> } => {
    const data = new Map<string, string>()
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
  }

  it('restores a saved state after reload', () => {
    const storage = memory()
    const { state } = launched()
    expect(saveState(storage, state)).toBe(true)
    const loaded = loadState(storage, NOW)
    expect(loaded.notice).toBeNull()
    expect(loaded.state).toEqual(state)
  })

  it('replaces corrupt or foreign data with a fresh seed and a notice', () => {
    const storage = memory()
    storage.setItem(STORAGE_KEY, '{not json')
    expect(loadState(storage, NOW).notice).toContain('повреждены')
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, campaigns: 'oops' }))
    expect(loadState(storage, NOW).notice).toContain('повреждены')
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...createSeed(NOW), version: 999 }))
    const foreign = loadState(storage, NOW)
    expect(foreign.notice).toContain('другой версии')
    expect(foreign.state.campaigns).toEqual([])
  })

  it('keeps a full money flow, and rejects unknown ids, broken money and dangling references', () => {
    const storage = memory()
    const { state: s0, id } = launched()
    const { state: s1, orderId } = clickAndOrder(s0, id)
    const s2 = ok(transitionOrder(s1, orderId, 'redeemed', NOW, ev())).state
    expect(isAppState(JSON.parse(JSON.stringify(s2)))).toBe(true)
    expect(isAppState(JSON.parse(JSON.stringify(createSeed(NOW))))).toBe(true)

    const tampered = (edit: (s: AppState) => void) => {
      const copy = JSON.parse(JSON.stringify(s2)) as AppState
      edit(copy)
      storage.setItem(STORAGE_KEY, JSON.stringify(copy))
      return loadState(storage, NOW).notice
    }
    expect(tampered((s) => { s.orders[0].sku = 'DC-TYPO' })).toContain('повреждены')
    expect(tampered((s) => { s.campaigns[0].pharmacyId = 'nowhere' })).toContain('повреждены')
    expect(tampered((s) => { s.campaigns[0].cpc = -100 })).toContain('повреждены')
    expect(tampered((s) => { s.campaigns[0].endDate = '2026-13-01' })).toContain('повреждены')
    expect(tampered((s) => { Object.assign(s.orders[0], { history: [null] }) })).toContain('повреждены')
    expect(tampered((s) => { s.clicks[0].campaignId = 'cmp-missing' })).toContain('повреждены')
  })
})
