import { describe, expect, it } from 'vitest'

import { adminOnly, resolveConfig } from '../src/config.js'
import { defaultReverseChargeNote, resolveTaxOptions } from '../src/options.js'
import type { PayloadRequest } from 'payload'

describe('resolveTaxOptions', () => {
  it('fills in the documented defaults', () => {
    expect(resolveTaxOptions()).toEqual({
      defaultRateType: 'standard',
      onUnknownCountry: 'error',
      placeOfSupply: 'destination',
      pricesIncludeTax: false,
      rates: [],
      reverseChargeNote: defaultReverseChargeNote,
      rounding: 'line',
      sellerCountry: '',
      useBuiltInRates: true,
    })
  })

  it('replaces a value it cannot use with the default', () => {
    expect(
      resolveTaxOptions({
        defaultRateType: 'nonsense' as never,
        onUnknownCountry: 'maybe' as never,
        rounding: 'sometimes' as never,
      }),
    ).toMatchObject({
      defaultRateType: 'standard',
      onUnknownCountry: 'error',
      rounding: 'line',
    })
  })

  it('keeps the built in rates unless they are switched off', () => {
    expect(resolveTaxOptions({ useBuiltInRates: false }).useBuiltInRates).toBe(false)
    expect(resolveTaxOptions({}).useBuiltInRates).toBe(true)
  })

  it('ignores rates that are not an array', () => {
    expect(resolveTaxOptions({ rates: 'DE 19' as never }).rates).toEqual([])
  })
})

describe('resolveConfig', () => {
  it('fills in the documented defaults', () => {
    expect(resolveConfig()).toMatchObject({
      amountPath: 'amount',
      countryPath: 'shippingAddress.country',
      datePath: 'createdAt',
      disabled: false,
      fieldName: 'tax',
      ordersSlug: 'orders',
      quoteEndpoint: true,
      reportEndpoint: true,
      reportPageSize: 500,
      reportStatuses: ['processing', 'completed'],
      routePrefix: '/tax',
      vatNumberPath: 'tax.vatNumber',
      vies: { enabled: false, timeoutMs: 3000, useInQuote: false },
    })
  })

  it('moves the VAT number path with the field name', () => {
    expect(resolveConfig({ fieldName: 'vat' }).vatNumberPath).toBe('vat.vatNumber')
  })

  it('keeps a VAT number path of your own', () => {
    expect(resolveConfig({ fieldName: 'vat', vatNumberPath: 'customer.vatNumber' }).vatNumberPath).toBe(
      'customer.vatNumber',
    )
  })

  it('puts a slash in front of a route prefix that has none', () => {
    expect(resolveConfig({ routePrefix: 'vat' }).routePrefix).toBe('/vat')
  })

  it('takes a trailing slash off a route prefix', () => {
    expect(resolveConfig({ routePrefix: '/vat/' }).routePrefix).toBe('/vat')
  })

  it('refuses a page size of nought or less', () => {
    expect(resolveConfig({ reportPageSize: 0 }).reportPageSize).toBe(500)
    expect(resolveConfig({ reportPageSize: -10 }).reportPageSize).toBe(500)
  })

  it('takes an empty status list to mean every status', () => {
    expect(resolveConfig({ reportStatuses: [] }).reportStatuses).toEqual([])
  })

  it('falls back when a name is given as an empty string', () => {
    expect(resolveConfig({ fieldName: '', ordersSlug: '' })).toMatchObject({
      fieldName: 'tax',
      ordersSlug: 'orders',
    })
  })

  it('gives the quote endpoint to everyone and the report to admins', () => {
    const config = resolveConfig()
    const anonymous = { user: null } as unknown as PayloadRequest
    const admin = { user: { roles: ['admin'] } } as unknown as PayloadRequest

    expect(config.quoteEndpointAccess(anonymous)).toBe(true)
    expect(config.reportEndpointAccess(anonymous)).toBe(false)
    expect(config.reportEndpointAccess(admin)).toBe(true)
  })

  it('keeps an access function of your own', () => {
    const mine = (): boolean => true

    expect(resolveConfig({ reportEndpointAccess: mine }).reportEndpointAccess).toBe(mine)
  })
})

describe('adminOnly', () => {
  it('wants an admin role and nothing less', () => {
    expect(adminOnly({ user: { roles: ['admin'] } } as unknown as PayloadRequest)).toBe(true)
    expect(adminOnly({ user: { roles: ['customer'] } } as unknown as PayloadRequest)).toBe(false)
    expect(adminOnly({ user: {} } as unknown as PayloadRequest)).toBe(false)
    expect(adminOnly({ user: null } as unknown as PayloadRequest)).toBe(false)
  })
})
