import type { PayloadRequest, Where } from 'payload'

import { asRecord } from './stored.js'
import type {
  OssCountryTotal,
  OssPlainTotal,
  OssRateTotal,
  OssReport,
  ResolvedConfig,
} from './types.js'

type Bucket = Map<string, { orders: number; rates: Map<number, OssRateTotal> }>

const number = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

const country = (value: unknown): string =>
  typeof value === 'string' && value.length > 0 ? value : 'unknown'

const rateLines = (group: Record<string, unknown>): OssRateTotal[] => {
  const breakdown = group.breakdown

  if (Array.isArray(breakdown) && breakdown.length > 0) {
    return breakdown.map((entry) => {
      const record = asRecord(entry)

      return {
        rate: number(record.rate),
        taxAmount: number(record.taxAmount),
        taxableBase: number(record.taxableBase),
      }
    })
  }

  return [
    {
      rate: number(group.rate),
      taxAmount: number(group.taxAmount),
      taxableBase: number(group.taxableBase),
    },
  ]
}

const add = (bucket: Bucket, code: string, lines: OssRateTotal[]): void => {
  const existing = bucket.get(code) ?? { orders: 0, rates: new Map<number, OssRateTotal>() }

  existing.orders += 1

  lines.forEach((line) => {
    const current = existing.rates.get(line.rate)

    if (current) {
      current.taxAmount += line.taxAmount
      current.taxableBase += line.taxableBase
    } else {
      existing.rates.set(line.rate, { ...line })
    }
  })

  bucket.set(code, existing)
}

const toCountryTotals = (bucket: Bucket): OssCountryTotal[] =>
  [...bucket.entries()]
    .map(([code, value]) => {
      const rates = [...value.rates.values()].sort((a, b) => b.rate - a.rate)

      return {
        country: code,
        orders: value.orders,
        rates,
        taxAmount: rates.reduce((sum, rate) => sum + rate.taxAmount, 0),
        taxableBase: rates.reduce((sum, rate) => sum + rate.taxableBase, 0),
      }
    })
    .sort((a, b) => a.country.localeCompare(b.country))

const toPlainTotals = (bucket: Bucket): OssPlainTotal[] =>
  toCountryTotals(bucket).map(({ country: code, orders, taxableBase }) => ({
    country: code,
    orders,
    taxableBase,
  }))

const day = (value: Date): string => value.toISOString().slice(0, 10)

export type OssReportArgs = {
  config: ResolvedConfig
  from: Date
  req: PayloadRequest
  to: Date
}

/**
 * Totals per country per period, in the shape an OSS return asks for.
 * Reads the orders through the request, so it stays inside the transaction the
 * request already opened.
 */
export const buildOssReport = async ({
  config,
  from,
  req,
  to,
}: OssReportArgs): Promise<OssReport> => {
  const conditions: Where[] = [
    { [config.datePath]: { greater_than_equal: from.toISOString() } },
    { [config.datePath]: { less_than_equal: to.toISOString() } },
  ]

  if (config.reportStatuses.length > 0) {
    conditions.push({ status: { in: config.reportStatuses } })
  }

  const domestic: Bucket = new Map()
  const oss: Bucket = new Map()
  const reverseCharge: Bucket = new Map()
  const outsideEu: Bucket = new Map()
  const unresolved: (number | string)[] = []

  let orders = 0
  let taxableBase = 0
  let taxAmount = 0
  let page = 1
  let more = true

  while (more) {
    const result = await req.payload.find({
      collection: config.ordersSlug,
      depth: 0,
      limit: config.reportPageSize,
      overrideAccess: true,
      page,
      req,
      sort: config.datePath,
      where: { and: conditions },
    })

    result.docs.forEach((doc) => {
      const record = asRecord(doc)
      const group = asRecord(record[config.fieldName])

      orders += 1

      if (group.resolved !== true) {
        unresolved.push(record.id as number | string)

        return
      }

      const target =
        group.scope === 'domestic'
          ? domestic
          : group.scope === 'intra-eu-b2c'
            ? oss
            : group.scope === 'intra-eu-b2b'
              ? reverseCharge
              : group.scope === 'outside-eu'
                ? outsideEu
                : null

      if (target === null) {
        unresolved.push(record.id as number | string)

        return
      }

      taxableBase += number(group.taxableBase)
      taxAmount += number(group.taxAmount)

      add(target, country(group.country), rateLines(group))
    })

    more = result.hasNextPage === true
    page += 1
  }

  return {
    domestic: toCountryTotals(domestic),
    from: day(from),
    orders,
    oss: toCountryTotals(oss),
    outsideEu: toPlainTotals(outsideEu),
    reverseCharge: toPlainTotals(reverseCharge),
    to: day(to),
    totals: { taxAmount, taxableBase },
    unresolved: { ids: unresolved, orders: unresolved.length },
  }
}
