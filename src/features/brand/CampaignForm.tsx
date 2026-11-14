import { ArrowRight, Info } from 'lucide-react'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { budgetCapacity, findInventory, splitClick } from '../../domain/metrics'
import { openCampaignFor, validateCampaignDraft, type CampaignDraft, type DraftErrors } from '../../domain/rules'
import { getPharmacy, getProduct, PHARMACIES, PHARMACY_AD_SHARE_PCT, PRODUCTS } from '../../domain/seed'
import { int, tenge } from '../../lib/format'
import { addDays } from '../../lib/time'
import { commands, go } from '../../store/commands'
import { today, useStore } from '../../store/store'
import { Button, Field, Modal, Notice, SelectField } from '../../ui/primitives'

const DEFAULTS = { adBudget: 100_000, discountBudget: 50_000, cpc: 100, discountPerUnit: 500 }

type MoneyKey = 'adBudget' | 'discountBudget' | 'cpc' | 'discountPerUnit'

interface FormValues {
  name: string
  pharmacyId: string
  sku: string
  startDate: string
  endDate: string
  adBudget: string
  discountBudget: string
  cpc: string
  discountPerUnit: string
}

const defaultName = (pharmacyId: string, sku: string) => `${getProduct(sku).shortName} · ${getPharmacy(pharmacyId).city}`

/** Accepts «100 000», «100000»; anything else is null and fails validation with a clear message. */
function parseMoney(v: string): number | null {
  const s = v.replace(/[\s  ]/g, '')
  return /^\d+$/.test(s) ? Number(s) : null
}

export function CampaignForm() {
  const form = useStore((s) => s.form)
  const closeForm = useStore((s) => s.closeForm)
  return (
    <Modal
      open={form.open}
      onClose={closeForm}
      title="Новая кампания"
      description="Карточка в каталоге аптеки, оплата за клик (CPC) и фиксированная скидка за единицу, которую финансирует бренд."
      width="lg"
    >
      {/* Re-mount the body on each opening so the form starts from the prefill. */}
      {form.open && <FormBody key={JSON.stringify(form.prefill)} prefill={form.prefill} onDone={closeForm} />}
    </Modal>
  )
}

function FormBody({ prefill, onDone }: { prefill: Partial<CampaignDraft> | null; onDone: () => void }) {
  const data = useStore((s) => s.data)
  const t = today()

  const [v, setV] = useState<FormValues>(() => {
    const pharmacyId = prefill?.pharmacyId ?? PHARMACIES[0].id
    const sku = prefill?.sku ?? PRODUCTS[0].sku
    return {
      name: prefill?.name ?? defaultName(pharmacyId, sku),
      pharmacyId,
      sku,
      startDate: prefill?.startDate ?? t,
      endDate: prefill?.endDate ?? addDays(t, 13),
      adBudget: String(prefill?.adBudget ?? DEFAULTS.adBudget),
      discountBudget: String(prefill?.discountBudget ?? DEFAULTS.discountBudget),
      cpc: String(prefill?.cpc ?? DEFAULTS.cpc),
      discountPerUnit: String(prefill?.discountPerUnit ?? DEFAULTS.discountPerUnit),
    }
  })
  const [nameTouched, setNameTouched] = useState(Boolean(prefill?.name))
  const [touched, setTouched] = useState<Partial<Record<keyof FormValues, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)

  const draft: CampaignDraft = {
    name: v.name,
    pharmacyId: v.pharmacyId,
    sku: v.sku,
    startDate: v.startDate,
    endDate: v.endDate,
    adBudget: parseMoney(v.adBudget),
    discountBudget: parseMoney(v.discountBudget),
    cpc: parseMoney(v.cpc),
    discountPerUnit: parseMoney(v.discountPerUnit),
  }
  const errors: DraftErrors = validateCampaignDraft(data, draft, t)
  const item = findInventory(data, v.pharmacyId, v.sku)
  const duplicate = openCampaignFor(data, v.pharmacyId, v.sku, t)
  const capacity = budgetCapacity({ ...draft, price: item?.price ?? null })
  const split = draft.cpc ? splitClick(draft.cpc) : null
  const shown = (k: keyof FormValues) => (submitted || touched[k] ? errors[k] : undefined)
  const errorCount = Object.keys(errors).length

  const set = (patch: Partial<FormValues>) => setV((prev) => {
    const next = { ...prev, ...patch }
    if (!nameTouched && (patch.pharmacyId || patch.sku)) next.name = defaultName(next.pharmacyId, next.sku)
    return next
  })
  const touch = (k: keyof FormValues) => setTouched((p) => ({ ...p, [k]: true }))

  const productOptions = useMemo(
    () =>
      PRODUCTS.map((p) => {
        const inv = findInventory(data, v.pharmacyId, p.sku)
        return { value: p.sku, label: inv ? `${p.shortName}, ${p.volume} — ${tenge(inv.price)}, доступно ${int(inv.stock)} шт.` : `${p.shortName} — нет в ассортименте` }
      }),
    [data, v.pharmacyId],
  )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (duplicate || errorCount > 0) return
    const r = commands.createCampaign(draft)
    if (r.ok && r.value) {
      onDone()
      go.campaign(r.value.id)
    }
  }

  const blockReason = duplicate
    ? `Для этой пары аптека × товар уже есть незавершенная кампания №${duplicate.number}`
    : submitted && errorCount > 0
      ? 'Исправьте поля, отмеченные красным'
      : null

  const moneyField = (k: MoneyKey, label: string, hint: string) => (
    <Field
      label={label}
      inputMode="numeric"
      autoComplete="off"
      suffix="₸"
      value={v[k]}
      onChange={(e) => set({ [k]: e.target.value } as Partial<FormValues>)}
      onBlur={() => touch(k)}
      error={shown(k)}
      hint={hint}
    />
  )

  return (
    <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-5">
        <Field
          label="Название кампании"
          value={v.name}
          maxLength={80}
          onChange={(e) => { setNameTouched(true); set({ name: e.target.value }) }}
          onBlur={() => touch('name')}
          error={shown('name')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Аптека"
            value={v.pharmacyId}
            onChange={(pharmacyId) => set({ pharmacyId })}
            options={PHARMACIES.map((p) => ({ value: p.id, label: `${p.name}, ${p.city}` }))}
            error={shown('pharmacyId')}
          />
          <SelectField label="Товар" value={v.sku} onChange={(sku) => set({ sku })} options={productOptions} error={errors.sku} />
        </div>

        {duplicate && (
          <Notice tone="warning" icon={<Info className="size-4" />}>
            <p>
              Для этой аптеки и товара уже есть незавершенная кампания №{duplicate.number}. Одновременно может идти только одна — чтобы не платить дважды за один и тот же показ.
            </p>
            <Button size="sm" variant="secondary" className="mt-2" icon={<ArrowRight className="size-3.5" aria-hidden />} onClick={() => { onDone(); go.campaign(duplicate.id) }}>
              Открыть кампанию №{duplicate.number}
            </Button>
          </Notice>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Дата начала" type="date" min={t} value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} onBlur={() => touch('startDate')} error={shown('startDate')} />
          <Field label="Дата окончания" type="date" min={v.startDate || t} value={v.endDate} onChange={(e) => set({ endDate: e.target.value })} onBlur={() => touch('endDate')} error={shown('endDate')} />
        </div>

        <fieldset className="space-y-4 rounded-lg border border-line p-4">
          <legend className="px-1 text-sm font-medium">Реклама: оплата за клик</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {moneyField('adBudget', 'Рекламный бюджет', 'Списывается только за засчитанные клики')}
            {moneyField('cpc', 'Цена клика (CPC)', `${PHARMACY_AD_SHARE_PCT} % аптеке, остальное платформе`)}
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-lg border border-line p-4">
          <legend className="px-1 text-sm font-medium">Скидка покупателю за счет бренда</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {moneyField('discountBudget', 'Бюджет скидок', 'Компенсация аптеке только за выкупленные заказы')}
            {moneyField('discountPerUnit', 'Скидка за единицу', item ? `Цена на полке ${tenge(item.price)}` : 'Цена неизвестна')}
          </div>
        </fieldset>
      </div>

      <aside aria-labelledby="capacity-title" className="space-y-4 lg:sticky lg:top-0 lg:self-start">
        <div className="rounded-lg border border-line bg-canvas p-4">
          <h3 id="capacity-title" className="text-sm font-semibold">Емкость бюджета</h3>
          <p className="mt-0.5 text-xs text-muted">Это предел бюджета, а не прогноз продаж.</p>
          <dl className="mt-3 space-y-2.5 text-sm" aria-live="polite">
            <CapacityRow label="Максимум кликов" value={capacity.maxClicks > 0 ? int(capacity.maxClicks) : '—'} />
            <CapacityRow label="Максимум выкупов со скидкой" value={capacity.maxRedemptions > 0 ? int(capacity.maxRedemptions) : '—'} />
            <CapacityRow label="Предел расходов бренда" value={tenge(capacity.totalLimit)} strong />
            <div className="border-t border-line pt-2.5">
              <CapacityRow
                label="Цена для покупателя"
                value={
                  capacity.customerPrice !== null && capacity.customerPrice > 0 && item ? (
                    <span>
                      <span className="sr-only">Обычная цена </span>
                      <s className="mr-1.5 font-normal text-muted">{tenge(item.price)}</s>
                      <span className="sr-only">, со скидкой </span>
                      {tenge(capacity.customerPrice)}
                    </span>
                  ) : '—'
                }
              />
            </div>
            {split && (
              <CapacityRow label="С одного клика" value={<span className="font-normal">аптеке {tenge(split.pharmacyShare)} · платформе {tenge(split.platformShare)}</span>} />
            )}
            {draft.discountPerUnit && (
              <CapacityRow label="Компенсация аптеке за выкуп" value={tenge(draft.discountPerUnit)} />
            )}
          </dl>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          После отправки кампания получит статус «Ожидает подтверждения аптеки». Показ начнется, только когда аптека подтвердит участие и цену.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabledReason={blockReason}>Отправить аптеке</Button>
          <Button variant="ghost" onClick={onDone}>Отмена</Button>
        </div>
        {submitted && errorCount > 0 && (
          <p role="alert" className="text-xs text-negative">Проверьте поля: {errorCount} {errorCount === 1 ? 'ошибка' : errorCount < 5 ? 'ошибки' : 'ошибок'}.</p>
        )}
      </aside>
    </form>
  )
}

function CapacityRow({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? 'font-semibold text-ink tabular-nums' : 'font-medium text-ink tabular-nums'}>{value}</dd>
    </div>
  )
}
