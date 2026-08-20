import { describe, expect, it } from 'vitest'

import { validateVatNumber, vatNumberPrefixes } from '../src/vat-number.js'

const wellFormed: [string, string][] = [
  ['AT', 'ATU12345678'],
  ['BE', 'BE0123456789'],
  ['BG', 'BG123456789'],
  ['CY', 'CY12345678L'],
  ['CZ', 'CZ12345678'],
  ['DE', 'DE123456789'],
  ['DK', 'DK12345678'],
  ['EE', 'EE123456789'],
  ['EL', 'EL123456789'],
  ['ES', 'ESA1234567Z'],
  ['FI', 'FI12345678'],
  ['FR', 'FRXX123456789'],
  ['HR', 'HR12345678901'],
  ['HU', 'HU12345678'],
  ['IE', 'IE1234567A'],
  ['IT', 'IT12345678901'],
  ['LT', 'LT123456789'],
  ['LU', 'LU12345678'],
  ['LV', 'LV12345678901'],
  ['MT', 'MT12345678'],
  ['NL', 'NL123456789B01'],
  ['PL', 'PL1234567890'],
  ['PT', 'PT123456789'],
  ['RO', 'RO1234567890'],
  ['SE', 'SE123456789012'],
  ['SI', 'SI12345678'],
  ['SK', 'SK1234567890'],
  ['XI', 'XI123456789'],
]

const malformed: [string, string][] = [
  ['AT', 'AT12345678'],
  ['BE', 'BE2123456789'],
  ['BG', 'BG12345678'],
  ['CY', 'CY123456789'],
  ['CZ', 'CZ1234567'],
  ['DE', 'DE12345678'],
  ['DK', 'DK1234567'],
  ['EE', 'EE12345678'],
  ['EL', 'EL12345678'],
  ['ES', 'ES123456789'],
  ['FI', 'FI123456789'],
  ['FR', 'FRIO123456789'],
  ['HR', 'HR1234567890'],
  ['HU', 'HU123456789'],
  ['IE', 'IE1234567Z'],
  ['IT', 'IT1234567890'],
  ['LT', 'LT1234567890'],
  ['LU', 'LU123456789'],
  ['LV', 'LV1234567890'],
  ['MT', 'MT123456789'],
  ['NL', 'NL123456789012'],
  ['PL', 'PL123456789'],
  ['PT', 'PT12345678'],
  ['RO', 'RO1'],
  ['SE', 'SE12345678901'],
  ['SI', 'SI123456789'],
  ['SK', 'SK123456789'],
  ['XI', 'XI1234567'],
]

describe('validateVatNumber, well formed numbers', () => {
  it.each(wellFormed)('accepts a %s number', (_prefix, value) => {
    expect(validateVatNumber(value).valid).toBe(true)
  })

  it('covers every prefix the package claims to know', () => {
    expect(wellFormed.map(([prefix]) => prefix).sort()).toEqual([...vatNumberPrefixes].sort())
  })
})

describe('validateVatNumber, malformed numbers', () => {
  it.each(malformed)('refuses a wrong %s number', (_prefix, value) => {
    const result = validateVatNumber(value)

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('format')
  })
})

describe('validateVatNumber, country specific shapes', () => {
  it('accepts either of the Spanish letter positions and refuses neither', () => {
    expect(validateVatNumber('ESA1234567Z').valid).toBe(true)
    expect(validateVatNumber('ES12345678Z').valid).toBe(true)
    expect(validateVatNumber('ESA12345678').valid).toBe(true)
    expect(validateVatNumber('ES123456789').valid).toBe(false)
  })

  it('accepts all three Irish shapes', () => {
    expect(validateVatNumber('IE1234567A').valid).toBe(true)
    expect(validateVatNumber('IE1A23456B').valid).toBe(true)
    expect(validateVatNumber('IE1234567AH').valid).toBe(true)
  })

  it('keeps the letter I and the letter O out of a French number', () => {
    expect(validateVatNumber('FR2I123456789').valid).toBe(false)
    expect(validateVatNumber('FR2O123456789').valid).toBe(false)
    expect(validateVatNumber('FR2A123456789').valid).toBe(true)
  })

  it('wants the B in the middle of a Dutch number', () => {
    expect(validateVatNumber('NL123456789B01').valid).toBe(true)
    expect(validateVatNumber('NL123456789C01').valid).toBe(false)
  })

  it('accepts both Lithuanian lengths and nothing between them', () => {
    expect(validateVatNumber('LT123456789').valid).toBe(true)
    expect(validateVatNumber('LT123456789012').valid).toBe(true)
    expect(validateVatNumber('LT12345678901').valid).toBe(false)
  })

  it('accepts the Northern Ireland government and health authority shapes', () => {
    expect(validateVatNumber('XIGD123').valid).toBe(true)
    expect(validateVatNumber('XIHA123').valid).toBe(true)
    expect(validateVatNumber('XI123456789012').valid).toBe(true)
  })

  it('accepts a Romanian number of any length from two to ten digits', () => {
    expect(validateVatNumber('RO12').valid).toBe(true)
    expect(validateVatNumber('RO1234567890').valid).toBe(true)
    expect(validateVatNumber('RO12345678901').valid).toBe(false)
  })
})

describe('validateVatNumber, Greece', () => {
  it('accepts the EL prefix and reports the ISO country', () => {
    const result = validateVatNumber('EL123456789')

    expect(result).toMatchObject({ country: 'GR', prefix: 'EL', valid: true })
  })

  it('accepts the GR prefix and rewrites it to EL for VIES', () => {
    const result = validateVatNumber('GR123456789')

    expect(result).toMatchObject({ country: 'GR', normalised: 'EL123456789', prefix: 'EL' })
  })
})

describe('validateVatNumber, normalisation and refusals', () => {
  it('ignores spaces, dots, slashes and hyphens', () => {
    expect(validateVatNumber(' de 123.456-789 ').normalised).toBe('DE123456789')
    expect(validateVatNumber('de/123456789').valid).toBe(true)
  })

  it('uppercases a lower case number', () => {
    expect(validateVatNumber('atu12345678').valid).toBe(true)
  })

  it('reports an empty value as empty', () => {
    expect(validateVatNumber('').reason).toBe('empty')
    expect(validateVatNumber('   ').reason).toBe('empty')
  })

  it('reports anything that is not a string as empty', () => {
    expect(validateVatNumber(undefined).reason).toBe('empty')
    expect(validateVatNumber(123456789).reason).toBe('empty')
  })

  it('reports a missing country prefix', () => {
    expect(validateVatNumber('123456789').reason).toBe('no-country')
  })

  it('reports a country it has no format for', () => {
    expect(validateVatNumber('US123456789').reason).toBe('unsupported-country')
    expect(validateVatNumber('CH123456789').reason).toBe('unsupported-country')
  })

  it('splits the prefix from the number', () => {
    expect(validateVatNumber('DE123456789')).toMatchObject({
      number: '123456789',
      prefix: 'DE',
      reason: null,
    })
  })
})
