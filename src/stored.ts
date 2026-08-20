import type { TaxCalculation, VatNumberCheckResult } from './types.js'

export type StoredTaxBreakdown = {
  rate: number
  taxableBase: number
  taxAmount: number
}

export type StoredTax = {
  breakdown: StoredTaxBreakdown[]
  calculatedAt: string
  country: null | string
  note: null | string
  pricesIncludeTax: boolean
  rate: null | number
  resolved: boolean
  reverseCharge: boolean
  scope: string
  taxAmount: number
  taxableBase: number
  vatNumber: null | string
  vatNumberCheck: string
}

export const readPath = (source: unknown, path: string): unknown => {
  if (path.length === 0) {
    return undefined
  }

  let current: unknown = source

  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') {
      return undefined
    }

    current = (current as Record<string, unknown>)[key]
  }

  return current
}

export const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

export const isRecorded = (value: unknown): boolean =>
  typeof asRecord(value).taxAmount === 'number'

export const vatNumberCheckValue = (
  vatNumber: null | string,
  check: null | VatNumberCheckResult,
): string => {
  if (vatNumber === null) {
    return 'none'
  }

  if (check === null || check.online === 'skipped') {
    return 'format'
  }

  return check.online === 'valid'
    ? 'vies-valid'
    : check.online === 'invalid'
      ? 'vies-invalid'
      : 'vies-unavailable'
}

export const toStoredTax = (
  calculation: TaxCalculation,
  check: null | VatNumberCheckResult = null,
  now: Date = new Date(),
): StoredTax => ({
  breakdown: calculation.breakdown.map((entry) => ({
    rate: entry.rate,
    taxAmount: entry.tax,
    taxableBase: entry.net,
  })),
  calculatedAt: now.toISOString(),
  country: calculation.country,
  note: calculation.reverseChargeNote ?? calculation.note,
  pricesIncludeTax: calculation.pricesIncludeTax,
  rate: calculation.breakdown.length === 1 ? (calculation.breakdown[0]?.rate ?? null) : null,
  resolved: calculation.resolved,
  reverseCharge: calculation.reverseCharge,
  scope: calculation.scope,
  taxAmount: calculation.tax,
  taxableBase: calculation.net,
  vatNumber: calculation.vatNumber,
  vatNumberCheck: vatNumberCheckValue(calculation.vatNumber, check),
})

export const unresolvedTax = (
  note: string,
  taxableBase: number,
  pricesIncludeTax: boolean,
  vatNumber: null | string = null,
  now: Date = new Date(),
): StoredTax => ({
  breakdown: [],
  calculatedAt: now.toISOString(),
  country: null,
  note,
  pricesIncludeTax,
  rate: null,
  resolved: false,
  reverseCharge: false,
  scope: 'unknown',
  taxAmount: 0,
  taxableBase,
  vatNumber,
  vatNumberCheck: vatNumber === null ? 'none' : 'format',
})
