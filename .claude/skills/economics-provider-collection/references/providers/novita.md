# Novita Connector Guide

Canonical vendor: `novita`. This covers direct Novita billing only. Novita
inference purchased through OpenRouter or Vercel remains billed to those vendors.

## Sources

Official documentation, authenticated billing APIs and the billing dashboard
verified 2026-10-06. Model/API-key token quantities, request counts and precise
charges reconcile with each other and the monthly dashboard. Documentation
alone is not evidence of an account balance.

Use an existing authorized `NOVITA_API_KEY` with Bearer authentication. Load it
directly from its secure location into the request process; never print it,
put it in a command argument, or retain authorization headers in evidence.
If access is missing, ask for its secure location. Adding or deploying a key
requires the separate repository secret approval.

Before collecting, confirm the Novita customer/team and register its canonical
account, lifecycle and access target. Do not infer the account from another
provider. For dashboard work enumerate every connected Chrome window and use
the existing tab whose visible account and organization match; ask if ambiguous.
Keep account-specific evidence and raw financial responses outside Git.
The Team settings page exposes the billing team's owner UUID; Account settings
shows the user's UUID. Verify which `userId` billing returns before assigning
evidence, and never treat an API-key `ownerID` as the billing account ID.

| Fact | Supported API and reference |
| --- | --- |
| Model catalog | `GET /openai/v1/models` ([docs](https://docs.novita.ai/api-reference/model-apis-llm-list-models)) |
| Balance | `GET /openapi/v1/billing/balance/detail` ([docs](https://docs.novita.ai/api-reference/basic-get-user-balance)) |
| Model usage | `GET /openapi/v1/billing/bill/list` ([docs](https://docs.novita.ai/api-reference/basic-query-usage-based-billing)) |
| API-key usage | `GET /openapi/v1/billing/apikey/bill/list` ([docs](https://docs.novita.ai/api-reference/basic-query-apikey-bill)) |
| Monthly bills | `GET /openapi/v1/billing/monthly/bill` ([docs](https://docs.novita.ai/api-reference/basic-query-monthly-bill)) |
| Funding/refunds | `GET /openapi/v1/bill/transaction` ([docs](https://docs.novita.ai/api-reference/basic-query-transaction)) |
| Capacity | `GET /openapi/v1/user/quota/list` ([docs](https://docs.novita.ai/api-reference/quota-list)) |

All endpoints above use `https://api.novita.ai`. Prefer these supported APIs;
use the authenticated [console](https://novita.ai/console) for missing evidence.
Send an explicit client `User-Agent`; the default Python urllib client received
HTTP 403 during validation. Quota requests must include `modal=llm`, despite
the documentation marking it optional. Select `quotaType=RPM` or `TPM`,
`productType=Public Endpoint` and the exact `quotaObject`, then verify returned
model names because matching is fuzzy.

Dashboard sources: [model billing](https://novita.ai/billing/details),
[monthly bills](https://novita.ai/billing),
[recharges](https://novita.ai/billing/transactions), and
[voucher lots](https://novita.ai/billing/voucher). Billing records are generated
hourly (storage daily); the monthly overview warns of a T-1 reporting delay.
Monthly bills are issued at 10:00 UTC on the third day of the following month.
Recheck a probe after its reporting window closes before calling it missing.
The billing overview lists deduction priority as Coding Plan, voucher, account
balance, then credit limit. Verify whether a plan applies to the exact product;
do not interpret every token as cash-funded or infer cash burn from list prices.

## Collect and reconcile

1. Save the balance response with its checked time. Monetary balance fields are
   integer strings in 1/10000 USD. `cashBalance` is remaining top-up cash;
   `creditLimit` is borrowing capacity, not a promotional grant. Retain
   `availableBalance`, pending charges and outstanding invoices as distinct
   evidence; do not add these fields together or duplicate them as balance lots.
   Verify voucher balances and expiry separately before recording grants.
2. Query model usage with `cycleType=Day`, `productCategory=llm` and Unix-second
   `startTime`/`endTime`. Query API-key usage with `category=llm` instead.
   Its daily windows are at most 31 days; hourly windows at most seven days.
   Neither usage endpoint paginates: split longer intervals, rather than
   retrying pages. API-key billing supports data from 2026-01-01 onward.
   Both usage endpoints returned daily `endTime` as the last included second;
   add one second for the ledger's end-exclusive UTC bound and retain the
   original bounds. For an in-progress daily row, cap collected coverage at
   the evidence's checked time and mark it partial; a future period end does
   not prove complete coverage. The current month is partial. Collect
   `productCategory=summary` as a control total; never ingest it as additional
   spend alongside detailed categories. `productName` filtering is fuzzy, so
   verify exact returned product IDs/names. Keep non-LLM products separate.
3. Retain product ID/name, key owner ID, request count, every non-zero token or
   cache quantity, discount and funding split. Use the decimal USD strings
   `amountDecimal`, `voucherAmountDecimal` and `payableDecimal` for total,
   credit-funded and cash-funded usage. Parse with decimal arithmetic and check
   total equals voucher plus payable. `originAmountDecimal` is the amount
   before discounts. The documented integer fields `amount`, `voucherAmount`
   and `payAmount` use 1/10000 USD, but lose fractional charges: a nonzero
   decimal charge can have an integer amount of zero. Do not use these fields
   or `payAmountDisplay` to replace precise totals. Unit prices in USD are
   `basePriceN / 10000 / pricePrecision` (likewise `discountPriceN`); do not
   rebuild charges from those rates when precise reported charges are present.
   Record usage as negative paid/credit under the verified canonical account.
   `billNum0..5` in model-usage billing represent input, output, cache read,
   five-minute cache write, reasoning and one-hour cache write quantities.
   The API-key documentation inconsistently calls some `billNum` fields prices;
   validate them against model-usage rows, response usage and dashboard exports
   before treating them as token counts. The reasoning quantity is documented
   as currently unsupported; do not infer a separate charge or add reasoning
   tokens to output without exact-route evidence. Retain every other non-zero
   `billNum`, multimodal or tiered field and resolve its unit before closing.
   Model totals and API-key totals are alternative views of the same usage;
   reconcile them without appending both. Free/promotion rows can have positive
   tokens and requests with zero cost; preserve them as usage evidence.
   Voucher deductions are credit-funded usage; they are not a cash top-up.
   Check each voucher's eligible products, validity and remaining value.
   Record Model API-eligible vouchers as separate inference balance lots with
   their product restriction in `resource_name` and evidence. Keep Agent Sandbox
   vouchers in separate supporting evidence; the current provider forecast does
   not enforce product eligibility, so adding them to the inference balance
   would overstate usable credits. Verify the timezone of displayed
   expiry dates before normalizing them. A dashboard label of account balance
   does not by itself prove the money was purchased: retain recharge records
   or grant evidence before deciding paid versus promotional funding.
4. Query monthly bills with `startMonth`, `page` and `pageSize`; retain only the
   requested billing month and verify pagination/coverage. Reconcile the USD
   strings `totalAmountDecimal`, `voucherPayAmountDecimal` and
   `cashPayAmountDecimal` with precise usage. Keep debt, repayments, tax and
   gross amounts separate. The live current-month summary returned `endTime`
   before `startTime`; never use invalid summary bounds as usage coverage.
   Use the detailed usage rows and verified `billingMonth` instead.
   Download `invoiceUrl` when present. An empty URL is missing invoice evidence,
   not proof that no invoice is required. Archive documents using the parent
   skill's Drive flow.
5. Query transactions with `pageNo`, `pageSize`, `transactionTimeStart` and
   `transactionTimeEnd`; paginate through `total`. Review successful recharges
   and refunds individually. Recharges are funding, never inference usage.
   Match supplier documents and bank payments without counting the same top-up
   twice. A recharge's downloadable document proves funding; it does not close
   the month's model-usage coverage. The documentation says transaction amounts
   use 1/10000 USD, but the verified recharge response corresponds to cents
   against the dashboard, supplier invoice/payment receipt and cash balance.
   Verify the exact supplier document before ingesting funding; do not apply the
   balance/usage divisor automatically to transactions or wallet balances.
   `invoiceURL` can open a Stripe invoice page rather than return PDF bytes;
   download both the invoice and payment receipt from that page. Preserve the
   invoiced USD amount and any different settlement currency on the receipt.
   Link funding documents to the balance snapshot and matching bank movement.
   Do not append a top-up as a positive non-balance `paid` vendor row: the
   existing dashboard interprets that as a billing refund and reduces usage.
6. Add reviewed `modelLabels` only from exact billed lines and the Pollen ID used
   in that period. Keep missing mappings visible. Reconcile against Pollen rows
   whose serving provider is `novita`, including local/staging/manual usage
   sharing the account. Never move OpenRouter/Vercel spend to Novita based on
   the physical backend name.
7. Prepare the exact ledger batch, backup and totals under the parent skill's
   approval rules. Validate staging first with the staging Economics read token;
   production writes require separate approval. Verify balances, model usage,
   funding, invoice coverage and provider reconciliation in the dashboard.

Never fabricate zero usage or balances from an empty, unauthorized or partial
response. Missing account coverage prevents a complete provider-month close.
