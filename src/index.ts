import type { Config } from 'payload'

import { resolveConfig } from './config.js'
import { taxEndpoints } from './endpoints.js'
import { taxField } from './fields.js'
import { recordTax } from './hooks.js'
import type { TaxEuConfig } from './types.js'

export { calculateTax } from './calculate.js'
export { adminOnly, resolveConfig } from './config.js'
export { TaxError } from './errors.js'
export type { TaxErrorCode } from './errors.js'
export { taxField, taxScopeOptions, vatNumberCheckOptions } from './fields.js'
export { recordTax } from './hooks.js'
export { defaultReverseChargeNote, resolveTaxOptions } from './options.js'
export {
  euCountries,
  euVatRates,
  euVatRatesUpdated,
  isEuCountry,
  lookupRate,
  normaliseCountry,
} from './rates.js'
export { buildOssReport } from './report.js'
export { taxEndpoints } from './endpoints.js'
export { validateVatNumber, vatNumberPrefixes } from './vat-number.js'
export { checkVatNumber, defaultViesEndpoint } from './vies.js'
export type {
  OssCountryTotal,
  OssPlainTotal,
  OssRateTotal,
  OssReport,
  PlaceOfSupply,
  ResolvedConfig,
  SupplyScope,
  TaxAccess,
  TaxCalculation,
  TaxCalculationInput,
  TaxCalculationOptions,
  TaxEuConfig,
  TaxLineInput,
  TaxLineResult,
  TaxRateTotal,
  TaxRounding,
  UnknownCountryBehaviour,
  VatNumberCheckResult,
  VatNumberFormatResult,
  VatRateEntry,
  VatRateLookup,
  VatRateType,
  ViesOptions,
  ViesOutcome,
} from './types.js'

export const taxEuPlugin =
  (incoming: TaxEuConfig = {}) =>
  (incomingConfig: Config): Config => {
    const config = resolveConfig(incoming)
    const collections = incomingConfig.collections ?? []
    const orders = collections.find((collection) => collection.slug === config.ordersSlug)

    if (!orders) {
      return incomingConfig
    }

    const endpoints = taxEndpoints(config)

    return {
      ...incomingConfig,
      collections: collections.map((collection) => {
        if (collection.slug !== config.ordersSlug) {
          return collection
        }

        const hooks = collection.hooks ?? {}

        return {
          ...collection,
          fields: [...collection.fields, taxField(config)],
          hooks: {
            ...hooks,
            beforeChange: [...(hooks.beforeChange ?? []), recordTax(config)],
          },
        }
      }),
      ...(endpoints.length > 0
        ? { endpoints: [...(incomingConfig.endpoints ?? []), ...endpoints] }
        : {}),
    }
  }
