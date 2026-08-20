import type { Field } from 'payload'

import type { ResolvedConfig } from './types.js'

const readOnly = { admin: { readOnly: true } } as const

export const taxScopeOptions: string[] = [
  'domestic',
  'intra-eu-b2c',
  'intra-eu-b2b',
  'outside-eu',
  'unknown',
]

export const vatNumberCheckOptions: string[] = [
  'none',
  'format',
  'vies-valid',
  'vies-invalid',
  'vies-unavailable',
]

/**
 * The group field holding the VAT breakdown. Exported so that a shop can place
 * it itself instead of letting the plugin append it.
 */
export const taxField = (config: ResolvedConfig): Field => ({
  name: config.fieldName,
  type: 'group',
  fields: [
    {
      name: 'country',
      type: 'text',
      ...readOnly,
      index: true,
      label: 'Country of taxation',
      maxLength: 2,
    },
    {
      name: 'scope',
      type: 'select',
      ...readOnly,
      label: 'Place of supply',
      options: taxScopeOptions,
    },
    {
      name: 'rate',
      type: 'number',
      ...readOnly,
      label: 'Rate applied, per cent',
    },
    {
      name: 'taxableBase',
      type: 'number',
      ...readOnly,
      label: 'Taxable base, minor units',
    },
    {
      name: 'taxAmount',
      type: 'number',
      ...readOnly,
      label: 'VAT, minor units',
    },
    {
      name: 'reverseCharge',
      type: 'checkbox',
      ...readOnly,
      label: 'Reverse charge',
    },
    {
      name: 'resolved',
      type: 'checkbox',
      ...readOnly,
      label: 'Place of supply resolved',
    },
    {
      name: 'pricesIncludeTax',
      type: 'checkbox',
      ...readOnly,
      label: 'Prices included VAT',
    },
    {
      name: 'vatNumber',
      type: 'text',
      label: 'Customer VAT number',
    },
    {
      name: 'vatNumberCheck',
      type: 'select',
      ...readOnly,
      label: 'VAT number check',
      options: vatNumberCheckOptions,
    },
    {
      name: 'note',
      type: 'text',
      ...readOnly,
      label: 'Note for the invoice',
    },
    {
      name: 'calculatedAt',
      type: 'date',
      ...readOnly,
      label: 'Calculated at',
    },
    {
      name: 'breakdown',
      type: 'array',
      admin: { readOnly: true },
      fields: [
        { name: 'rate', type: 'number', label: 'Rate, per cent' },
        { name: 'taxableBase', type: 'number', label: 'Taxable base, minor units' },
        { name: 'taxAmount', type: 'number', label: 'VAT, minor units' },
      ],
      label: 'Breakdown by rate',
    },
  ],
  label: 'VAT',
})
