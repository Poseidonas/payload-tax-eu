import type { Endpoint, PayloadRequest } from 'payload'

import { calculateTax } from './calculate.js'
import { TaxError } from './errors.js'
import { buildOssReport } from './report.js'
import { asRecord } from './stored.js'
import type { ResolvedConfig, TaxLineInput, VatNumberCheckResult, VatRateType } from './types.js'
import { checkVatNumber } from './vies.js'

const failure = (code: string, message: string, status: number): Response =>
  Response.json({ code, message }, { status })

const readBody = async (req: PayloadRequest): Promise<Record<string, unknown>> => {
  if (req.data !== undefined) {
    return asRecord(req.data)
  }

  if (typeof req.json !== 'function') {
    return {}
  }

  try {
    return asRecord(await req.json())
  } catch {
    return {}
  }
}

const readQuery = (req: PayloadRequest, key: string): null | string => {
  const params: undefined | URLSearchParams = req.searchParams

  if (params && typeof params.get === 'function') {
    const value = params.get(key)

    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  const fallback = asRecord(req.query)[key]

  return typeof fallback === 'string' && fallback.length > 0 ? fallback : null
}

const readLines = (value: unknown): null | TaxLineInput[] => {
  if (!Array.isArray(value) || value.length === 0) {
    return null
  }

  const lines: TaxLineInput[] = []

  for (const entry of value) {
    const record = asRecord(entry)

    if (typeof record.amount !== 'number') {
      return null
    }

    lines.push({
      amount: record.amount,
      ...(typeof record.id === 'string' ? { id: record.id } : {}),
      ...(typeof record.rate === 'number' ? { rate: record.rate } : {}),
      ...(typeof record.rateType === 'string'
        ? { rateType: record.rateType as VatRateType }
        : {}),
    })
  }

  return lines
}

const quoteHandler =
  (config: ResolvedConfig) =>
  async (req: PayloadRequest): Promise<Response> => {
    if (!(await config.quoteEndpointAccess(req))) {
      return failure('forbidden', 'Not allowed to ask for a VAT quote.', 403)
    }

    const body = await readBody(req)
    const lines = readLines(body.lines)

    if (lines === null) {
      return failure(
        'invalid-lines',
        'Send lines as an array of objects, each with an integer amount in minor units.',
        400,
      )
    }

    const vatNumber = typeof body.vatNumber === 'string' ? body.vatNumber : null
    let check: null | VatNumberCheckResult = null

    if (vatNumber !== null && config.vies.enabled && config.vies.useInQuote) {
      check = await checkVatNumber(vatNumber, config.vies)
    }

    try {
      const calculation = calculateTax(
        {
          country: typeof body.country === 'string' ? body.country : null,
          ...(typeof body.date === 'string' ? { date: body.date } : {}),
          lines,
          vatNumber,
          ...(check === null ? {} : { vatNumberValid: check.accepted }),
        },
        config,
      )

      return Response.json({
        ...calculation,
        vatNumberCheck: check === null ? null : { name: check.name, online: check.online },
      })
    } catch (error) {
      if (error instanceof TaxError) {
        return failure(error.code, error.message, 400)
      }

      throw error
    }
  }

const boundary = (value: null | string, endOfDay: boolean): Date | null => {
  if (value === null) {
    return null
  }

  const suffix = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    : value
  const date = new Date(suffix)

  return Number.isNaN(date.getTime()) ? null : date
}

const reportHandler =
  (config: ResolvedConfig) =>
  async (req: PayloadRequest): Promise<Response> => {
    if (!(await config.reportEndpointAccess(req))) {
      return failure('forbidden', 'Not allowed to read the OSS report.', 403)
    }

    const from = boundary(readQuery(req, 'from'), false)
    const to = boundary(readQuery(req, 'to'), true)

    if (from === null || to === null) {
      return failure('invalid-range', 'Give from and to as ISO dates, such as 2026-01-01.', 400)
    }

    if (from.getTime() > to.getTime()) {
      return failure('invalid-range', 'The start of the period is after its end.', 400)
    }

    return Response.json(await buildOssReport({ config, from, req, to }))
  }

export const taxEndpoints = (config: ResolvedConfig): Endpoint[] => {
  const endpoints: Endpoint[] = []

  if (config.quoteEndpoint) {
    endpoints.push({
      handler: quoteHandler(config),
      method: 'post',
      path: `${config.routePrefix}/quote`,
    })
  }

  if (config.reportEndpoint) {
    endpoints.push({
      handler: reportHandler(config),
      method: 'get',
      path: `${config.routePrefix}/oss-report`,
    })
  }

  return endpoints
}
