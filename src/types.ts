import type { PayloadRequest } from 'payload'

export type VatRateType = 'reduced' | 'secondReduced' | 'standard' | 'superReduced' | 'zero'

export type TaxRounding = 'line' | 'total'

export type PlaceOfSupply = 'destination' | 'origin'

export type UnknownCountryBehaviour = 'error' | 'zero'

export type SupplyScope = 'domestic' | 'intra-eu-b2b' | 'intra-eu-b2c' | 'outside-eu' | 'unknown'

export type VatRateEntry = {
  /**
   * ISO 3166-1 alpha-2 country code. Greece is 'GR', not 'EL'.
   */
  country: string
  /**
   * First day the entry applies, as an ISO date such as '2025-07-01'.
   * Absent means the entry has always applied.
   */
  from?: string
  /**
   * Reduced rates as percentages, most used first. 'reduced' reads the first
   * entry, 'secondReduced' the second.
   */
  reduced?: number[]
  /**
   * Standard rate as a percentage, for example 24 for 24 per cent.
   */
  standard: number
  /**
   * Super reduced rate as a percentage, where the country has one.
   */
  superReduced?: number
  /**
   * Last day the entry applies, as an ISO date. Absent means it still applies.
   */
  to?: string
}

export type VatRateLookup = {
  country: string
  entry: VatRateEntry
  rate: number
  type: VatRateType
}

export type TaxLineInput = {
  /**
   * Line total in integer minor units, quantity already applied.
   * 1234 is 12.34 in a currency with two decimals.
   */
  amount: number
  /**
   * Identifier echoed back on the matching result line.
   */
  id?: string
  /**
   * Rate as a percentage for this line, bypassing the rate table.
   */
  rate?: number
  /**
   * Which band of the rate table applies. Defaults to the configured
   * `defaultRateType`.
   */
  rateType?: VatRateType
}

export type TaxLineResult = {
  gross: number
  id: null | string
  net: number
  rate: number
  rateType: 'custom' | VatRateType
  tax: number
}

export type TaxRateTotal = {
  net: number
  rate: number
  tax: number
}

export type TaxCalculationInput = {
  /**
   * Customer country as an ISO 3166-1 alpha-2 code. 'EL' is accepted for Greece
   * and normalised to 'GR'.
   */
  country?: null | string
  /**
   * Date of supply, deciding which version of a rate applies.
   * Defaults to the current date.
   */
  date?: Date | string
  lines: TaxLineInput[]
  /**
   * Customer VAT number. Its format is checked unless `vatNumberValid` is given.
   */
  vatNumber?: null | string
  /**
   * Result of a validation you already performed, for example a VIES check.
   * Overrides the offline format check.
   */
  vatNumberValid?: boolean
}

export type TaxCalculation = {
  breakdown: TaxRateTotal[]
  /**
   * Country whose rate was applied. Not always the customer country: origin
   * place of supply applies the seller country.
   */
  country: null | string
  /**
   * ISO date used for the rate lookup.
   */
  date: string
  /**
   * Customer country as given, normalised.
   */
  destination: null | string
  gross: number
  lines: TaxLineResult[]
  net: number
  /**
   * Why the result is what it is, when it is not a plain rated supply.
   */
  note: null | string
  pricesIncludeTax: boolean
  reverseCharge: boolean
  /**
   * Wording the invoice has to carry when reverse charge applies.
   */
  reverseChargeNote: null | string
  /**
   * False when the place of supply could not be determined and the calculation
   * fell back to zero.
   */
  resolved: boolean
  rounding: TaxRounding
  scope: SupplyScope
  tax: number
  vatNumber: null | string
  vatNumberValid: boolean
}

export type TaxCalculationOptions = {
  defaultRateType?: VatRateType
  onUnknownCountry?: UnknownCountryBehaviour
  placeOfSupply?: PlaceOfSupply
  pricesIncludeTax?: boolean
  rates?: VatRateEntry[]
  reverseChargeNote?: string
  rounding?: TaxRounding
  sellerCountry?: string
  useBuiltInRates?: boolean
}

export type ResolvedTaxOptions = {
  defaultRateType: VatRateType
  onUnknownCountry: UnknownCountryBehaviour
  placeOfSupply: PlaceOfSupply
  pricesIncludeTax: boolean
  rates: VatRateEntry[]
  reverseChargeNote: string
  rounding: TaxRounding
  sellerCountry: string
  useBuiltInRates: boolean
}

export type ViesOutcome = 'invalid' | 'skipped' | 'unavailable' | 'valid'

export type VatNumberFormatReason =
  | 'empty'
  | 'format'
  | 'no-country'
  | 'unsupported-country'

export type VatNumberFormatResult = {
  /**
   * ISO 3166-1 alpha-2 country. Greek numbers report 'GR' while carrying the
   * 'EL' prefix.
   */
  country: null | string
  /**
   * Uppercased input with spaces, dots, slashes and hyphens removed.
   */
  normalised: string
  /**
   * The number without its country prefix.
   */
  number: null | string
  /**
   * VAT prefix as VIES expects it, 'EL' for Greece.
   */
  prefix: null | string
  reason: null | VatNumberFormatReason
  valid: boolean
}

export type ViesOptions = {
  /**
   * Performs the network call. Off by default.
   */
  enabled?: boolean
  /**
   * URL template. '{country}' and '{number}' are replaced.
   */
  endpoint?: string
  /**
   * Replacement for the global fetch, for tests and for proxies.
   */
  fetch?: null | typeof globalThis.fetch
  /**
   * Milliseconds before the call is abandoned and the check falls back to the
   * format result. Defaults to 3000.
   */
  timeoutMs?: number
}

export type ResolvedViesOptions = {
  enabled: boolean
  endpoint: string
  fetch: null | typeof globalThis.fetch
  timeoutMs: number
  useInQuote: boolean
}

export type VatNumberCheckResult = {
  /**
   * The answer to act on. A VIES outage never turns a sale away: an
   * unreachable service leaves this at the format result.
   */
  accepted: boolean
  address: null | string
  format: VatNumberFormatResult
  name: null | string
  online: ViesOutcome
}

export type OssRateTotal = {
  rate: number
  taxAmount: number
  taxableBase: number
}

export type OssCountryTotal = {
  country: string
  orders: number
  rates: OssRateTotal[]
  taxAmount: number
  taxableBase: number
}

export type OssPlainTotal = {
  country: string
  orders: number
  taxableBase: number
}

export type OssReport = {
  /**
   * Supplies in your own country. They belong in the national return, not in
   * the OSS return.
   */
  domestic: OssCountryTotal[]
  from: string
  orders: number
  /**
   * Cross border business to consumer supplies, the OSS return itself.
   */
  oss: OssCountryTotal[]
  /**
   * Supplies outside the EU.
   */
  outsideEu: OssPlainTotal[]
  /**
   * Zero rated business to business supplies. They belong in the
   * recapitulative statement, not in the OSS return.
   */
  reverseCharge: OssPlainTotal[]
  to: string
  totals: {
    taxAmount: number
    taxableBase: number
  }
  /**
   * Orders whose place of supply could not be determined. Nothing is hidden:
   * fix these before you file.
   */
  unresolved: {
    ids: (number | string)[]
    orders: number
  }
}

export type TaxAccess = (req: PayloadRequest) => boolean | Promise<boolean>

export type TaxEuConfig = TaxCalculationOptions & {
  /**
   * Dot path to the order total, read by the hook. Defaults to 'amount'.
   */
  amountPath?: string
  /**
   * Dot path to the customer country on the order.
   * Defaults to 'shippingAddress.country'.
   */
  countryPath?: string
  /**
   * Dot path to the date of supply on the order. Defaults to 'createdAt'.
   */
  datePath?: string
  /**
   * Stops the hook from writing anything while leaving the fields in place, so
   * that an existing database keeps its shape.
   */
  disabled?: boolean
  /**
   * Mounts the quote endpoint. Defaults to true.
   */
  quoteEndpoint?: boolean
  /**
   * Who may call the quote endpoint. Defaults to everyone: it is arithmetic on
   * numbers the caller supplied and reads nothing from the database.
   */
  quoteEndpointAccess?: TaxAccess
  /**
   * Name of the group field holding the breakdown. Defaults to 'tax'.
   */
  fieldName?: string
  /**
   * Slug of the orders collection. Defaults to 'orders'.
   */
  ordersSlug?: string
  /**
   * Mounts the OSS report endpoint. Defaults to true.
   */
  reportEndpoint?: boolean
  /**
   * Who may call the OSS report endpoint. Defaults to a user whose `roles`
   * array contains 'admin'.
   */
  reportEndpointAccess?: TaxAccess
  /**
   * How many orders the report reads per page. Defaults to 500.
   */
  reportPageSize?: number
  /**
   * Order statuses counted by the report. Defaults to processing and
   * completed. An empty array counts every status.
   */
  reportStatuses?: string[]
  /**
   * Path the endpoints are mounted under, below the Payload API route.
   * Defaults to '/tax'.
   */
  routePrefix?: string
  /**
   * Dot path to the customer VAT number on the order.
   * Defaults to '<fieldName>.vatNumber'.
   */
  vatNumberPath?: string
  /**
   * Online VIES validation. Off by default, and a network call when on.
   */
  vies?: ViesOptions & {
    /**
     * Lets the quote endpoint call VIES too. Off by default, because the quote
     * endpoint is public.
     */
    useInQuote?: boolean
  }
}

export type ResolvedConfig = ResolvedTaxOptions & {
  amountPath: string
  countryPath: string
  datePath: string
  disabled: boolean
  fieldName: string
  ordersSlug: string
  quoteEndpoint: boolean
  quoteEndpointAccess: TaxAccess
  reportEndpoint: boolean
  reportEndpointAccess: TaxAccess
  reportPageSize: number
  reportStatuses: string[]
  routePrefix: string
  vatNumberPath: string
  vies: ResolvedViesOptions
}
