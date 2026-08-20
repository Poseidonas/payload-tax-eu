import type { CollectionBeforeChangeHook } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import { resolveConfig } from '../src/config.js'
import { recordTax } from '../src/hooks.js'
import type { TaxEuConfig } from '../src/types.js'
import { fakeRequest, type Logged } from './helpers.js'

type Args = Parameters<CollectionBeforeChangeHook>[0]

const run = async (
  options: TaxEuConfig,
  data: Record<string, unknown>,
  operation: 'create' | 'update' = 'create',
  logged: Logged[] = [],
): Promise<Record<string, unknown>> => {
  const hook = recordTax(resolveConfig(options))
  const result = await hook({
    data,
    operation,
    req: fakeRequest({}, logged),
  } as unknown as Args)

  return result as Record<string, unknown>
}

const group = (data: Record<string, unknown>): Record<string, unknown> =>
  data.tax as Record<string, unknown>

const seller: TaxEuConfig = { pricesIncludeTax: true, sellerCountry: 'GR' }

describe('recordTax', () => {
  it('records the breakdown of a domestic order', async () => {
    const result = await run(seller, {
      amount: 1240,
      shippingAddress: { country: 'GR' },
    })

    expect(group(result)).toMatchObject({
      country: 'GR',
      rate: 24,
      resolved: true,
      reverseCharge: false,
      scope: 'domestic',
      taxAmount: 240,
      taxableBase: 1000,
    })
  })

  it('never touches the order total', async () => {
    const result = await run(seller, { amount: 1240, shippingAddress: { country: 'GR' } })

    expect(result.amount).toBe(1240)
  })

  it('leaves every other field alone', async () => {
    const result = await run(seller, {
      amount: 1240,
      customerEmail: 'a@example.test',
      shippingAddress: { country: 'GR' },
    })

    expect(result.customerEmail).toBe('a@example.test')
  })

  it('records the rate that applies in the customer country', async () => {
    const result = await run(seller, { amount: 1190, shippingAddress: { country: 'DE' } })

    expect(group(result)).toMatchObject({ country: 'DE', rate: 19, scope: 'intra-eu-b2c' })
  })

  it('zero rates a business in another member state and keeps the note', async () => {
    const result = await run(seller, {
      amount: 10_000,
      shippingAddress: { country: 'DE' },
      tax: { vatNumber: 'DE123456789' },
    })

    expect(group(result)).toMatchObject({
      reverseCharge: true,
      scope: 'intra-eu-b2b',
      taxAmount: 0,
      vatNumberCheck: 'format',
    })
    expect(group(result).note).toContain('Reverse charge')
  })

  it('writes a breakdown array and a timestamp', async () => {
    const result = await run(seller, { amount: 1240, shippingAddress: { country: 'GR' } })

    expect(group(result).breakdown).toEqual([{ rate: 24, taxAmount: 240, taxableBase: 1000 }])
    expect(typeof group(result).calculatedAt).toBe('string')
  })

  it('does nothing when the plugin is switched off', async () => {
    const data = { amount: 1240, shippingAddress: { country: 'GR' } }

    expect(await run({ ...seller, disabled: true }, data)).toBe(data)
  })

  it('does nothing on an update', async () => {
    const data = { amount: 1240, shippingAddress: { country: 'GR' } }

    expect(await run(seller, data, 'update')).toBe(data)
  })

  it('leaves a breakdown that checkout already worked out', async () => {
    const data = {
      amount: 1240,
      shippingAddress: { country: 'GR' },
      tax: { taxAmount: 999, taxableBase: 241 },
    }

    expect(await run(seller, data)).toBe(data)
  })

  it('marks the order unresolved when the country is missing, and still saves it', async () => {
    const logged: Logged[] = []
    const result = await run(seller, { amount: 1240 }, 'create', logged)

    expect(group(result)).toMatchObject({ resolved: false, taxAmount: 0, taxableBase: 1240 })
    expect(logged[0]?.message).toContain('unknown-country')
  })

  it('marks the order unresolved when there is no total to work from', async () => {
    const result = await run(seller, { shippingAddress: { country: 'GR' } })

    expect(group(result)).toMatchObject({ resolved: false, taxableBase: 0 })
    expect(group(result).note).toContain('No order total')
  })

  it('marks the order unresolved when the total is not in minor units', async () => {
    const result = await run(seller, { amount: 12.4, shippingAddress: { country: 'GR' } })

    expect(group(result).resolved).toBe(false)
  })

  it('reads the country from a path of your own', async () => {
    const result = await run(
      { ...seller, countryPath: 'billingAddress.country' },
      { amount: 1240, billingAddress: { country: 'GR' } },
    )

    expect(group(result).country).toBe('GR')
  })

  it('reads the VAT number from a path of your own', async () => {
    const result = await run(
      { ...seller, vatNumberPath: 'customerVatNumber' },
      {
        amount: 10_000,
        customerVatNumber: 'DE123456789',
        shippingAddress: { country: 'DE' },
      },
    )

    expect(group(result).reverseCharge).toBe(true)
  })

  it('asks VIES when that is switched on, and records the answer', async () => {
    const call = vi.fn(async () =>
      Promise.resolve({ json: async () => Promise.resolve({ valid: true }), ok: true } as Response),
    ) as unknown as typeof globalThis.fetch

    const result = await run(
      { ...seller, vies: { enabled: true, fetch: call } },
      {
        amount: 10_000,
        shippingAddress: { country: 'DE' },
        tax: { vatNumber: 'DE123456789' },
      },
    )

    expect(call).toHaveBeenCalledOnce()
    expect(group(result)).toMatchObject({ reverseCharge: true, vatNumberCheck: 'vies-valid' })
  })

  it('charges VAT when VIES says the number is not registered', async () => {
    const call = vi.fn(async () =>
      Promise.resolve({ json: async () => Promise.resolve({ valid: false }), ok: true } as Response),
    ) as unknown as typeof globalThis.fetch

    const result = await run(
      { ...seller, vies: { enabled: true, fetch: call } },
      {
        amount: 11_900,
        shippingAddress: { country: 'DE' },
        tax: { vatNumber: 'DE123456789' },
      },
    )

    expect(group(result)).toMatchObject({
      reverseCharge: false,
      taxAmount: 1900,
      vatNumberCheck: 'vies-invalid',
    })
  })

  it('still zero rates when VIES cannot be reached', async () => {
    const call = (() =>
      Promise.reject(new Error('ECONNRESET'))) as unknown as typeof globalThis.fetch

    const result = await run(
      { ...seller, vies: { enabled: true, fetch: call } },
      {
        amount: 10_000,
        shippingAddress: { country: 'DE' },
        tax: { vatNumber: 'DE123456789' },
      },
    )

    expect(group(result)).toMatchObject({
      reverseCharge: true,
      vatNumberCheck: 'vies-unavailable',
    })
  })

  it('keeps the VAT number the customer gave alongside the result', async () => {
    const result = await run(seller, {
      amount: 10_000,
      shippingAddress: { country: 'DE' },
      tax: { vatNumber: 'de 123 456 789' },
    })

    expect(group(result).vatNumber).toBe('DE123456789')
  })

  it('reads the date of supply from the order', async () => {
    const result = await run(
      { ...seller, rates: [{ country: 'GR', from: '2020-01-01', standard: 17, to: '2020-12-31' }] },
      { amount: 1170, createdAt: '2020-06-01T00:00:00.000Z', shippingAddress: { country: 'GR' } },
    )

    expect(group(result).rate).toBe(17)
  })
})
