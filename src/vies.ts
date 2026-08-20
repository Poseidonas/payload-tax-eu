import type { ResolvedViesOptions, VatNumberCheckResult, ViesOptions } from './types.js'
import { validateVatNumber } from './vat-number.js'

export const defaultViesEndpoint =
  'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/{country}/vat/{number}'

export const resolveViesOptions = (incoming: ViesOptions & { useInQuote?: boolean } = {}) => {
  const timeout =
    typeof incoming.timeoutMs === 'number' && Number.isFinite(incoming.timeoutMs)
      ? Math.trunc(incoming.timeoutMs)
      : 0

  const resolved: ResolvedViesOptions = {
    enabled: incoming.enabled === true,
    endpoint:
      typeof incoming.endpoint === 'string' && incoming.endpoint.length > 0
        ? incoming.endpoint
        : defaultViesEndpoint,
    fetch: typeof incoming.fetch === 'function' ? incoming.fetch : null,
    timeoutMs: timeout > 0 ? timeout : 3000,
    useInQuote: incoming.useInQuote === true,
  }

  return resolved
}

const readText = (source: Record<string, unknown>, key: string): null | string => {
  const value = source[key]

  return typeof value === 'string' && value.length > 0 ? value : null
}

const readValid = (source: Record<string, unknown>): boolean | null => {
  if (typeof source.valid === 'boolean') {
    return source.valid
  }

  return typeof source.isValid === 'boolean' ? source.isValid : null
}

/**
 * Checks a VAT number, offline always and against VIES when that is switched on.
 * The online step fails open: a timeout, a network error or an unusable answer
 * leaves the format result standing, so a VIES outage never stops a sale.
 */
export const checkVatNumber = async (
  value: unknown,
  options: ViesOptions = {},
): Promise<VatNumberCheckResult> => {
  const format = validateVatNumber(value)
  const resolved = resolveViesOptions(options)

  if (!resolved.enabled || !format.valid || !format.prefix || !format.number) {
    return { accepted: format.valid, address: null, format, name: null, online: 'skipped' }
  }

  const call = resolved.fetch ?? globalThis.fetch
  const url = resolved.endpoint
    .replace('{country}', format.prefix)
    .replace('{number}', format.number)

  try {
    const response = await call(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(resolved.timeoutMs),
    })

    if (!response.ok) {
      return { accepted: true, address: null, format, name: null, online: 'unavailable' }
    }

    const body: unknown = await response.json()

    if (body === null || typeof body !== 'object') {
      return { accepted: true, address: null, format, name: null, online: 'unavailable' }
    }

    const record = body as Record<string, unknown>
    const valid = readValid(record)

    if (valid === null) {
      return { accepted: true, address: null, format, name: null, online: 'unavailable' }
    }

    return {
      accepted: valid,
      address: readText(record, 'address'),
      format,
      name: readText(record, 'name'),
      online: valid ? 'valid' : 'invalid',
    }
  } catch {
    return { accepted: true, address: null, format, name: null, online: 'unavailable' }
  }
}
