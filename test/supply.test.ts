import { describe, expect, it } from 'vitest'

import { calculateTax } from '../src/calculate.js'
import { defaultReverseChargeNote } from '../src/options.js'
import type { TaxCalculationOptions } from '../src/types.js'

const greek: TaxCalculationOptions = { sellerCountry: 'GR' }
const lines = [{ amount: 10_000 }]
const german = 'DE123456789'

describe('place of supply, business to consumer', () => {
  it('charges the seller rate at home', () => {
    const result = calculateTax({ country: 'GR', lines }, greek)

    expect(result).toMatchObject({ country: 'GR', scope: 'domestic', tax: 2400 })
  })

  it('charges the customer country rate across a border', () => {
    const result = calculateTax({ country: 'DE', lines }, greek)

    expect(result).toMatchObject({ country: 'DE', scope: 'intra-eu-b2c', tax: 1900 })
  })

  it('charges the seller rate across a border when place of supply is origin', () => {
    const result = calculateTax({ country: 'DE', lines }, { ...greek, placeOfSupply: 'origin' })

    expect(result).toMatchObject({ country: 'GR', destination: 'DE', tax: 2400 })
  })

  it('accepts the Greek VAT prefix as a country', () => {
    expect(calculateTax({ country: 'EL', lines }, greek).scope).toBe('domestic')
  })
})

describe('place of supply, business to business', () => {
  it('zero rates a valid VAT number from another member state', () => {
    const result = calculateTax({ country: 'DE', lines, vatNumber: german }, greek)

    expect(result).toMatchObject({
      reverseCharge: true,
      scope: 'intra-eu-b2b',
      tax: 0,
      vatNumberValid: true,
    })
    expect(result.gross).toBe(10_000)
  })

  it('carries the wording the invoice needs', () => {
    const result = calculateTax({ country: 'DE', lines, vatNumber: german }, greek)

    expect(result.reverseChargeNote).toBe(defaultReverseChargeNote)
  })

  it('takes a note of your own', () => {
    const result = calculateTax(
      { country: 'DE', lines, vatNumber: german },
      { ...greek, reverseChargeNote: 'Reverse charge, Article 138.' },
    )

    expect(result.reverseChargeNote).toBe('Reverse charge, Article 138.')
  })

  it('charges VAT to a domestic business, because reverse charge does not apply at home', () => {
    const result = calculateTax({ country: 'GR', lines, vatNumber: 'EL123456789' }, greek)

    expect(result).toMatchObject({ reverseCharge: false, scope: 'domestic', tax: 2400 })
    expect(result.note).toContain('inside one member state')
  })

  it('charges VAT when the VAT number is malformed', () => {
    const result = calculateTax({ country: 'DE', lines, vatNumber: 'DE12345' }, greek)

    expect(result).toMatchObject({ reverseCharge: false, scope: 'intra-eu-b2c', tax: 1900 })
    expect(result.note).toContain('did not pass validation')
  })

  it('charges VAT when the number belongs to the seller country', () => {
    const result = calculateTax({ country: 'DE', lines, vatNumber: 'EL123456789' }, greek)

    expect(result).toMatchObject({ reverseCharge: false, scope: 'intra-eu-b2c' })
  })

  it('lets a validation performed elsewhere overrule the format check', () => {
    const result = calculateTax(
      { country: 'DE', lines, vatNumber: german, vatNumberValid: false },
      greek,
    )

    expect(result.reverseCharge).toBe(false)
  })

  it('will not reverse charge without a VAT number, whatever the flag says', () => {
    const result = calculateTax({ country: 'DE', lines, vatNumberValid: true }, greek)

    expect(result.reverseCharge).toBe(false)
  })

  it('stores the VAT number in its normalised form', () => {
    const result = calculateTax({ country: 'DE', lines, vatNumber: ' de 123.456-789 ' }, greek)

    expect(result.vatNumber).toBe('DE123456789')
  })
})

describe('place of supply, outside the EU', () => {
  it('applies no EU VAT and says why', () => {
    const result = calculateTax({ country: 'US', lines }, greek)

    expect(result).toMatchObject({ resolved: true, scope: 'outside-eu', tax: 0 })
    expect(result.note).toContain('Outside the EU VAT area')
  })

  it('needs no seller country to reach that answer', () => {
    expect(calculateTax({ country: 'US', lines }).scope).toBe('outside-eu')
  })

  it('treats the United Kingdom as outside', () => {
    expect(calculateTax({ country: 'GB', lines }, greek).scope).toBe('outside-eu')
  })
})
