const intFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
const pctFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 0 })

/** '100 000 ₸' — integer tenge with a non-breaking space before the sign. */
export function tenge(value: number): string {
  return `${intFmt.format(value)} ₸`
}

/** Signed tenge: '+500 ₸' / '−500 ₸'. */
export function signedTenge(value: number): string {
  if (value === 0) return tenge(0)
  return `${value > 0 ? '+' : '−'}${tenge(Math.abs(value))}`
}

export function int(value: number): string {
  return intFmt.format(value)
}

/** 6.5 → '6,5 %'. */
export function percent(value: number): string {
  return `${pctFmt.format(value)} %`
}

/** Russian plural: plural(5, ['клик', 'клика', 'кликов']). */
export function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
  return forms[2]
}
