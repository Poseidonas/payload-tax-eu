import { TaxError } from './errors.js'
import { divideRound, isMinorUnits, shareOut } from './money.js'
import { resolveTaxOptions } from './options.js'
import { effectiveRates, lookupRate, toDate } from './rates.js'
import { resolveSupply } from './supply.js'
import type {
  TaxCalculation,
  TaxCalculationInput,
  TaxCalculationOptions,
  TaxLineResult,
  TaxRateTotal,
  VatRateType,
} from './types.js'

const maxMinorUnits = 1_000_000_000_000

const assertAmount = (value: unknown, what: string): number => {
  if (!isMinorUnits(value) || Math.abs(value) > maxMinorUnits) {
    throw new TaxError(
      'invalid-amount',
      `${what} must be an integer in minor units, not ${String(value)}.`,
    )
  }

  return value
}

const basisPoints = (rate: number): number => {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new TaxError('invalid-rate', `A VAT rate of ${String(rate)} is not usable.`)
  }

  return Math.round(rate * 100)
}

type Prepared = {
  amount: number
  id: null | string
  rate: number
  rateType: 'custom' | VatRateType
}

/**
 * Works out VAT for a set of lines. Every amount is an integer in minor units
 * and stays one: nothing is ever held as a fraction.
 *
 * Throws a `TaxError` rather than guessing when the place of supply or the rate
 * cannot be established.
 */
export const calculateTax = (
  input: TaxCalculationInput,
  options: TaxCalculationOptions = {},
): TaxCalculation => {
  const resolved = resolveTaxOptions(options)
  const lines = Array.isArray(input.lines) ? input.lines : []

  if (lines.length === 0) {
    throw new TaxError('no-lines', 'At least one line is needed to work out VAT.')
  }

  const date = toDate(input.date)
  const supply = resolveSupply(input, resolved)
  const rates = effectiveRates(resolved.rates, resolved.useBuiltInRates)
  const country = supply.country

  const prepared: Prepared[] = lines.map((line, index) => {
    const amount = assertAmount(line.amount, `Line ${index} amount`)
    const id = typeof line.id === 'string' ? line.id : null

    if (supply.zeroRated) {
      return { amount, id, rate: 0, rateType: 'zero' }
    }

    if (line.rate !== undefined) {
      return { amount, id, rate: line.rate, rateType: 'custom' }
    }

    const rateType = line.rateType ?? resolved.defaultRateType

    if (country === null) {
      throw new TaxError('unknown-country', 'No country to read a VAT rate for.')
    }

    return { amount, id, rate: lookupRate(rates, country, rateType, date).rate, rateType }
  })

  const groups = new Map<number, number[]>()

  prepared.forEach((line, index) => {
    const bp = basisPoints(line.rate)
    const members = groups.get(bp)

    if (members) {
      members.push(index)
    } else {
      groups.set(bp, [index])
    }
  })

  const nets: number[] = new Array<number>(prepared.length).fill(0)
  const taxes: number[] = new Array<number>(prepared.length).fill(0)

  groups.forEach((members, bp) => {
    const amounts = members.map((index) => prepared[index]?.amount ?? 0)
    const total = assertAmount(
      amounts.reduce((sum, value) => sum + value, 0),
      'A rate group total',
    )

    if (resolved.pricesIncludeTax) {
      if (resolved.rounding === 'total') {
        const groupNet = divideRound(total * 10_000, 10_000 + bp)
        const shares = shareOut(
          amounts.map((amount) => amount * 10_000),
          10_000 + bp,
          groupNet,
        )

        members.forEach((index, position) => {
          const net = shares[position] ?? 0

          nets[index] = net
          taxes[index] = (amounts[position] ?? 0) - net
        })

        return
      }

      members.forEach((index, position) => {
        const gross = amounts[position] ?? 0
        const net = divideRound(gross * 10_000, 10_000 + bp)

        nets[index] = net
        taxes[index] = gross - net
      })

      return
    }

    if (resolved.rounding === 'total') {
      const groupTax = divideRound(total * bp, 10_000)
      const shares = shareOut(
        amounts.map((amount) => amount * bp),
        10_000,
        groupTax,
      )

      members.forEach((index, position) => {
        nets[index] = amounts[position] ?? 0
        taxes[index] = shares[position] ?? 0
      })

      return
    }

    members.forEach((index, position) => {
      const net = amounts[position] ?? 0

      nets[index] = net
      taxes[index] = divideRound(net * bp, 10_000)
    })
  })

  const results: TaxLineResult[] = prepared.map((line, index) => {
    const net = nets[index] ?? 0
    const tax = taxes[index] ?? 0

    return { gross: net + tax, id: line.id, net, rate: line.rate, rateType: line.rateType, tax }
  })

  const byRate = new Map<number, TaxRateTotal>()

  results.forEach((line) => {
    const current = byRate.get(line.rate)

    if (current) {
      current.net += line.net
      current.tax += line.tax
    } else {
      byRate.set(line.rate, { net: line.net, rate: line.rate, tax: line.tax })
    }
  })

  const net = results.reduce((sum, line) => sum + line.net, 0)
  const tax = results.reduce((sum, line) => sum + line.tax, 0)

  return {
    breakdown: [...byRate.values()].sort((a, b) => b.rate - a.rate),
    country: supply.country,
    date: date.toISOString().slice(0, 10),
    destination: supply.destination,
    gross: net + tax,
    lines: results,
    net,
    note: supply.note,
    pricesIncludeTax: resolved.pricesIncludeTax,
    resolved: supply.resolved,
    reverseCharge: supply.reverseCharge,
    reverseChargeNote: supply.reverseChargeNote,
    rounding: resolved.rounding,
    scope: supply.scope,
    tax,
    vatNumber: supply.vatNumber,
    vatNumberValid: supply.vatNumberValid,
  }
}
