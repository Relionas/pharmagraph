import { MAX_PRICE, MAX_STOCK } from './actions'
import type { AppState } from './types'

export const CSV_HEADER = 'sku,price,stock'
export const CSV_MAX_BYTES = 100_000

export interface CsvPreviewRow {
  /** 1-based line number in the file. */
  line: number
  raw: string
  sku: string
  price: number | null
  stock: number | null
  errors: string[]
}

export interface CsvParseResult {
  fileError: string | null
  rows: CsvPreviewRow[]
  errorCount: number
  /** Only a file without a single error can be applied. */
  canApply: boolean
}

const INT = /^\d+$/

/**
 * Parse `sku,price,stock`. Header is optional; `;` is accepted as a delimiter
 * (spreadsheet exports in RU/KZ locales). Every row is validated independently.
 */
export function parseInventoryCsv(text: string, allowedSkus: readonly string[]): CsvParseResult {
  const empty = (fileError: string): CsvParseResult => ({ fileError, rows: [], errorCount: 0, canApply: false })
  if (text.length > CSV_MAX_BYTES) return empty('Файл слишком большой: не больше 100 КБ')

  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const firstIdx = lines.findIndex((l) => l.trim() !== '')
  if (firstIdx === -1) return empty('Файл пустой')

  const first = lines[firstIdx]
  const delimiter = first.includes(';') && !first.includes(',') ? ';' : ','
  const split = (l: string) => l.split(delimiter).map((c) => c.trim())

  let start = firstIdx
  const headerCells = split(first).map((c) => c.toLowerCase())
  if (headerCells[0] === 'sku') {
    if (headerCells.join(',') !== CSV_HEADER) return empty(`Первая строка должна быть заголовком «${CSV_HEADER}»`)
    start = firstIdx + 1
  }

  const allowed = new Set(allowedSkus)
  const seen = new Map<string, number>()
  const rows: CsvPreviewRow[] = []

  for (let i = start; i < lines.length; i++) {
    const raw = lines[i]
    if (raw.trim() === '') continue
    const line = i + 1
    const cells = split(raw)
    const errors: string[] = []
    if (cells.length !== 3) {
      rows.push({ line, raw, sku: cells[0] ?? '', price: null, stock: null, errors: ['Ожидается 3 поля: sku, price, stock'] })
      continue
    }
    const [sku, priceRaw, stockRaw] = cells
    if (!sku) errors.push('Не указан SKU')
    else if (!allowed.has(sku)) errors.push(`SKU «${sku}» нет в ассортименте аптеки`)
    else if (seen.has(sku)) errors.push(`SKU повторяется — уже был в строке ${seen.get(sku)}`)
    if (sku) seen.set(sku, seen.get(sku) ?? line)

    let price: number | null = null
    if (!INT.test(priceRaw) || Number(priceRaw) <= 0) errors.push('Цена — целое положительное число тенге без пробелов')
    else if (Number(priceRaw) > MAX_PRICE) errors.push('Цена слишком большая')
    else price = Number(priceRaw)

    let stock: number | null = null
    if (!INT.test(stockRaw)) errors.push('Остаток — целое число не меньше нуля')
    else if (Number(stockRaw) > MAX_STOCK) errors.push('Остаток слишком большой')
    else stock = Number(stockRaw)

    rows.push({ line, raw, sku, price, stock, errors })
  }

  if (rows.length === 0) return empty('В файле нет строк с данными — только заголовок')
  const errorCount = rows.filter((r) => r.errors.length > 0).length
  return { fileError: null, rows, errorCount, canApply: errorCount === 0 }
}

/** Sample file with the pharmacy's current catalog. */
export function sampleCsv(state: AppState, pharmacyId: string): string {
  const lines = state.inventory.filter((i) => i.pharmacyId === pharmacyId).map((i) => `${i.sku},${i.price},${i.stock}`)
  return [CSV_HEADER, ...lines].join('\n') + '\n'
}
