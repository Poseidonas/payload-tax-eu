import { describe, expect, it } from 'vitest'

import { resolveConfig } from '../src/config.js'
import { buildOssReport } from '../src/report.js'
import { fakeRequest, type FindCall, order, pagedFind } from './helpers.js'

const config = resolveConfig({ sellerCountry: 'GR' })
const from = new Date('2026-01-01T00:00:00.000Z')
const to = new Date('2026-03-31T23:59:59.999Z')

const rated = (
  country: string,
  scope: string,
  taxableBase: number,
  taxAmount: number,
  rate: number,
): Record<string, unknown> => ({
  breakdown: [{ rate, taxAmount, taxableBase }],
  country,
  rate,
  resolved: true,
  reverseCharge: scope === 'intra-eu-b2b',
  scope,
  taxAmount,
  taxableBase,
})

const build = async (pages: Record<string, unknown>[][], calls: FindCall[] = []) =>
  buildOssReport({
    config,
    from,
    req: fakeRequest({}, [], pagedFind(pages, calls)),
    to,
  })

describe('buildOssReport', () => {
  it('adds up cross border sales by country', async () => {
    const report = await build([
      [
        order(1, rated('DE', 'intra-eu-b2c', 1000, 190, 19)),
        order(2, rated('DE', 'intra-eu-b2c', 2000, 380, 19)),
        order(3, rated('FR', 'intra-eu-b2c', 500, 100, 20)),
      ],
    ])

    expect(report.oss).toEqual([
      {
        country: 'DE',
        orders: 2,
        rates: [{ rate: 19, taxAmount: 570, taxableBase: 3000 }],
        taxAmount: 570,
        taxableBase: 3000,
      },
      {
        country: 'FR',
        orders: 1,
        rates: [{ rate: 20, taxAmount: 100, taxableBase: 500 }],
        taxAmount: 100,
        taxableBase: 500,
      },
    ])
  })

  it('keeps every rate of a country apart, highest first', async () => {
    const report = await build([
      [
        order(1, {
          breakdown: [
            { rate: 7, taxAmount: 70, taxableBase: 1000 },
            { rate: 19, taxAmount: 190, taxableBase: 1000 },
          ],
          country: 'DE',
          resolved: true,
          scope: 'intra-eu-b2c',
          taxAmount: 260,
          taxableBase: 2000,
        }),
      ],
    ])

    expect(report.oss[0]?.rates.map((entry) => entry.rate)).toEqual([19, 7])
  })

  it('keeps home sales out of the OSS return', async () => {
    const report = await build([[order(1, rated('GR', 'domestic', 1000, 240, 24))]])

    expect(report.oss).toEqual([])
    expect(report.domestic[0]).toMatchObject({ country: 'GR', taxAmount: 240 })
  })

  it('keeps reverse charge sales out of the OSS return', async () => {
    const report = await build([[order(1, rated('DE', 'intra-eu-b2b', 5000, 0, 0))]])

    expect(report.oss).toEqual([])
    expect(report.reverseCharge).toEqual([{ country: 'DE', orders: 1, taxableBase: 5000 }])
  })

  it('keeps sales outside the EU in their own bucket', async () => {
    const report = await build([[order(1, rated('US', 'outside-eu', 4000, 0, 0))]])

    expect(report.outsideEu).toEqual([{ country: 'US', orders: 1, taxableBase: 4000 }])
    expect(report.totals.taxAmount).toBe(0)
  })

  it('names the orders it could not place, and leaves them out of the totals', async () => {
    const report = await build([
      [
        order(1, rated('DE', 'intra-eu-b2c', 1000, 190, 19)),
        order(2, { resolved: false, taxableBase: 900 }),
        order(3, null),
      ],
    ])

    expect(report.unresolved).toEqual({ ids: [2, 3], orders: 2 })
    expect(report.totals).toEqual({ taxAmount: 190, taxableBase: 1000 })
    expect(report.orders).toBe(3)
  })

  it('treats a scope it does not know as unresolved', async () => {
    const report = await build([[order(1, { resolved: true, scope: 'somewhere', taxAmount: 5 })]])

    expect(report.unresolved.ids).toEqual([1])
    expect(report.totals.taxAmount).toBe(0)
  })

  it('falls back to the single rate when there is no breakdown array', async () => {
    const report = await build([
      [
        order(1, {
          country: 'IT',
          rate: 22,
          resolved: true,
          scope: 'intra-eu-b2c',
          taxAmount: 220,
          taxableBase: 1000,
        }),
      ],
    ])

    expect(report.oss[0]?.rates).toEqual([{ rate: 22, taxAmount: 220, taxableBase: 1000 }])
  })

  it('reads every page', async () => {
    const calls: FindCall[] = []
    const report = await build(
      [
        [order(1, rated('DE', 'intra-eu-b2c', 1000, 190, 19))],
        [order(2, rated('DE', 'intra-eu-b2c', 1000, 190, 19))],
        [order(3, rated('DE', 'intra-eu-b2c', 1000, 190, 19))],
      ],
      calls,
    )

    expect(calls.map((call) => call.page)).toEqual([1, 2, 3])
    expect(report.oss[0]?.orders).toBe(3)
  })

  it('passes the request through, so the read stays in the same transaction', async () => {
    const calls: FindCall[] = []

    await build([[]], calls)

    expect(calls[0]?.req).toBeDefined()
    expect(calls[0]).toMatchObject({ collection: 'orders', depth: 0, overrideAccess: true })
  })

  it('asks only for the statuses it counts, inside the period', async () => {
    const calls: FindCall[] = []

    await build([[]], calls)

    expect(calls[0]?.where).toEqual({
      and: [
        { createdAt: { greater_than_equal: from.toISOString() } },
        { createdAt: { less_than_equal: to.toISOString() } },
        { status: { in: ['processing', 'completed'] } },
      ],
    })
  })

  it('drops the status filter when the list is empty', async () => {
    const calls: FindCall[] = []

    await buildOssReport({
      config: resolveConfig({ reportStatuses: [], sellerCountry: 'GR' }),
      from,
      req: fakeRequest({}, [], pagedFind([[]], calls)),
      to,
    })

    expect((calls[0]?.where as { and: unknown[] }).and).toHaveLength(2)
  })

  it('reports the period it covered', async () => {
    const report = await build([[]])

    expect(report).toMatchObject({ from: '2026-01-01', orders: 0, to: '2026-03-31' })
  })
})
