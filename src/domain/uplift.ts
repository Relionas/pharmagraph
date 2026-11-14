import type { SyntheticExperiment } from './types'

export interface UpliftResult {
  controlRate: number
  treatmentRate: number
  /** Percentage points. */
  diffPp: number
  /** Relative change, percent. */
  relativePct: number
  /** Extra buyers in the treatment group vs the control rate. */
  extraBuyers: number
  discountSpend: number
  totalSpend: number
  /** null when there are no extra buyers. */
  costPerExtraBuyer: number | null
}

const round1 = (v: number) => Math.round(v * 10) / 10

/** Arithmetic of a finished synthetic test. Point estimates only — no significance claims. */
export function computeUplift(e: SyntheticExperiment): UpliftResult {
  const controlRate = (e.control.buyers / e.control.participants) * 100
  const treatmentRate = (e.treatment.buyers / e.treatment.participants) * 100
  const expectedWithout = (e.control.buyers * e.treatment.participants) / e.control.participants
  const extraBuyers = Math.round(e.treatment.buyers - expectedWithout)
  const discountSpend = e.discountPerBuyer * e.treatment.buyers
  const totalSpend = e.adSpend + discountSpend
  return {
    controlRate: round1(controlRate),
    treatmentRate: round1(treatmentRate),
    diffPp: round1(treatmentRate - controlRate),
    relativePct: round1(((treatmentRate - controlRate) / controlRate) * 100),
    extraBuyers,
    discountSpend,
    totalSpend,
    costPerExtraBuyer: extraBuyers > 0 ? Math.round(totalSpend / extraBuyers) : null,
  }
}
