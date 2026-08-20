import type { VatNumberFormatResult } from './types.js'

const pattern =
  (expression: RegExp) =>
  (rest: string): boolean =>
    expression.test(rest)

const formats: Record<string, (rest: string) => boolean> = {
  AT: pattern(/^U\d{8}$/),
  BE: pattern(/^[01]\d{9}$/),
  BG: pattern(/^\d{9,10}$/),
  CY: pattern(/^\d{8}[A-Z]$/),
  CZ: pattern(/^\d{8,10}$/),
  DE: pattern(/^\d{9}$/),
  DK: pattern(/^\d{8}$/),
  EE: pattern(/^\d{9}$/),
  EL: pattern(/^\d{9}$/),
  ES: (rest) =>
    /^[A-Z0-9]\d{7}[A-Z0-9]$/.test(rest) && (/^[A-Z]/.test(rest) || /[A-Z]$/.test(rest)),
  FI: pattern(/^\d{8}$/),
  FR: pattern(/^[A-HJ-NP-Z0-9]{2}\d{9}$/),
  HR: pattern(/^\d{11}$/),
  HU: pattern(/^\d{8}$/),
  IE: pattern(/^(\d{7}[A-W]|\d[A-Z*+]\d{5}[A-W]|\d{7}[A-W][AH])$/),
  IT: pattern(/^\d{11}$/),
  LT: pattern(/^(\d{9}|\d{12})$/),
  LU: pattern(/^\d{8}$/),
  LV: pattern(/^\d{11}$/),
  MT: pattern(/^\d{8}$/),
  NL: pattern(/^\d{9}B\d{2}$/),
  PL: pattern(/^\d{10}$/),
  PT: pattern(/^\d{9}$/),
  RO: pattern(/^\d{2,10}$/),
  SE: pattern(/^\d{12}$/),
  SI: pattern(/^\d{8}$/),
  SK: pattern(/^\d{10}$/),
  XI: pattern(/^(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/),
}

/**
 * VAT prefixes the format check knows, as VIES writes them. Greece is 'EL' and
 * Northern Ireland is 'XI'.
 */
export const vatNumberPrefixes: string[] = Object.keys(formats)

const empty = (normalised: string): VatNumberFormatResult => ({
  country: null,
  normalised,
  number: null,
  prefix: null,
  reason: 'empty',
  valid: false,
})

/**
 * Checks the shape of a VAT number against the format its country uses.
 * Offline and instant. A number can be well formed and still not be registered.
 */
export const validateVatNumber = (value: unknown): VatNumberFormatResult => {
  if (typeof value !== 'string') {
    return empty('')
  }

  const normalised = value.toUpperCase().replace(/[\s.\-/]/g, '')

  if (normalised.length === 0) {
    return empty('')
  }

  const head = normalised.slice(0, 2)

  if (!/^[A-Z]{2}$/.test(head)) {
    return {
      country: null,
      normalised,
      number: null,
      prefix: null,
      reason: 'no-country',
      valid: false,
    }
  }

  const prefix = head === 'GR' ? 'EL' : head
  const format = formats[prefix]

  if (!format) {
    return {
      country: null,
      normalised,
      number: null,
      prefix: null,
      reason: 'unsupported-country',
      valid: false,
    }
  }

  const number = normalised.slice(2)
  const valid = format(number)

  return {
    country: prefix === 'EL' ? 'GR' : prefix,
    normalised: `${prefix}${number}`,
    number,
    prefix,
    reason: valid ? null : 'format',
    valid,
  }
}
