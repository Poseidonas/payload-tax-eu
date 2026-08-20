export type TaxErrorCode =
  | 'invalid-amount'
  | 'invalid-date'
  | 'invalid-rate'
  | 'no-lines'
  | 'rate-not-found'
  | 'seller-country-required'
  | 'unknown-country'

export class TaxError extends Error {
  readonly code: TaxErrorCode

  constructor(code: TaxErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'TaxError'
  }
}
