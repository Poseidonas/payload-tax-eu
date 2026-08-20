import { describe, expect, it } from 'vitest'

import { calculateTax } from '../src/calculate.js'
import { TaxError } from '../src/errors.js'
import type { TaxCalculationOptions } from '../src/types.js'

const seller: TaxCalculationOptions = { sellerCountry: 'GR' }

const code = (run: () => unknown): string => {
  try {
    run()
  } catch (error) {
    return error instanceof TaxError ? error.code : 'not-a-tax-error'
  }

  return 'no-error'
}

describe('calculateTax, exclusive prices', () => {
  it('adds the destination rate to the net amount', () => {
    const result = calculateTax({ country: 'GR', lines: [{ amount: 1000 }] }, seller)

    expect(result).toMatchObject({ gross: 1240, net: 1000, tax: 240 })
  })

  it('rounds a half up to the next minor unit', () => {
    const result = calculateTax({ country: 'DE', lines: [{ amount: 50 }] }, seller)

    expect(result.tax).toBe(10)
  })

  it('rounds below a half down', () => {
    const result = calculateTax({ country: 'DE', lines: [{ amount: 999 }] }, seller)

    expect(result.tax).toBe(190)
    expect(result.gross).toBe(1189)
  })

  it('keeps a credit line negative and rounds it away from zero', () => {
    const result = calculateTax({ country: 'DE', lines: [{ amount: -50 }] }, seller)

    expect(result).toMatchObject({ gross: -60, net: -50, tax: -10 })
  })

  it('leaves a zero line at zero', () => {
    expect(calculateTax({ country: 'DE', lines: [{ amount: 0 }] }, seller).tax).toBe(0)
  })
})

describe('calculateTax, inclusive prices', () => {
  const inclusive: TaxCalculationOptions = { ...seller, pricesIncludeTax: true }

  it('takes the tax out of the price rather than adding to it', () => {
    const result = calculateTax({ country: 'DE', lines: [{ amount: 1190 }] }, inclusive)

    expect(result).toMatchObject({ gross: 1190, net: 1000, tax: 190 })
  })

  it('never changes the gross the customer was quoted', () => {
    const result = calculateTax({ country: 'GR', lines: [{ amount: 1000 }] }, inclusive)

    expect(result.gross).toBe(1000)
    expect(result.net + result.tax).toBe(1000)
  })

  it('splits an odd amount without losing a minor unit', () => {
    const result = calculateTax({ country: 'HU', lines: [{ amount: 999 }] }, inclusive)

    expect(result.net + result.tax).toBe(999)
  })

  it('records which way round the prices were', () => {
    expect(calculateTax({ country: 'DE', lines: [{ amount: 100 }] }, inclusive).pricesIncludeTax).toBe(
      true,
    )
    expect(calculateTax({ country: 'DE', lines: [{ amount: 100 }] }, seller).pricesIncludeTax).toBe(
      false,
    )
  })
})

describe('calculateTax, rounding scope', () => {
  const lines = [{ amount: 333 }, { amount: 333 }, { amount: 333 }]

  it('rounds every line on its own by default', () => {
    const result = calculateTax({ country: 'DE', lines }, seller)

    expect(result.lines.map((line) => line.tax)).toEqual([63, 63, 63])
    expect(result.tax).toBe(189)
  })

  it('rounds the rate group once when asked to', () => {
    const result = calculateTax({ country: 'DE', lines }, { ...seller, rounding: 'total' })

    expect(result.tax).toBe(190)
    expect(result.lines.map((line) => line.tax)).toEqual([64, 63, 63])
  })

  it('makes the line tax add up to the group tax exactly', () => {
    const result = calculateTax(
      { country: 'GR', lines: [{ amount: 400 }, { amount: 400 }, { amount: 400 }] },
      { ...seller, pricesIncludeTax: true, rounding: 'total' },
    )

    expect(result.lines.reduce((sum, line) => sum + line.tax, 0)).toBe(result.tax)
    expect(result.lines.reduce((sum, line) => sum + line.net, 0)).toBe(result.net)
    expect(result.gross).toBe(1200)
  })

  it('records the scope it used', () => {
    expect(calculateTax({ country: 'DE', lines }, seller).rounding).toBe('line')
    expect(calculateTax({ country: 'DE', lines }, { ...seller, rounding: 'total' }).rounding).toBe(
      'total',
    )
  })
})

describe('calculateTax, bands and breakdown', () => {
  it('reads the reduced band when a line asks for it', () => {
    const result = calculateTax(
      { country: 'DE', lines: [{ amount: 1000, rateType: 'reduced' }] },
      seller,
    )

    expect(result.lines[0]).toMatchObject({ rate: 7, tax: 70 })
  })

  it('takes a per line rate over the table', () => {
    const result = calculateTax({ country: 'DE', lines: [{ amount: 1000, rate: 5 }] }, seller)

    expect(result.lines[0]).toMatchObject({ rate: 5, rateType: 'custom', tax: 50 })
  })

  it('groups the breakdown by rate, highest first', () => {
    const result = calculateTax(
      {
        country: 'DE',
        lines: [
          { amount: 1000 },
          { amount: 1000, rateType: 'reduced' },
          { amount: 500, rateType: 'reduced' },
        ],
      },
      seller,
    )

    expect(result.breakdown).toEqual([
      { net: 1000, rate: 19, tax: 190 },
      { net: 1500, rate: 7, tax: 105 },
    ])
    expect(result.tax).toBe(295)
  })

  it('echoes a line identifier back', () => {
    const result = calculateTax(
      { country: 'DE', lines: [{ amount: 100, id: 'line-a' }, { amount: 100 }] },
      seller,
    )

    expect(result.lines.map((line) => line.id)).toEqual(['line-a', null])
  })

  it('uses the configured default band for lines that do not say', () => {
    const result = calculateTax(
      { country: 'DE', lines: [{ amount: 1000 }] },
      { ...seller, defaultRateType: 'reduced' },
    )

    expect(result.lines[0]?.rate).toBe(7)
  })
})

describe('calculateTax, refusals', () => {
  it('refuses a fractional amount', () => {
    expect(code(() => calculateTax({ country: 'DE', lines: [{ amount: 10.5 }] }, seller))).toBe(
      'invalid-amount',
    )
  })

  it('refuses an amount that is not a number', () => {
    expect(
      code(() =>
        calculateTax({ country: 'DE', lines: [{ amount: '100' as unknown as number }] }, seller),
      ),
    ).toBe('invalid-amount')
  })

  it('refuses an amount large enough to lose precision', () => {
    expect(
      code(() => calculateTax({ country: 'DE', lines: [{ amount: 2e12 }] }, seller)),
    ).toBe('invalid-amount')
  })

  it('refuses a rate outside nought to a hundred', () => {
    expect(code(() => calculateTax({ country: 'DE', lines: [{ amount: 100, rate: 120 }] }, seller))).toBe(
      'invalid-rate',
    )
    expect(code(() => calculateTax({ country: 'DE', lines: [{ amount: 100, rate: -1 }] }, seller))).toBe(
      'invalid-rate',
    )
  })

  it('refuses an empty set of lines', () => {
    expect(code(() => calculateTax({ country: 'DE', lines: [] }, seller))).toBe('no-lines')
  })

  it('refuses a date it cannot read', () => {
    expect(
      code(() => calculateTax({ country: 'DE', date: 'the first of never', lines: [{ amount: 1 }] }, seller)),
    ).toBe('invalid-date')
  })

  it('refuses an unknown country rather than charging nothing', () => {
    expect(code(() => calculateTax({ lines: [{ amount: 1000 }] }, seller))).toBe('unknown-country')
  })

  it('zero rates an unknown country only when told to, and says so', () => {
    const result = calculateTax(
      { lines: [{ amount: 1000 }] },
      { ...seller, onUnknownCountry: 'zero' },
    )

    expect(result).toMatchObject({ resolved: false, scope: 'unknown', tax: 0 })
    expect(result.note).toContain('could not be determined')
  })

  it('refuses to guess whether a supply is domestic', () => {
    expect(code(() => calculateTax({ country: 'DE', lines: [{ amount: 100 }] }))).toBe(
      'seller-country-required',
    )
  })
})

describe('calculateTax, the numbers the readme prints', () => {
  it('adds 485 to two German lines of 2000 standard and 1500 reduced', () => {
    const result = calculateTax(
      { country: 'DE', lines: [{ amount: 2000 }, { amount: 1500, rateType: 'reduced' }] },
      seller,
    )

    expect(result).toMatchObject({ gross: 3985, net: 3500, tax: 485 })
  })

  it('turns the same call into a reverse charge when a VAT number is added', () => {
    const result = calculateTax(
      {
        country: 'DE',
        lines: [{ amount: 2000 }, { amount: 1500, rateType: 'reduced' }],
        vatNumber: 'DE123456789',
      },
      seller,
    )

    expect(result).toMatchObject({ gross: 3500, reverseCharge: true, tax: 0 })
    expect(result.reverseChargeNote).not.toBeNull()
  })

  it('adds 240 to a Greek 1000 and finds 194 inside the same 1000', () => {
    expect(calculateTax({ country: 'GR', lines: [{ amount: 1000 }] }, seller).tax).toBe(240)
    expect(
      calculateTax({ country: 'GR', lines: [{ amount: 1000 }] }, { ...seller, pricesIncludeTax: true })
        .tax,
    ).toBe(194)
  })

  it('refuses an amount one unit above the ceiling and accepts the ceiling', () => {
    expect(calculateTax({ country: 'DE', lines: [{ amount: 1e12 }] }, seller).net).toBe(1e12)
    expect(code(() => calculateTax({ country: 'DE', lines: [{ amount: 1e12 + 1 }] }, seller))).toBe(
      'invalid-amount',
    )
  })
})

describe('calculateTax, date of supply', () => {
  it('reports the date it applied', () => {
    const result = calculateTax(
      { country: 'DE', date: '2021-03-04T10:00:00.000Z', lines: [{ amount: 100 }] },
      seller,
    )

    expect(result.date).toBe('2021-03-04')
  })

  it('accepts a Date as well as a string', () => {
    const result = calculateTax(
      { country: 'DE', date: new Date('2021-03-04T10:00:00.000Z'), lines: [{ amount: 100 }] },
      seller,
    )

    expect(result.date).toBe('2021-03-04')
  })
})
