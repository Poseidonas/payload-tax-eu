import type { CollectionConfig, Config, Field } from 'payload'

import { describe, expect, it } from 'vitest'

import { taxEuPlugin } from '../src/index.js'

const ordersCollection: CollectionConfig = {
  slug: 'orders',
  fields: [{ name: 'customerEmail', type: 'email' }],
}

const baseConfig = (collections: CollectionConfig[]): Config => ({ collections }) as Config

const collectionOf = (config: Config, slug: string): CollectionConfig | undefined =>
  config.collections?.find((entry) => entry.slug === slug)

const fieldNames = (config: Config, slug: string): string[] =>
  (collectionOf(config, slug)?.fields ?? []).map((field) =>
    'name' in field && typeof field.name === 'string' ? field.name : '',
  )

const taxGroup = (config: Config): Field | undefined =>
  (collectionOf(config, 'orders')?.fields ?? []).find(
    (field) => 'name' in field && field.name === 'tax',
  )

describe('taxEuPlugin', () => {
  it('adds one group field to the orders collection', () => {
    const result = taxEuPlugin({ sellerCountry: 'GR' })(baseConfig([ordersCollection]))

    expect(fieldNames(result, 'orders')).toEqual(['customerEmail', 'tax'])
  })

  it('names the group whatever you ask for', () => {
    const result = taxEuPlugin({ fieldName: 'vat' })(baseConfig([ordersCollection]))

    expect(fieldNames(result, 'orders')).toContain('vat')
  })

  it('puts the whole breakdown inside the group', () => {
    const group = taxGroup(taxEuPlugin()(baseConfig([ordersCollection])))
    const names =
      group && 'fields' in group
        ? group.fields.map((field) => ('name' in field ? field.name : ''))
        : []

    expect(names).toEqual([
      'country',
      'scope',
      'rate',
      'taxableBase',
      'taxAmount',
      'reverseCharge',
      'resolved',
      'pricesIncludeTax',
      'vatNumber',
      'vatNumberCheck',
      'note',
      'calculatedAt',
      'breakdown',
    ])
  })

  it('leaves the VAT number writable and the computed fields read only', () => {
    const group = taxGroup(taxEuPlugin()(baseConfig([ordersCollection])))
    const fields = group && 'fields' in group ? group.fields : []
    const byName = (name: string): Field | undefined =>
      fields.find((field) => 'name' in field && field.name === name)

    expect(byName('vatNumber')).not.toMatchObject({ admin: { readOnly: true } })
    expect(byName('taxAmount')).toMatchObject({ admin: { readOnly: true } })
  })

  it('adds the hook to the orders collection', () => {
    const result = taxEuPlugin()(baseConfig([ordersCollection]))

    expect(collectionOf(result, 'orders')?.hooks?.beforeChange).toHaveLength(1)
  })

  it('keeps hooks that were already there, and runs after them', () => {
    const existing = (): null => null
    const withHook: CollectionConfig = {
      ...ordersCollection,
      hooks: { beforeChange: [existing as never] },
    }
    const hooks = collectionOf(
      taxEuPlugin()(baseConfig([withHook])),
      'orders',
    )?.hooks?.beforeChange

    expect(hooks).toHaveLength(2)
    expect(hooks?.[0]).toBe(existing)
  })

  it('leaves other collections untouched', () => {
    const other: CollectionConfig = { slug: 'products', fields: [{ name: 'title', type: 'text' }] }
    const result = taxEuPlugin()(baseConfig([ordersCollection, other]))

    expect(fieldNames(result, 'products')).toEqual(['title'])
  })

  it('returns the config unchanged when the orders collection is absent', () => {
    const input = baseConfig([{ slug: 'products', fields: [] }])

    expect(taxEuPlugin()(input)).toBe(input)
  })

  it('follows a renamed orders collection', () => {
    const renamed: CollectionConfig = { ...ordersCollection, slug: 'shop-orders' }
    const result = taxEuPlugin({ ordersSlug: 'shop-orders' })(baseConfig([renamed]))

    expect(fieldNames(result, 'shop-orders')).toContain('tax')
  })

  it('adds both endpoints and keeps the ones already there', () => {
    const input = {
      collections: [ordersCollection],
      endpoints: [{ handler: () => new Response(), method: 'get', path: '/existing' }],
    } as unknown as Config
    const result = taxEuPlugin()(input)

    expect(result.endpoints?.map((entry) => entry.path)).toEqual([
      '/existing',
      '/tax/quote',
      '/tax/oss-report',
    ])
  })

  it('leaves the endpoints key alone when both are switched off', () => {
    const result = taxEuPlugin({ quoteEndpoint: false, reportEndpoint: false })(
      baseConfig([ordersCollection]),
    )

    expect(result.endpoints).toBeUndefined()
  })

  it('still adds the field when disabled, so the database keeps its shape', () => {
    const result = taxEuPlugin({ disabled: true })(baseConfig([ordersCollection]))

    expect(fieldNames(result, 'orders')).toContain('tax')
  })

  it('indexes the country, so an auditor can query by it', () => {
    const group = taxGroup(taxEuPlugin()(baseConfig([ordersCollection])))
    const fields = group && 'fields' in group ? group.fields : []

    expect(fields.find((field) => 'name' in field && field.name === 'country')).toMatchObject({
      index: true,
    })
  })
})
