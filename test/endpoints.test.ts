import type { Endpoint, PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import { resolveConfig } from '../src/config.js'
import { taxEndpoints } from '../src/endpoints.js'
import type { TaxEuConfig } from '../src/types.js'
import { fakeRequest, type FindCall, order, pagedFind } from './helpers.js'

const handlerFor = (options: TaxEuConfig, path: string): Endpoint['handler'] => {
  const endpoint = taxEndpoints(resolveConfig(options)).find((entry) => entry.path === path)

  if (!endpoint) {
    throw new Error(`No endpoint at ${path}`)
  }

  return endpoint.handler
}

const seller: TaxEuConfig = { sellerCountry: 'GR' }

const quote = async (
  body: Record<string, unknown>,
  options: TaxEuConfig = seller,
  req: Partial<PayloadRequest> = {},
): Promise<{ body: Record<string, unknown>; status: number }> => {
  const handler = handlerFor(options, '/tax/quote')
  const response = (await handler(
    fakeRequest({ data: body, ...req }),
  )) as unknown as Response

  return { body: (await response.json()) as Record<string, unknown>, status: response.status }
}

describe('taxEndpoints', () => {
  it('mounts both endpoints by default', () => {
    expect(taxEndpoints(resolveConfig()).map((entry) => `${entry.method} ${entry.path}`)).toEqual([
      'post /tax/quote',
      'get /tax/oss-report',
    ])
  })

  it('leaves out the ones you switch off', () => {
    expect(taxEndpoints(resolveConfig({ quoteEndpoint: false })).map((entry) => entry.path)).toEqual(
      ['/tax/oss-report'],
    )
    expect(taxEndpoints(resolveConfig({ reportEndpoint: false })).map((entry) => entry.path)).toEqual(
      ['/tax/quote'],
    )
    expect(
      taxEndpoints(resolveConfig({ quoteEndpoint: false, reportEndpoint: false })),
    ).toHaveLength(0)
  })

  it('moves both endpoints under a prefix of your own', () => {
    expect(taxEndpoints(resolveConfig({ routePrefix: '/vat' })).map((entry) => entry.path)).toEqual([
      '/vat/quote',
      '/vat/oss-report',
    ])
  })
})

describe('the quote endpoint', () => {
  it('answers with the breakdown', async () => {
    const result = await quote({ country: 'DE', lines: [{ amount: 1000 }] })

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ gross: 1190, net: 1000, scope: 'intra-eu-b2c', tax: 190 })
  })

  it('applies reverse charge from a VAT number', async () => {
    const result = await quote({
      country: 'DE',
      lines: [{ amount: 1000 }],
      vatNumber: 'DE123456789',
    })

    expect(result.body).toMatchObject({ reverseCharge: true, tax: 0 })
  })

  it('reads the body from the request when nothing parsed it first', async () => {
    const handler = handlerFor(seller, '/tax/quote')
    const response = (await handler(
      fakeRequest({ json: async () => Promise.resolve({ country: 'DE', lines: [{ amount: 100 }] }) }),
    )) as unknown as Response

    expect(((await response.json()) as Record<string, unknown>).tax).toBe(19)
  })

  it('refuses lines it cannot use, with a reason the client can read', async () => {
    const result = await quote({ country: 'DE', lines: [{ amount: 'ten' }] })

    expect(result.status).toBe(400)
    expect(result.body).toMatchObject({ code: 'invalid-lines' })
    expect(typeof result.body.message).toBe('string')
  })

  it('refuses an empty request', async () => {
    const result = await quote({})

    expect(result.status).toBe(400)
    expect(result.body.code).toBe('invalid-lines')
  })

  it('passes a refusal from the calculation straight through', async () => {
    const result = await quote({ lines: [{ amount: 100 }] })

    expect(result.status).toBe(400)
    expect(result.body.code).toBe('unknown-country')
  })

  it('carries a line identifier, a band and a rate through', async () => {
    const result = await quote({
      country: 'DE',
      lines: [
        { amount: 1000, id: 'a', rateType: 'reduced' },
        { amount: 1000, id: 'b', rate: 5 },
      ],
    })

    expect(result.body.lines).toEqual([
      { gross: 1070, id: 'a', net: 1000, rate: 7, rateType: 'reduced', tax: 70 },
      { gross: 1050, id: 'b', net: 1000, rate: 5, rateType: 'custom', tax: 50 },
    ])
  })

  it('keeps out anyone the access function refuses', async () => {
    const result = await quote({ country: 'DE', lines: [{ amount: 100 }] }, {
      ...seller,
      quoteEndpointAccess: () => false,
    })

    expect(result.status).toBe(403)
    expect(result.body.code).toBe('forbidden')
  })

  it('leaves VIES alone unless it is switched on for quotes', async () => {
    const call = vi.fn()

    await quote({ country: 'DE', lines: [{ amount: 100 }], vatNumber: 'DE123456789' }, {
      ...seller,
      vies: { enabled: true, fetch: call as unknown as typeof globalThis.fetch },
    })

    expect(call).not.toHaveBeenCalled()
  })

  it('asks VIES when it is switched on for quotes, and reports the answer', async () => {
    const call = vi.fn(async () =>
      Promise.resolve({ json: async () => Promise.resolve({ valid: false }), ok: true } as Response),
    ) as unknown as typeof globalThis.fetch

    const result = await quote({ country: 'DE', lines: [{ amount: 1000 }], vatNumber: 'DE123456789' }, {
      ...seller,
      vies: { enabled: true, fetch: call, useInQuote: true },
    })

    expect(call).toHaveBeenCalledOnce()
    expect(result.body).toMatchObject({ reverseCharge: false, tax: 190 })
    expect(result.body.vatNumberCheck).toEqual({ name: null, online: 'invalid' })
  })
})

describe('the OSS report endpoint', () => {
  const admin = { user: { roles: ['admin'] } }

  const report = async (
    query: Record<string, string>,
    extra: Record<string, unknown> = {},
    calls: FindCall[] = [],
  ): Promise<{ body: Record<string, unknown>; status: number }> => {
    const handler = handlerFor(seller, '/tax/oss-report')
    const response = (await handler(
      fakeRequest(
        { ...admin, searchParams: new URLSearchParams(query), ...extra },
        [],
        pagedFind([[order(1, { country: 'DE', rate: 19, resolved: true, scope: 'intra-eu-b2c', taxAmount: 190, taxableBase: 1000 })]], calls),
      ),
    )) as unknown as Response

    return { body: (await response.json()) as Record<string, unknown>, status: response.status }
  }

  it('answers with totals for the period', async () => {
    const result = await report({ from: '2026-01-01', to: '2026-03-31' })

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      from: '2026-01-01',
      to: '2026-03-31',
      totals: { taxAmount: 190, taxableBase: 1000 },
    })
  })

  it('covers the whole of the last day', async () => {
    const calls: FindCall[] = []

    await report({ from: '2026-01-01', to: '2026-03-31' }, {}, calls)

    const where = calls[0]?.where as { and: Record<string, Record<string, string>>[] }

    expect(where.and[1]?.createdAt?.less_than_equal).toBe('2026-03-31T23:59:59.999Z')
  })

  it('reads the dates from a plain query object as well', async () => {
    const result = await report({}, { query: { from: '2026-01-01', to: '2026-01-31' }, searchParams: undefined })

    expect(result.status).toBe(200)
  })

  it('refuses a period it cannot read', async () => {
    expect((await report({ from: '2026-01-01' })).status).toBe(400)
    expect((await report({ from: 'yesterday', to: '2026-01-31' })).body.code).toBe('invalid-range')
  })

  it('refuses a period that ends before it starts', async () => {
    const result = await report({ from: '2026-03-31', to: '2026-01-01' })

    expect(result.status).toBe(400)
    expect(result.body.code).toBe('invalid-range')
  })

  it('keeps out anyone who is not an admin', async () => {
    const handler = handlerFor(seller, '/tax/oss-report')
    const response = (await handler(
      fakeRequest({ searchParams: new URLSearchParams({ from: '2026-01-01', to: '2026-03-31' }) }),
    )) as unknown as Response

    expect(response.status).toBe(403)
  })
})
