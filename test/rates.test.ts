import { describe, expect, it } from 'vitest'

import { TaxError } from '../src/errors.js'
import {
  euCountries,
  euVatRates,
  euVatRatesUpdated,
  findRateEntry,
  isEuCountry,
  lookupRate,
  normaliseCountry,
} from '../src/rates.js'
import type { VatRateEntry } from '../src/types.js'

const on = (value: string): Date => new Date(`${value}T12:00:00.000Z`)

describe('euVatRates', () => {
  it('carries all twenty seven member states', () => {
    expect(euCountries).toHaveLength(27)
    expect(new Set(euCountries).size).toBe(27)
  })

  it('is dated', () => {
    expect(euVatRatesUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('gives every country a standard rate between 15 and 27 per cent', () => {
    euVatRates.forEach((entry) => {
      expect(entry.standard).toBeGreaterThanOrEqual(15)
      expect(entry.standard).toBeLessThanOrEqual(27)
    })
  })

  it('keeps reduced rates below the standard rate', () => {
    euVatRates.forEach((entry) => {
      ;(entry.reduced ?? []).forEach((rate) => {
        expect(rate).toBeLessThan(entry.standard)
      })
    })
  })

  it('uses GR for Greece, not the EL of the VAT prefix', () => {
    expect(euCountries).toContain('GR')
    expect(euCountries).not.toContain('EL')
  })
})

describe('normaliseCountry', () => {
  it('uppercases and trims', () => {
    expect(normaliseCountry(' de ')).toBe('DE')
  })

  it('maps the Greek VAT prefix onto the ISO code', () => {
    expect(normaliseCountry('EL')).toBe('GR')
  })

  it('refuses anything that is not two letters', () => {
    expect(normaliseCountry('DEU')).toBeNull()
    expect(normaliseCountry('')).toBeNull()
    expect(normaliseCountry(42)).toBeNull()
  })
})

describe('isEuCountry', () => {
  it('separates member states from the rest', () => {
    expect(isEuCountry('DE')).toBe(true)
    expect(isEuCountry('GR')).toBe(true)
    expect(isEuCountry('GB')).toBe(false)
    expect(isEuCountry('US')).toBe(false)
    expect(isEuCountry(null)).toBe(false)
  })
})

describe('lookupRate', () => {
  it('reads the standard rate', () => {
    expect(lookupRate(euVatRates, 'DE', 'standard', on('2026-08-19')).rate).toBe(19)
  })

  it('reads the first and second reduced rates', () => {
    expect(lookupRate(euVatRates, 'GR', 'reduced', on('2026-08-19')).rate).toBe(13)
    expect(lookupRate(euVatRates, 'GR', 'secondReduced', on('2026-08-19')).rate).toBe(6)
  })

  it('reads a super reduced rate where one exists', () => {
    expect(lookupRate(euVatRates, 'IE', 'superReduced', on('2026-08-19')).rate).toBe(4.8)
  })

  it('always answers zero for the zero band', () => {
    expect(lookupRate(euVatRates, 'DK', 'zero', on('2026-08-19')).rate).toBe(0)
  })

  it('refuses a band the country does not have', () => {
    expect(() => lookupRate(euVatRates, 'DK', 'reduced', on('2026-08-19'))).toThrow(TaxError)
    expect(() => lookupRate(euVatRates, 'DE', 'superReduced', on('2026-08-19'))).toThrow(
      /no superReduced rate/,
    )
  })

  it('refuses a country that is not in the table', () => {
    try {
      lookupRate(euVatRates, 'US', 'standard', on('2026-08-19'))
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(TaxError)
      expect((error as TaxError).code).toBe('rate-not-found')
    }
  })
})

describe('effective dates', () => {
  const history: VatRateEntry[] = [
    { country: 'DE', from: '2020-07-01', standard: 16, to: '2020-12-31' },
    { country: 'DE', from: '2021-01-01', standard: 19 },
  ]

  it('picks the rate in force on the day of supply', () => {
    expect(lookupRate(history, 'DE', 'standard', on('2020-09-01')).rate).toBe(16)
    expect(lookupRate(history, 'DE', 'standard', on('2021-03-01')).rate).toBe(19)
  })

  it('does not rewrite history when a later rate is added', () => {
    const withChange = [...history, { country: 'DE', from: '2027-01-01', standard: 20 }]

    expect(lookupRate(withChange, 'DE', 'standard', on('2026-08-19')).rate).toBe(19)
    expect(lookupRate(withChange, 'DE', 'standard', on('2027-02-01')).rate).toBe(20)
  })

  it('treats an entry with no from date as always in force', () => {
    expect(findRateEntry([{ country: 'FR', standard: 20 }], 'FR', on('1999-01-01'))).not.toBeNull()
  })

  it('honours the last day an entry applies', () => {
    expect(findRateEntry(history, 'DE', on('2020-06-30'))).toBeNull()
  })

  it('lets a supplied rate win over the built in one on the same day', () => {
    const custom: VatRateEntry[] = [{ country: 'DE', standard: 17 }]

    expect(lookupRate([...custom, ...euVatRates], 'DE', 'standard', on('2026-08-19')).rate).toBe(17)
  })
})
