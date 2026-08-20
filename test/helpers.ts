import type { PayloadRequest } from 'payload'

export type Logged = { level: string; message: string }

export type FindCall = Record<string, unknown>

export type FindResult = { docs: Record<string, unknown>[]; hasNextPage: boolean }

export const fakeRequest = (
  extra: Record<string, unknown> = {},
  logged: Logged[] = [],
  find: (args: FindCall) => Promise<FindResult> = async () =>
    Promise.resolve({ docs: [], hasNextPage: false }),
): PayloadRequest =>
  ({
    payload: {
      find,
      logger: {
        error: (message: string) => logged.push({ level: 'error', message }),
      },
    },
    user: null,
    ...extra,
  }) as unknown as PayloadRequest

export const pagedFind = (
  pages: Record<string, unknown>[][],
  calls: FindCall[],
): ((args: FindCall) => Promise<FindResult>) => {
  let index = 0

  return async (args) => {
    calls.push(args)

    const docs = pages[index] ?? []

    index += 1

    return Promise.resolve({ docs, hasNextPage: index < pages.length })
  }
}

export const order = (
  id: number,
  tax: null | Record<string, unknown>,
): Record<string, unknown> => (tax === null ? { id } : { id, tax })
