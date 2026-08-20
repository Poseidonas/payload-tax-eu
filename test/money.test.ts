import { describe, expect, it } from 'vitest'

import { divideRound, isMinorUnits, shareOut } from '../src/money.js'

describe('isMinorUnits', () => {
  it('accepts whole numbers only', () => {
    expect(isMinorUnits(1234)).toBe(true)
    expect(isMinorUnits(0)).toBe(true)
    expect(isMinorUnits(-1234)).toBe(true)
  })

  it('refuses fractions, text and nothing', () => {
    expect(isMinorUnits(12.34)).toBe(false)
    expect(isMinorUnits('1234')).toBe(false)
    expect(isMinorUnits(undefined)).toBe(false)
    expect(isMinorUnits(Number.NaN)).toBe(false)
  })
})

describe('divideRound', () => {
  it('rounds a half away from zero', () => {
    expect(divideRound(5, 10)).toBe(1)
    expect(divideRound(-5, 10)).toBe(-1)
    expect(divideRound(25, 10)).toBe(3)
    expect(divideRound(-25, 10)).toBe(-3)
  })

  it('rounds below a half down', () => {
    expect(divideRound(4, 10)).toBe(0)
    expect(divideRound(-4, 10)).toBe(0)
  })

  it('never hands back a negative zero', () => {
    expect(Object.is(divideRound(-4, 10), -0)).toBe(false)
  })

  it('returns exact divisions untouched', () => {
    expect(divideRound(2400, 100)).toBe(24)
    expect(divideRound(0, 10_000)).toBe(0)
  })
})

describe('shareOut', () => {
  it('gives every unit of the total to a line', () => {
    const shares = shareOut([632_700, 632_700, 632_700], 10_000, 190)

    expect(shares).toEqual([64, 63, 63])
    expect(shares.reduce((sum, value) => sum + value, 0)).toBe(190)
  })

  it('adds nothing when the floors already add up', () => {
    expect(shareOut([200_000, 100_000], 10_000, 30)).toEqual([20, 10])
  })

  it('prefers the largest remainder, then the earliest line', () => {
    expect(shareOut([19_000, 11_000], 10_000, 3)).toEqual([2, 1])
  })
})
