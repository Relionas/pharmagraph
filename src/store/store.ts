import { create } from 'zustand'
import { placementChanges, type CampaignDraft } from '../domain/rules'
import { createSeed, PHARMACIES } from '../domain/seed'
import type { AppState, Result } from '../domain/types'
import { isWideScreen } from '../lib/media'
import { dayKey } from '../lib/time'
import { browserStorage, loadState, saveState, UI_STORAGE_KEY } from './persist'

export type Role = 'brand' | 'pharmacy' | 'storefront'
export type BrandTab = 'opportunities' | 'campaigns' | 'results' | 'uplift'
export type PharmacyTab = 'offers' | 'settlements' | 'catalog'

export interface UiState {
  role: Role
  brandTab: BrandTab
  pharmacyTab: PharmacyTab
  /** Pharmacy whose cabinet is open. */
  pharmacyId: string
  /** Pharmacy whose storefront is open. */
  storefrontPharmacyId: string
  /** Campaign selected on the results tab; null = all campaigns. */
  resultsCampaignId: string | null
  /** Opportunity whose "why" panel is open. */
  whyOpportunityId: string | null
  scenarioOpen: boolean
  /** Scenario steps the presenter has completed (sticky until reset). */
  scenarioDone: number[]
  visited: { why: boolean; results: boolean; uplift: boolean }
}

export type ToastTone = 'success' | 'error' | 'info' | 'warning'
export interface Toast {
  id: number
  tone: ToastTone
  text: string
}

export type Runner<T> = (state: AppState, now: Date, eventId: string) => Result<T>

interface ReplayableEvent {
  label: string
  eventId: string
  run: Runner<unknown>
}

interface Store {
  data: AppState
  ui: UiState
  toasts: Toast[]
  form: { open: boolean; prefill: Partial<CampaignDraft> | null }
  lastEvent: ReplayableEvent | null
  /**
   * Execute a domain transition with a fresh event id, persist the result and report it.
   * Replayable events can be re-sent with the same id to demonstrate idempotency.
   */
  run: <T>(label: string, runner: Runner<T>, opts?: { replayable?: boolean; quiet?: boolean }) => Result<T>
  replayLast: () => void
  setUi: (patch: Partial<UiState>) => void
  toast: (tone: ToastTone, text: string) => void
  dismissToast: (id: number) => void
  openForm: (prefill?: Partial<CampaignDraft>) => void
  closeForm: () => void
  reset: () => void
}

const DEFAULT_UI: UiState = {
  role: 'brand',
  brandTab: 'opportunities',
  pharmacyTab: 'offers',
  pharmacyId: PHARMACIES[0].id,
  storefrontPharmacyId: PHARMACIES[0].id,
  resultsCampaignId: null,
  whyOpportunityId: null,
  scenarioOpen: false,
  scenarioDone: [],
  visited: { why: false, results: false, uplift: false },
}

const ROLES: Role[] = ['brand', 'pharmacy', 'storefront']
const BRAND_TABS: BrandTab[] = ['opportunities', 'campaigns', 'results', 'uplift']
const PHARMACY_TABS: PharmacyTab[] = ['offers', 'settlements', 'catalog']
const PHARMACY_IDS = PHARMACIES.map((p) => p.id)

function loadUi(): UiState {
  const storage = browserStorage()
  try {
    const raw = storage?.getItem(UI_STORAGE_KEY)
    if (!raw) return DEFAULT_UI
    const v = JSON.parse(raw) as Partial<UiState>
    return {
      ...DEFAULT_UI,
      role: ROLES.includes(v.role as Role) ? (v.role as Role) : DEFAULT_UI.role,
      brandTab: BRAND_TABS.includes(v.brandTab as BrandTab) ? (v.brandTab as BrandTab) : DEFAULT_UI.brandTab,
      pharmacyTab: PHARMACY_TABS.includes(v.pharmacyTab as PharmacyTab) ? (v.pharmacyTab as PharmacyTab) : DEFAULT_UI.pharmacyTab,
      pharmacyId: PHARMACY_IDS.includes(v.pharmacyId ?? '') ? (v.pharmacyId as string) : DEFAULT_UI.pharmacyId,
      storefrontPharmacyId: PHARMACY_IDS.includes(v.storefrontPharmacyId ?? '') ? (v.storefrontPharmacyId as string) : DEFAULT_UI.storefrontPharmacyId,
      resultsCampaignId: typeof v.resultsCampaignId === 'string' ? v.resultsCampaignId : null,
      // Below 1280px the scenario is a full-screen drawer: don't cover the page on every reload.
      scenarioOpen: v.scenarioOpen === true && isWideScreen(),
      scenarioDone: Array.isArray(v.scenarioDone) ? v.scenarioDone.filter((n) => Number.isInteger(n) && n >= 1 && n <= 9) : [],
      visited: {
        why: v.visited?.why === true,
        results: v.visited?.results === true,
        uplift: v.visited?.uplift === true,
      },
    }
  } catch {
    return DEFAULT_UI
  }
}

function saveUi(ui: UiState) {
  try {
    browserStorage()?.setItem(UI_STORAGE_KEY, JSON.stringify(ui))
  } catch {
    /* UI preferences are optional */
  }
}

function newEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `ev-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

let toastSeq = 0
let saveFailedReported = false

const initial = loadState(browserStorage(), new Date())

export const useStore = create<Store>((set, get) => {
  const persist = (data: AppState) => {
    if (!saveState(browserStorage(), data) && !saveFailedReported) {
      saveFailedReported = true
      get().toast('warning', 'Браузер не дал сохранить данные — после перезагрузки демо начнется заново')
    }
  }

  return {
    data: initial.state,
    ui: loadUi(),
    toasts: initial.notice ? [{ id: ++toastSeq, tone: 'warning', text: initial.notice }] : [],
    form: { open: false, prefill: null },
    lastEvent: null,

    run: (label, runner, opts = {}) => {
      const now = new Date()
      const eventId = newEventId()
      const before = get().data
      const r = runner(before, now, eventId)
      if (!r.ok) {
        if (!opts.quiet && !r.fieldErrors) get().toast('error', r.error)
        return r
      }
      set({
        data: r.state,
        lastEvent: opts.replayable ? { label, eventId, run: runner as Runner<unknown> } : get().lastEvent,
      })
      if (r.state !== before) persist(r.state)
      if (r.info && !opts.quiet) get().toast(r.duplicate ? 'info' : 'success', r.info)
      for (const change of placementChanges(before, r.state, dayKey(now))) {
        get().toast(change.includes('остановлена') ? 'warning' : 'info', change)
      }
      return r
    },

    replayLast: () => {
      const ev = get().lastEvent
      if (!ev) {
        get().toast('info', 'Пока нечего повторять: сначала сделайте клик, заказ или выкуп')
        return
      }
      const r = ev.run(get().data, new Date(), ev.eventId)
      if (r.ok && r.duplicate) {
        get().toast('info', `Повтор события «${ev.label}» с тем же идентификатором: уже обработано, итоги не изменились`)
      } else if (!r.ok) {
        get().toast('error', r.error)
      }
    },

    setUi: (patch) => {
      const ui = { ...get().ui, ...patch }
      set({ ui })
      saveUi(ui)
    },

    toast: (tone, text) => {
      const id = ++toastSeq
      set({ toasts: [...get().toasts.slice(-3), { id, tone, text }] })
      window.setTimeout(() => get().dismissToast(id), tone === 'error' || tone === 'warning' ? 7000 : 4500)
    },

    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

    openForm: (prefill) => set({ form: { open: true, prefill: prefill ?? null } }),
    closeForm: () => set({ form: { open: false, prefill: null } }),

    reset: () => {
      const data = createSeed(new Date())
      const ui = { ...DEFAULT_UI, scenarioOpen: get().ui.scenarioOpen }
      set({ data, ui, form: { open: false, prefill: null }, lastEvent: null, toasts: [] })
      persist(data)
      saveUi(ui)
      get().toast('success', 'Демо сброшено к исходному состоянию')
    },
  }
})

/** Today's date key in Asia/Almaty. Recomputed on every render — cheap and never stale. */
export const today = () => dayKey(new Date())
