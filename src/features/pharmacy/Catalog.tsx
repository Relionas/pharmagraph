import { Download, FileUp, Pencil, Trash2, TriangleAlert, Upload } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { CSV_HEADER, CSV_MAX_BYTES, parseInventoryCsv, sampleCsv, type CsvParseResult } from '../../domain/csv'
import { reservedUnits } from '../../domain/metrics'
import { getPharmacy, getProduct, PRODUCTS } from '../../domain/seed'
import type { InventoryItem } from '../../domain/types'
import { int, tenge } from '../../lib/format'
import { formatDateTime, formatRelative } from '../../lib/time'
import { commands } from '../../store/commands'
import { useStore } from '../../store/store'
import { ProductPack } from '../../ui/ProductPack'
import { Badge, Button, Card, Field, Modal, Notice, SectionTitle } from '../../ui/primitives'

const ALLOWED_SKUS = PRODUCTS.map((p) => p.sku)

export function Catalog({ pharmacyId }: { pharmacyId: string }) {
  const data = useStore((s) => s.data)
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const items = data.inventory.filter((i) => i.pharmacyId === pharmacyId)
  const liveSkus = new Set(
    data.campaigns.filter((c) => c.pharmacyId === pharmacyId && c.approval === 'approved').map((c) => c.sku),
  )

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Ассортимент"
        subtitle="В прототипе каталог обновляется вручную или через CSV. Заказы поступают из тестовой витрины."
      />

      <Card className="overflow-hidden">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Ассортимент аптеки {getPharmacy(pharmacyId).name}</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th scope="col" className="px-5 py-2.5 font-medium">Товар</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Цена</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Доступно</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">В резерве</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Обновлено</th>
                <th scope="col" className="px-5 py-2.5 font-medium"><span className="sr-only">Действия</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const p = getProduct(i.sku)
                const reserved = reservedUnits(data, pharmacyId, i.sku)
                return (
                  <tr key={i.sku} className="border-b border-line last:border-0">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <ProductPack sku={i.sku} size={36} />
                        <div className="min-w-0">
                          <div className="font-medium text-ink">{p.shortName}, {p.volume}</div>
                          <div className="text-xs text-muted">
                            {p.sku}
                            {liveSkus.has(i.sku) && <Badge tone="info" className="ml-2">в кампании</Badge>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{tenge(i.price)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {i.stock === 0 ? <Badge tone="negative">0 шт.</Badge> : `${int(i.stock)} шт.`}
                    </td>
                    <td className="px-5 py-3 text-right text-muted tabular-nums">{reserved > 0 ? `${int(reserved)} шт.` : '—'}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-muted" title={formatDateTime(i.updatedAt)}>{formatRelative(i.updatedAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" aria-hidden />} onClick={() => setEditing(i)} aria-label={`Изменить: ${p.shortName}`}>
                        Изменить
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <CsvImport pharmacyId={pharmacyId} />

      <EditItemModal item={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

// ── Manual edit ─────────────────────────────────────────────────────────────

function EditItemModal({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  return (
    <Modal open={item !== null} onClose={onClose} title={item ? `Изменить: ${getProduct(item.sku).shortName}` : 'Изменить позицию'} width="sm">
      {item && <EditItemForm key={`${item.pharmacyId}:${item.sku}`} item={item} onClose={onClose} />}
    </Modal>
  )
}

const toInt = (v: string): number | null => {
  const s = v.replace(/\s/g, '')
  return /^\d+$/.test(s) ? Number(s) : null
}

function EditItemForm({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const [price, setPrice] = useState(String(item.price))
  const [stock, setStock] = useState(String(item.stock))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const campaigns = data.campaigns.filter((c) => c.pharmacyId === item.pharmacyId && c.sku === item.sku && c.approval === 'approved')
  const newPrice = toInt(price)
  const newStock = toInt(stock)
  const priceWarn = campaigns.some((c) => c.agreedPrice !== null && newPrice !== null && newPrice !== c.agreedPrice)
  const stockWarn = campaigns.length > 0 && newStock === 0

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const r = commands.updateItem(item.pharmacyId, item.sku, newPrice, newStock)
    if (r.ok) onClose()
    else setErrors(r.fieldErrors ?? {})
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Цена" suffix="₸" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} error={errors.price} autoFocus />
        <Field label="Доступный остаток" suffix="шт." inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} error={errors.stock} hint="Без учета резерва" />
      </div>
      {priceWarn && (
        <Notice tone="warning" icon={<TriangleAlert className="size-4" />}>
          Цена отличается от согласованной в кампании — показ остановится до повторного подтверждения аптеки. Уже созданные заказы сохранят свою цену.
        </Notice>
      )}
      {stockWarn && (
        <Notice tone="warning" icon={<TriangleAlert className="size-4" />}>
          При нулевом остатке показ рекламы остановится и возобновится сам после пополнения.
        </Notice>
      )}
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button type="submit" variant="primary">Сохранить</Button>
      </div>
    </form>
  )
}

// ── CSV import ──────────────────────────────────────────────────────────────

function CsvImport({ pharmacyId }: { pharmacyId: string }) {
  const data = useStore((s) => s.data)
  const toast = useStore((s) => s.toast)
  const inputRef = useRef<HTMLInputElement>(null)
  const readToken = useRef(0)
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<CsvParseResult | null>(null)

  const download = () => {
    const blob = new Blob([sampleCsv(data, pharmacyId)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `catalog-${pharmacyId}.csv`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const clear = () => {
    setResult(null)
    setFileName(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // A slower read of an earlier file must not overwrite the preview of the file picked last.
    const token = ++readToken.current
    setFileName(file.name)
    if (file.size > CSV_MAX_BYTES) {
      setResult({ fileError: `Файл больше ${Math.round(CSV_MAX_BYTES / 1000)} КБ`, rows: [], errorCount: 1, canApply: false })
      return
    }
    try {
      const text = await file.text()
      if (token === readToken.current) setResult(parseInventoryCsv(text, ALLOWED_SKUS))
    } catch {
      if (token === readToken.current) setResult({ fileError: 'Не удалось прочитать файл', rows: [], errorCount: 1, canApply: false })
    }
  }

  const apply = () => {
    if (!result) return
    const r = commands.applyCsv(pharmacyId, result.rows)
    if (r.ok) clear()
  }

  const applyReason = !result
    ? 'Сначала загрузите файл'
    : result.fileError
      ? result.fileError
      : !result.canApply
        ? `В файле ${result.errorCount} ${result.errorCount === 1 ? 'ошибка' : 'ошибок'} — применяется только полностью корректный файл`
        : null

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Обновить из CSV</h3>
          <p className="mt-0.5 text-xs text-muted">
            Формат: <code className="rounded bg-wash px-1">{CSV_HEADER}</code>, одна строка на товар. Цена и остаток — целые числа. Файл применяется только целиком, если в нем нет ошибок.
          </p>
        </div>
        <Button size="sm" variant="secondary" icon={<Download className="size-3.5" aria-hidden />} onClick={download}>Скачать пример</Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {/* The native input keeps the single tab stop (Enter/Space open the picker); the label is its visible face. */}
        <input ref={inputRef} id={`csv-${pharmacyId}`} type="file" accept=".csv,text/csv" onChange={onFile} className="peer sr-only" />
        <label
          htmlFor={`csv-${pharmacyId}`}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm text-ink hover:border-line-strong hover:bg-wash peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-signal-edge"
        >
          <FileUp className="size-4" aria-hidden /> Выбрать файл
        </label>
        <span className="text-sm text-muted">{fileName ?? 'Файл не выбран'}</span>
      </div>

      {result && (
        <div className="mt-4 space-y-3">
          {result.fileError ? (
            <Notice tone="negative">{result.fileError}</Notice>
          ) : (
            <>
              <p className="text-sm" role="status">
                Строк: {result.rows.length} ·{' '}
                {result.errorCount === 0 ? <span className="text-positive">ошибок нет</span> : <span className="text-negative">ошибок: {result.errorCount}</span>}
              </p>
              <div className="relative overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[560px] text-sm">
                  <caption className="sr-only">Предпросмотр CSV</caption>
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-muted">
                      <th scope="col" className="px-3 py-2 font-medium">Строка</th>
                      <th scope="col" className="px-3 py-2 font-medium">SKU</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Цена</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Остаток</th>
                      <th scope="col" className="px-3 py-2 font-medium">Проверка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r) => (
                      <tr key={r.line} className={r.errors.length ? 'bg-negative-soft' : undefined}>
                        <td className="px-3 py-1.5 text-muted tabular-nums">{r.line}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{r.sku || '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.price !== null ? tenge(r.price) : '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.stock !== null ? int(r.stock) : '—'}</td>
                        <td className="px-3 py-1.5">
                          {r.errors.length === 0 ? <span className="text-positive">OK</span> : <span className="text-negative">{r.errors.join('; ')}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<Upload className="size-4" aria-hidden />} disabledReason={applyReason} onClick={apply}>Применить</Button>
            <Button variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => { clear(); toast('info', 'Предпросмотр очищен') }}>Очистить</Button>
          </div>
        </div>
      )}
    </Card>
  )
}
