import { TaxError } from './errors.js'
import { isEuCountry, normaliseCountry } from './rates.js'
import type { ResolvedTaxOptions, SupplyScope, TaxCalculationInput } from './types.js'
import { validateVatNumber } from './vat-number.js'

export type SupplyResolution = {
  country: null | string
  destination: null | string
  note: null | string
  resolved: boolean
  reverseCharge: boolean
  reverseChargeNote: null | string
  scope: SupplyScope
  vatNumber: null | string
  vatNumberValid: boolean
  zeroRated: boolean
}

export const resolveSupply = (
  input: TaxCalculationInput,
  options: ResolvedTaxOptions,
): SupplyResolution => {
  const destination = normaliseCountry(input.country)
  const raw = typeof input.vatNumber === 'string' ? input.vatNumber.trim() : ''
  const vatNumber = raw.length > 0 ? raw : null
  const format = vatNumber === null ? null : validateVatNumber(vatNumber)
  const vatNumberValid =
    typeof input.vatNumberValid === 'boolean' ? input.vatNumberValid : (format?.valid ?? false)

  const base = {
    vatNumber: format?.normalised ?? vatNumber,
    vatNumberValid,
  }

  if (destination === null) {
    if (options.onUnknownCountry === 'error') {
      throw new TaxError(
        'unknown-country',
        'No usable country of supply. Give an ISO 3166-1 alpha-2 code, or set onUnknownCountry to zero.',
      )
    }

    return {
      ...base,
      country: null,
      destination: null,
      note: 'Place of supply could not be determined. No tax was applied.',
      resolved: false,
      reverseCharge: false,
      reverseChargeNote: null,
      scope: 'unknown',
      zeroRated: true,
    }
  }

  if (!isEuCountry(destination)) {
    return {
      ...base,
      country: destination,
      destination,
      note: 'Outside the EU VAT area. No EU VAT was applied.',
      resolved: true,
      reverseCharge: false,
      reverseChargeNote: null,
      scope: 'outside-eu',
      zeroRated: true,
    }
  }

  const seller = normaliseCountry(options.sellerCountry)

  if (seller === null) {
    throw new TaxError(
      'seller-country-required',
      'Set sellerCountry. It decides a domestic supply from a cross border one.',
    )
  }

  if (destination === seller) {
    return {
      ...base,
      country: seller,
      destination,
      note:
        vatNumberValid && vatNumber !== null
          ? 'Domestic supply. Reverse charge does not apply inside one member state.'
          : null,
      resolved: true,
      reverseCharge: false,
      reverseChargeNote: null,
      scope: 'domestic',
      zeroRated: false,
    }
  }

  const registeredElsewhere =
    vatNumber !== null &&
    vatNumberValid &&
    format !== null &&
    format.country !== null &&
    format.country !== seller

  if (registeredElsewhere) {
    return {
      ...base,
      country: destination,
      destination,
      note: null,
      resolved: true,
      reverseCharge: true,
      reverseChargeNote: options.reverseChargeNote,
      scope: 'intra-eu-b2b',
      zeroRated: true,
    }
  }

  return {
    ...base,
    country: options.placeOfSupply === 'origin' ? seller : destination,
    destination,
    note:
      vatNumber !== null && !vatNumberValid
        ? 'The VAT number did not pass validation, so the supply was rated as business to consumer.'
        : null,
    resolved: true,
    reverseCharge: false,
    reverseChargeNote: null,
    scope: 'intra-eu-b2c',
    zeroRated: false,
  }
}
