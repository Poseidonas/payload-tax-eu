import { describe, expect, it, vi } from 'vitest'

import { checkVatNumber, defaultViesEndpoint, resolveViesOptions } from '../src/vies.js'

const json = (body: unknown, ok = true): typeof globalThis.fetch =>
  vi.fn(async () =>
    Promise.resolve({
      json: async () => Promise.resolve(body),
      ok,
    } as Response),
  ) as unknown as typeof globalThis.fetch

describe('resolveViesOptions', () => {
  it('is off by default', () => {
    expect(resolveViesOptions()).toEqual({
      enabled: false,
      endpoint: defaultViesEndpoint,
      fetch: null,
      timeoutMs: 3000,
      useInQuote: false,
    })
  })

  it('refuses a timeout of nought or less', () => {
    expect(resolveViesOptions({ timeoutMs: 0 }).timeoutMs).toBe(3000)
    expect(resolveViesOptions({ timeoutMs: -1 }).timeoutMs).toBe(3000)
  })

  it('keeps a timeout it can use', () => {
    expect(resolveViesOptions({ timeoutMs: 1500 }).timeoutMs).toBe(1500)
  })
})

describe('checkVatNumber, without the network', () => {
  it('carries an injected fetch through the resolved options', () => {
    const call = json({ valid: true })

    expect(resolveViesOptions({ fetch: call }).fetch).toBe(call)
  })

  it('does not call out at all when VIES is off', async () => {
    const call = json({ valid: true })
    const result = await checkVatNumber('DE123456789', { fetch: call })

    expect(call).not.toHaveBeenCalled()
    expect(result).toMatchObject({ accepted: true, online: 'skipped' })
  })

  it('refuses a malformed number without calling out', async () => {
    const call = json({ valid: true })
    const result = await checkVatNumber('DE12345', { enabled: true, fetch: call })

    expect(call).not.toHaveBeenCalled()
    expect(result).toMatchObject({ accepted: false, online: 'skipped' })
  })
})

describe('checkVatNumber, against VIES', () => {
  it('accepts a number VIES confirms', async () => {
    const result = await checkVatNumber('DE123456789', {
      enabled: true,
      fetch: json({ address: 'Berlin', name: 'Muster GmbH', valid: true }),
    })

    expect(result).toMatchObject({
      accepted: true,
      address: 'Berlin',
      name: 'Muster GmbH',
      online: 'valid',
    })
  })

  it('reads the isValid spelling as well as valid', async () => {
    const result = await checkVatNumber('DE123456789', {
      enabled: true,
      fetch: json({ isValid: false }),
    })

    expect(result).toMatchObject({ accepted: false, online: 'invalid' })
  })

  it('refuses a number VIES rejects', async () => {
    const result = await checkVatNumber('DE123456789', {
      enabled: true,
      fetch: json({ valid: false }),
    })

    expect(result).toMatchObject({ accepted: false, online: 'invalid' })
  })

  it('puts the prefix and the number into the URL', async () => {
    const call = json({ valid: true })

    await checkVatNumber('GR123456789', { enabled: true, fetch: call })

    expect(call).toHaveBeenCalledWith(
      'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/EL/vat/123456789',
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    )
  })

  it('takes an endpoint of your own', async () => {
    const call = json({ valid: true })

    await checkVatNumber('DE123456789', {
      enabled: true,
      endpoint: 'https://vat.example.test/{country}/{number}',
      fetch: call,
    })

    expect(call).toHaveBeenCalledWith(
      'https://vat.example.test/DE/123456789',
      expect.anything(),
    )
  })

  it('sends an abort signal so a hanging call cannot block a sale', async () => {
    const call = json({ valid: true })

    await checkVatNumber('DE123456789', { enabled: true, fetch: call, timeoutMs: 50 })

    const options = (call as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]?.[1]

    expect(options?.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('checkVatNumber, when VIES is having a bad day', () => {
  it('fails open on a refused request', async () => {
    const result = await checkVatNumber('DE123456789', {
      enabled: true,
      fetch: json({}, false),
    })

    expect(result).toMatchObject({ accepted: true, online: 'unavailable' })
  })

  it('fails open on a network error', async () => {
    const result = await checkVatNumber('DE123456789', {
      enabled: true,
      fetch: (() => Promise.reject(new Error('ECONNRESET'))) as unknown as typeof globalThis.fetch,
    })

    expect(result).toMatchObject({ accepted: true, online: 'unavailable' })
  })

  it('fails open on a timeout', async () => {
    const result = await checkVatNumber('DE123456789', {
      enabled: true,
      fetch: (() =>
        Promise.reject(new DOMException('aborted', 'TimeoutError'))) as unknown as typeof globalThis.fetch,
    })

    expect(result).toMatchObject({ accepted: true, online: 'unavailable' })
  })

  it('fails open on a body it cannot read', async () => {
    const result = await checkVatNumber('DE123456789', {
      enabled: true,
      fetch: vi.fn(async () =>
        Promise.resolve({
          json: async () => Promise.reject(new Error('not json')),
          ok: true,
        } as unknown as Response),
      ) as unknown as typeof globalThis.fetch,
    })

    expect(result).toMatchObject({ accepted: true, online: 'unavailable' })
  })

  it('fails open on an answer with no verdict in it', async () => {
    const result = await checkVatNumber('DE123456789', {
      enabled: true,
      fetch: json({ requestDate: '2026-08-19' }),
    })

    expect(result).toMatchObject({ accepted: true, online: 'unavailable' })
  })

  it('fails open when the body is not an object', async () => {
    const result = await checkVatNumber('DE123456789', { enabled: true, fetch: json('nope') })

    expect(result).toMatchObject({ accepted: true, online: 'unavailable' })
  })

  it('keeps the offline result alongside the online one', async () => {
    const result = await checkVatNumber('DE123456789', { enabled: true, fetch: json({}, false) })

    expect(result.format).toMatchObject({ country: 'DE', valid: true })
  })
})
