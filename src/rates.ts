import { TaxError } from './errors.js'
import type { VatRateEntry, VatRateLookup, VatRateType } from './types.js'

/**
 * Date the built in table was compiled. Rates change: check them against your
 * tax authority and override what is out of date.
 */
export const euVatRatesUpdated = '2026-08-19'

/**
 * Standard and reduced VAT rates for the twenty seven member states, as
 * compiled on the date above. Overridable in full.
 */
export const euVatRates: VatRateEntry[] = [
  { country: 'AT', reduced: [10, 13], standard: 20 },
  { country: 'BE', reduced: [6, 12], standard: 21 },
  { country: 'BG', reduced: [9], standard: 20 },
  { country: 'CY', reduced: [5, 9], standard: 19 },
  { country: 'CZ', reduced: [12], standard: 21 },
  { country: 'DE', reduced: [7], standard: 19 },
  { country: 'DK', standard: 25 },
  { country: 'EE', reduced: [9], standard: 24 },
  { country: 'ES', reduced: [10], standard: 21, superReduced: 4 },
  { country: 'FI', reduced: [14, 10], standard: 25.5 },
  { country: 'FR', reduced: [5.5, 10], standard: 20, superReduced: 2.1 },
  { country: 'GR', reduced: [13, 6], standard: 24 },
  { country: 'HR', reduced: [5, 13], standard: 25 },
  { country: 'HU', reduced: [5, 18], standard: 27 },
  { country: 'IE', reduced: [13.5, 9], standard: 23, superReduced: 4.8 },
  { country: 'IT', reduced: [10, 5], standard: 22, superReduced: 4 },
  { country: 'LT', reduced: [9, 5], standard: 21 },
  { country: 'LU', reduced: [8, 14], standard: 17, superReduced: 3 },
  { country: 'LV', reduced: [12, 5], standard: 21 },
  { country: 'MT', reduced: [7, 5], standard: 18 },
  { country: 'NL', reduced: [9], standard: 21 },
  { country: 'PL', reduced: [8, 5], standard: 23 },
  { country: 'PT', reduced: [6, 13], standard: 23 },
  { country: 'RO', reduced: [11], standard: 21 },
  { country: 'SE', reduced: [12, 6], standard: 25 },
  { country: 'SI', reduced: [9.5, 5], standard: 22 },
  { country: 'SK', reduced: [19, 5], standard: 23 },
]

export const euCountries: string[] = euVatRates.map((entry) => entry.country)

export const normaliseCountry = (value: unknown): null | string => {
  if (typeof value !== 'string') {
    return null
  }

  const code = value.trim().toUpperCase()

  if (!/^[A-Z]{2}$/.test(code)) {
    return null
  }

  return code === 'EL' ? 'GR' : code
}

export const isEuCountry = (country: null | string): boolean =>
  country !== null && euCountries.includes(country)

export const toDate = (value: Date | string | undefined): Date => {
  if (value === undefined) {
    return new Date()
  }

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    throw new TaxError('invalid-date', `Not a usable date of supply: ${String(value)}`)
  }

  return date
}

const day = (value: Date): string => value.toISOString().slice(0, 10)

const inForce = (entry: VatRateEntry, on: string): boolean => {
  if (typeof entry.from === 'string' && entry.from > on) {
    return false
  }

  return !(typeof entry.to === 'string' && entry.to < on)
}

export const effectiveRates = (
  custom: VatRateEntry[],
  useBuiltIn: boolean,
): VatRateEntry[] => (useBuiltIn ? [...custom, ...euVatRates] : [...custom])

export const findRateEntry = (
  rates: VatRateEntry[],
  country: string,
  date: Date,
): null | VatRateEntry => {
  const on = day(date)
  const candidates = rates
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => normaliseCountry(entry.country) === country && inForce(entry, on))

  if (candidates.length === 0) {
    return null
  }

  candidates.sort((a, b) => {
    const left = a.entry.from ?? ''
    const right = b.entry.from ?? ''

    return left === right ? a.index - b.index : right.localeCompare(left)
  })

  return candidates[0]?.entry ?? null
}

const bandOf = (entry: VatRateEntry, type: VatRateType): null | number => {
  if (type === 'zero') {
    return 0
  }

  if (type === 'standard') {
    return entry.standard
  }

  if (type === 'superReduced') {
    return entry.superReduced ?? null
  }

  const reduced = entry.reduced ?? []

  return (type === 'reduced' ? reduced[0] : reduced[1]) ?? null
}

export const lookupRate = (
  rates: VatRateEntry[],
  country: string,
  type: VatRateType,
  date: Date,
): VatRateLookup => {
  const entry = findRateEntry(rates, country, date)

  if (!entry) {
    throw new TaxError(
      'rate-not-found',
      `No VAT rate for ${country} on ${day(date)}. Add one through the rates option.`,
    )
  }

  const rate = bandOf(entry, type)

  if (rate === null) {
    throw new TaxError(
      'rate-not-found',
      `${country} has no ${type} rate on ${day(date)}. Add one through the rates option.`,
    )
  }

  return { country, entry, rate, type }
}
