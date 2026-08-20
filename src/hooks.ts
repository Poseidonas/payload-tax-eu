import type { CollectionBeforeChangeHook } from 'payload'

import { calculateTax } from './calculate.js'
import { TaxError } from './errors.js'
import { asRecord, isRecorded, readPath, toStoredTax, unresolvedTax } from './stored.js'
import type { ResolvedConfig, VatNumberCheckResult } from './types.js'
import { checkVatNumber } from './vies.js'

/**
 * Writes the VAT breakdown onto a new order. It never touches the order total:
 * what was charged is decided at checkout, and this is the record of how the
 * charge splits.
 */
export const recordTax =
  (config: ResolvedConfig): CollectionBeforeChangeHook =>
  async ({ data, operation, req }) => {
    if (config.disabled || operation !== 'create') {
      return data
    }

    const group = asRecord(data[config.fieldName])

    if (isRecorded(group)) {
      return data
    }

    const amount = readPath(data, config.amountPath)
    const rawVatNumber = readPath(data, config.vatNumberPath)
    const vatNumber = typeof rawVatNumber === 'string' && rawVatNumber.length > 0 ? rawVatNumber : null

    const write = (value: Record<string, unknown>): Record<string, unknown> => ({
      ...data,
      [config.fieldName]: { ...group, ...value },
    })

    if (typeof amount !== 'number' || !Number.isSafeInteger(amount)) {
      return write(
        unresolvedTax(
          'No order total in minor units to work from.',
          0,
          config.pricesIncludeTax,
          vatNumber,
        ),
      )
    }

    let check: null | VatNumberCheckResult = null

    if (vatNumber !== null && config.vies.enabled) {
      check = await checkVatNumber(vatNumber, config.vies)
    }

    const date = readPath(data, config.datePath)

    try {
      const calculation = calculateTax(
        {
          country: (readPath(data, config.countryPath) as null | string | undefined) ?? null,
          lines: [{ amount }],
          ...(typeof date === 'string' || date instanceof Date ? { date } : {}),
          vatNumber,
          ...(check === null ? {} : { vatNumberValid: check.accepted }),
        },
        config,
      )

      return write({ ...toStoredTax(calculation, check) })
    } catch (error) {
      if (!(error instanceof TaxError)) {
        throw error
      }

      req.payload.logger.error(`payload-tax-eu: ${error.code}, ${error.message}`)

      return write(unresolvedTax(error.message, amount, config.pricesIncludeTax, vatNumber))
    }
  }
