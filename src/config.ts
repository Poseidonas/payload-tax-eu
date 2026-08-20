import type { PayloadRequest } from 'payload'

import { resolveTaxOptions } from './options.js'
import type { ResolvedConfig, TaxAccess, TaxEuConfig } from './types.js'
import { resolveViesOptions } from './vies.js'

const text = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback

const positiveInteger = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  const rounded = Math.trunc(value)

  return rounded > 0 ? rounded : fallback
}

const route = (value: unknown): string => {
  const raw = text(value, '/tax')
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`

  return withSlash.length > 1 && withSlash.endsWith('/') ? withSlash.slice(0, -1) : withSlash
}

const access = (value: unknown, fallback: TaxAccess): TaxAccess =>
  typeof value === 'function' ? (value as TaxAccess) : fallback

/**
 * Lets through an authenticated user whose `roles` array contains 'admin',
 * the shape the official ecommerce template uses. Replace it if yours differs.
 */
export const adminOnly: TaxAccess = (req: PayloadRequest): boolean => {
  const roles = (req.user as null | undefined | { roles?: unknown })?.roles

  return Array.isArray(roles) && roles.includes('admin')
}

const everyone: TaxAccess = () => true

export const resolveConfig = (incoming: TaxEuConfig = {}): ResolvedConfig => {
  const fieldName = text(incoming.fieldName, 'tax')

  return {
    ...resolveTaxOptions(incoming),
    amountPath: text(incoming.amountPath, 'amount'),
    countryPath: text(incoming.countryPath, 'shippingAddress.country'),
    datePath: text(incoming.datePath, 'createdAt'),
    disabled: incoming.disabled === true,
    fieldName,
    ordersSlug: text(incoming.ordersSlug, 'orders'),
    quoteEndpoint: incoming.quoteEndpoint !== false,
    quoteEndpointAccess: access(incoming.quoteEndpointAccess, everyone),
    reportEndpoint: incoming.reportEndpoint !== false,
    reportEndpointAccess: access(incoming.reportEndpointAccess, adminOnly),
    reportPageSize: positiveInteger(incoming.reportPageSize, 500),
    reportStatuses: Array.isArray(incoming.reportStatuses)
      ? incoming.reportStatuses.filter((status): status is string => typeof status === 'string')
      : ['processing', 'completed'],
    routePrefix: route(incoming.routePrefix),
    vatNumberPath: text(incoming.vatNumberPath, `${fieldName}.vatNumber`),
    vies: resolveViesOptions(incoming.vies ?? {}),
  }
}
