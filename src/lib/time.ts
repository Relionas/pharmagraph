export const TIME_ZONE = 'Asia/Almaty'

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 'YYYY-MM-DD' for the given instant in Asia/Almaty. */
export function dayKey(date: Date = new Date()): string {
  return dayKeyFmt.format(date)
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function isDayKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const shortDateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** '14 ноября 2026 г.' from a day key. */
export function formatDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return dateFmt.format(new Date(Date.UTC(y, m - 1, d)))
}

/** '14 нояб.' from a day key. */
export function formatDayKeyShort(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return shortDateFmt.format(new Date(Date.UTC(y, m - 1, d)))
}

const dateTimeFmt = new Intl.DateTimeFormat('ru-RU', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/** '14 нояб., 11:42' in Asia/Almaty. */
export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso))
}

/** 'только что', '5 мин назад', '2 ч назад', or a date. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const diffMin = Math.round((now.getTime() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return 'только что'
  if (diffMin < 60) return `${diffMin} мин назад`
  const hours = Math.floor(diffMin / 60)
  if (hours < 24) return `${hours} ч назад`
  return formatDateTime(iso)
}
