# payload-tax-eu

[![npm](https://img.shields.io/npm/v/payload-tax-eu?style=flat-square&color=0F766E)](https://www.npmjs.com/package/payload-tax-eu) ![node](https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square) ![license](https://img.shields.io/badge/license-MIT-6C757D?style=flat-square)

Works out EU VAT for a Payload shop and writes the result onto the order: the rate applied, the taxable base, the VAT, the country and whether reverse charge took over, so that a quarter later you can still say why a customer was charged what they were charged.

- Works with `@payloadcms/plugin-ecommerce` and with any collection that holds orders
- Integer minor units from end to end, so nothing is ever held as a fraction
- No runtime dependencies. VIES, when you switch it on, uses `fetch`
- No admin components, so it survives minor releases

## Install

```bash
pnpm add payload-tax-eu
```

```ts
import { taxEuPlugin } from 'payload-tax-eu'

export default buildConfig({
  plugins: [
    taxEuPlugin({
      sellerCountry: 'GR',
      pricesIncludeTax: true,
    }),
  ],
})
```

`sellerCountry` has no default and no sensible guess behind it. It is what separates a domestic sale from a cross border one, and without it the package refuses to work rather than pick for you.

### Working out what to charge

The plugin records. It does not charge. The amount that reaches the payment provider is decided by your checkout, so that is where the calculation belongs:

```ts
import { calculateTax } from 'payload-tax-eu'

const vat = calculateTax(
  {
    country: 'DE',
    lines: [{ amount: 2000 }, { amount: 1500, rateType: 'reduced' }],
  },
  { sellerCountry: 'GR' },
)

// vat.net 3500, vat.tax 485, vat.gross 3985
```

Pass `vatNumber` as well and a valid number from another member state turns the same call into a zero rated reverse charge, with `vat.reverseChargeNote` carrying the wording the invoice has to show.

Every amount is an integer in minor units, the same unit `@payloadcms/plugin-ecommerce` stores: `2000` is twenty euros.

## What was measured

Measured on 19 August 2026 against the published contents of `@payloadcms/plugin-ecommerce@3.88.0`.

**The official plugin has no tax of any kind.** A case insensitive search for `tax` across the whole of its `dist`, every file including the twenty translation bundles and the source maps, returns nothing:

| Search | Files matched |
| --- | --- |
| `tax`, case insensitive, whole `dist` | 0 |

The orders collection it creates carries `items`, `shippingAddress`, `customer`, `customerEmail`, `transactions`, `status`, `amount` and `currency`. There is no tax field, no tax rate, no VAT number and no place of supply. The survey behind this kit found no third party Payload package covering tax either.

**Amounts are already in minor units.** From `dist/ui/utilities.js`:

```
Math.round(floatValue * Math.pow(10, currency.decimals))
```

EUR, USD and GBP are all declared with `decimals: 2`. This package therefore works in whole minor units throughout and never converts to a float, not once, not even to round.

**Countries are ISO 3166-1 alpha-2.** `dist/collections/addresses/defaultCountries.js` states it and uses it. The rate table and the place of supply rules use the same codes, with the one exception below.

**Greece is two codes.** Its ISO code is `GR` and its VAT prefix is `EL`. Both are accepted everywhere a country is read, `EL` normalises to `GR`, and a Greek VAT number is sent to VIES as `EL`.

### Rounding, measured on this package

Rounding is not a detail here, it is the whole job. Three lines of `333` at 19 per cent:

| `rounding` | Line tax | Order tax |
| --- | --- | --- |
| `'line'`, the default | 63, 63, 63 | 189 |
| `'total'` | 64, 63, 63 | 190 |

Both are defensible and both are in use across the EU. What is not defensible is a total that does not equal the sum of its lines, so under `'total'` the rounded group tax is shared back out by largest remainder and the lines always add up to it exactly.

Halves round away from zero, in both directions, so that a credit note is the exact mirror of the sale it reverses: `50` at 19 per cent gives `10`, and `-50` gives `-10`.

Inclusive and exclusive are not the same number read two ways. `1000` at 24 per cent adds `240` when prices exclude VAT, and contains `194` when they include it. Both are correct; they answer different questions.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `amountPath` | `'amount'` | Dot path to the order total the hook reads |
| `countryPath` | `'shippingAddress.country'` | Dot path to the customer country on the order |
| `datePath` | `'createdAt'` | Dot path to the date of supply, which picks the rate version |
| `defaultRateType` | `'standard'` | Band used by lines that do not name one |
| `disabled` | `false` | Stops the hook writing but keeps the fields, so the database keeps its shape |
| `fieldName` | `'tax'` | Name of the group field holding the breakdown |
| `onUnknownCountry` | `'error'` | `'error'` refuses, `'zero'` applies no tax and marks the result unresolved |
| `ordersSlug` | `'orders'` | Slug of the orders collection |
| `placeOfSupply` | `'destination'` | `'origin'` charges your own rate on cross border consumer sales |
| `pricesIncludeTax` | `false` | Whether the amounts you pass already contain VAT |
| `quoteEndpoint` | `true` | Mounts `POST /api/tax/quote` |
| `quoteEndpointAccess` | everyone | Who may ask for a quote |
| `rates` | `[]` | Your own rate entries. They win over the built in table |
| `reportEndpoint` | `true` | Mounts `GET /api/tax/oss-report` |
| `reportEndpointAccess` | `roles` contains `'admin'` | Who may read the report |
| `reportPageSize` | `500` | Orders read per page while building the report |
| `reportStatuses` | `['processing', 'completed']` | Statuses counted. An empty array counts every status |
| `reverseChargeNote` | `'Reverse charge. VAT to be accounted for by the recipient.'` | Wording written onto a zero rated order |
| `rounding` | `'line'` | `'line'` rounds each line, `'total'` rounds each rate group once |
| `routePrefix` | `'/tax'` | Path both endpoints sit under |
| `sellerCountry` | none | Your country. Required for any supply inside the EU |
| `useBuiltInRates` | `true` | Set `false` to use only the rates you supply |
| `vatNumberPath` | `'<fieldName>.vatNumber'` | Dot path to the customer VAT number on the order |
| `vies.enabled` | `false` | Turns on the online check. This is a network call |
| `vies.endpoint` | the VIES REST API | URL template, `{country}` and `{number}` are replaced |
| `vies.timeoutMs` | `3000` | Milliseconds before the call is abandoned |
| `vies.useInQuote` | `false` | Lets the public quote endpoint call VIES too |
| `vies.fetch` | global `fetch` | Replacement, for a proxy or for tests |

A value that cannot be used is replaced by its default rather than being applied. A `reportPageSize` of `0` becomes `500`, an unknown `rounding` becomes `'line'`, and a `routePrefix` of `vat/` becomes `/vat`.

## Place of supply

| Customer | VAT number | What happens |
| --- | --- | --- |
| Your own country | none or any | Your rate. Reverse charge does not apply inside one member state |
| Another member state | none, or one that fails validation | The customer country rate, and the reason is written to `note` |
| Another member state | valid, issued by a state other than yours | Zero rated, `reverseCharge` true, and `note` carries the invoice wording |
| Outside the EU | any | No EU VAT, `scope` is `outside-eu` |
| Not given | any | Refused, unless `onUnknownCountry` is `'zero'` |

A VAT number is checked for the shape its country uses, offline and instantly. Turning on `vies.enabled` adds a call to the European Commission's VIES service. That call **fails open**: a timeout, a network error, a refusal or an answer with no verdict in it all leave the offline result standing. A VIES outage never turns a sale away, and the outcome is recorded on the order so you can see which orders were accepted without confirmation.

## Endpoints

**`POST /api/tax/quote`**, public by default. Arithmetic on numbers the caller supplied; it reads nothing from the database.

```json
{ "country": "DE", "lines": [{ "amount": 2000, "id": "line-1" }], "vatNumber": "DE123456789" }
```

Answers with the full calculation. A refusal comes back as `{ "code": "unknown-country", "message": "..." }` with the right status, not as an empty object.

**`GET /api/tax/oss-report?from=2026-01-01&to=2026-03-31`**, admins only by default. Totals per country per period, split the way a return needs them:

| Key | What is in it |
| --- | --- |
| `oss` | Cross border consumer sales by country, then by rate. The OSS return itself |
| `domestic` | Sales in your own country. These belong in the national return |
| `reverseCharge` | Zero rated business sales. These belong in the recapitulative statement |
| `outsideEu` | Sales outside the EU VAT area |
| `unresolved` | Orders whose place of supply was never established, listed by id |
| `totals` | Taxable base and VAT across everything counted |

The report reads orders through the request it was called on, so it stays inside the transaction that request already opened.

## What it adds to your database

One group field on your orders collection. Nothing else, and no collection of its own.

| Field | Type | Notes |
| --- | --- | --- |
| `tax.country` | text | Country whose rate was applied. Indexed |
| `tax.scope` | select | `domestic`, `intra-eu-b2c`, `intra-eu-b2b`, `outside-eu`, `unknown` |
| `tax.rate` | number | Per cent, when one single rate applied. Null when the order mixes bands |
| `tax.taxableBase` | number | Minor units |
| `tax.taxAmount` | number | Minor units |
| `tax.reverseCharge` | checkbox | |
| `tax.resolved` | checkbox | False when the place of supply was never established |
| `tax.pricesIncludeTax` | checkbox | How the amount was read |
| `tax.vatNumber` | text | The one field here your checkout writes, the rest are computed |
| `tax.vatNumberCheck` | select | `none`, `format`, `vies-valid`, `vies-invalid`, `vies-unavailable` |
| `tax.note` | text | Reverse charge wording, or why the result is what it is |
| `tax.calculatedAt` | date | |
| `tax.breakdown` | array | `rate`, `taxableBase`, `taxAmount` per rate |

The hook runs `beforeChange` on create only. It never touches the order total, and it leaves a breakdown alone if your checkout has already written one.

## Honest limits

**Rates change, and keeping them right is yours.** The built in table holds the standard and reduced rates of the twenty seven member states as compiled on **19 August 2026**, exported as `euVatRates` and dated as `euVatRatesUpdated`. It is a starting point, not an authority, and it is not legal advice. Check it against your tax authority and override what is out of date:

```ts
taxEuPlugin({
  sellerCountry: 'GR',
  rates: [
    { country: 'DE', from: '2027-01-01', standard: 20 },
  ],
})
```

An entry with a `from` date wins over one without, so adding a future rate does not rewrite the orders you already took. Give a rate a `to` date and it stops applying after it. Orders are always rated on their own date of supply.

**The plugin records, it does not charge.** `@payloadcms/plugin-ecommerce` sends `amount` to the payment provider and this package never alters it. With `pricesIncludeTax: true` that is the whole story: the amount is the gross and the breakdown splits it. With `pricesIncludeTax: false` the amount is the net, and unless your checkout adds `calculateTax(...).tax` to the figure it sends, **the customer will not be charged the VAT the order records**. Exclusive pricing is only safe if you do that step.

**An order can be saved without a resolved tax.** If the country is missing or a rate cannot be found, the hook writes `resolved: false` with the reason and logs the error, and the order still saves. Losing a sale is worse than losing a label. The report lists these orders by id so that nothing hides: fix them before you file.

`calculateTax` behaves the other way round. Called directly it throws a `TaxError` rather than returning zero, because a checkout that quietly charges no VAT is worse than one that stops.

**A format check is not a registration check.** The offline check knows the shape of a VAT number in each member state, including Northern Ireland's `XI`. It does not verify checksums and it cannot know whether a number is registered, or to whom. Only VIES knows that, and VIES here fails open by design.

**Territory level rules are not applied.** Rates are held per country. The Canary Islands, Ceuta and Melilla, Madeira and the Azores, Åland, Büsingen, Campione and the rest of the special territories are not separated out, and postcode level rules do not exist here. If you sell into them, add your own entries and route those orders yourself.

**Northern Ireland is recognised, not rated.** `XI` VAT numbers pass the format check because VIES issues them. `XI` is not in the rate table. Add it yourself if you supply goods there.

**The small business threshold is not applied for you.** Below the EU wide distance selling threshold a micro business may charge its own rate on cross border consumer sales. Set `placeOfSupply: 'origin'` when that applies to you. The package will not work out whether it does, and will not warn you when you cross the threshold.

**Amounts have a ceiling.** Anything above 1,000,000,000,000 minor units is refused rather than risking a loss of precision.

**No admin interface.** The breakdown is visible on the order and the report is an endpoint. Reading it into a spreadsheet, or filing it, is your part.

## License

MIT. Copyright George Vasiliades, https://github.com/Poseidonas
