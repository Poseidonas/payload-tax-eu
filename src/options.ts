import type {
  PlaceOfSupply,
  ResolvedTaxOptions,
  TaxCalculationOptions,
  TaxRounding,
  UnknownCountryBehaviour,
  VatRateType,
} from './types.js'

export const defaultReverseChargeNote = 'Reverse charge. VAT to be accounted for by the recipient.'

const rateTypes: VatRateType[] = ['reduced', 'secondReduced', 'standard', 'superReduced', 'zero']

const oneOf = <T extends string>(value: unknown, allowed: T[], fallback: T): T =>
  typeof value === 'string' && (allowed as string[]).includes(value) ? (value as T) : fallback

export const resolveTaxOptions = (incoming: TaxCalculationOptions = {}): ResolvedTaxOptions => ({
  defaultRateType: oneOf<VatRateType>(incoming.defaultRateType, rateTypes, 'standard'),
  onUnknownCountry: oneOf<UnknownCountryBehaviour>(
    incoming.onUnknownCountry,
    ['error', 'zero'],
    'error',
  ),
  placeOfSupply: oneOf<PlaceOfSupply>(incoming.placeOfSupply, ['destination', 'origin'], 'destination'),
  pricesIncludeTax: incoming.pricesIncludeTax === true,
  rates: Array.isArray(incoming.rates) ? incoming.rates : [],
  reverseChargeNote:
    typeof incoming.reverseChargeNote === 'string' && incoming.reverseChargeNote.length > 0
      ? incoming.reverseChargeNote
      : defaultReverseChargeNote,
  rounding: oneOf<TaxRounding>(incoming.rounding, ['line', 'total'], 'line'),
  sellerCountry: typeof incoming.sellerCountry === 'string' ? incoming.sellerCountry : '',
  useBuiltInRates: incoming.useBuiltInRates !== false,
})
