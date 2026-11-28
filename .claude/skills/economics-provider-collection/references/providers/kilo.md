# Kilo Gateway Connector Guide

Canonical vendor is `kilo`. Use `kilo` as the connector in the private vendor
journal. Verify the signed-in personal account or organization against that
journal before collecting. Keep account IDs, financial evidence, and credentials
outside the repository.

## Usage

The [Kilo Analytics API](https://app.kilo.ai/api/docs) accepts an existing
authorized Kilo bearer credential. Load it into the request process through a
secure input and exclude authorization headers from logs and evidence.

1. Call `GET https://app.kilo.ai/api/trpc/usageAnalytics.getSummary` and
   `GET https://app.kilo.ai/api/trpc/usageAnalytics.getTable`. Send a URL-encoded
   `input` query parameter containing the JSON object directly. Both calls take
   UTC ISO timestamps in `startDate` and `endDate`, `granularity: "day"`, and
   `costSource: "cost"`. Use `personalScope: "personal-only"` and
   `viewAs: "self"` for personal usage. For an organization, use the verified
   `organizationId` with `viewAs: "org-wide"` and a credential authorized for
   that organization's data.
2. Use `groupBy: ["model", "inferenceProvider"]` for the table. Set an explicit
   `limit` (maximum 10,000). Reconcile request counts and
   `costMicrodollars` to the summary over the same UTC period. Divide
   microdollars by 1,000,000 to get USD. Split a truncated period into smaller,
   disjoint intervals and verify coverage before closing. Preserve the source
   model ID and use the serving provider as supporting evidence. Kilo-funded
   usage belongs to Kilo even when another company serves the inference.
   Keep BYOK counts separate and reconcile their spend to the direct provider.
3. Use the signed-in [Usage dashboard](https://app.kilo.ai/usage) and its CSV
   export when the API cannot provide complete evidence. Check the selected
   scope and actual period. Keep Cloud Agent compute separate from inference.
   If Kilo says recent activity is still processing, recheck before treating an
   empty report as zero. Per-request `usage.cost` in a Gateway completion or
   terminal SSE chunk is supporting evidence and does not prove monthly
   coverage. A requested provider is not proof of the serving backend. Use
   `inferenceProvider` in analytics or organization Request Logs to verify it.

Personal API authentication and input verified on 2026-11-18. The API returned
before the recent activity became visible in the dashboard. Organization
analytics access and monthly coverage still need verification for each account.

## Credits and invoices

1. Open [Credits](https://app.kilo.ai/credits) in the verified scope. Record
   available balance, funding and expiry from the purchase and credit history.
   Purchased credits and paid Kilo Pass allotments expire a year after
   issuance under current terms. Bonus credits expire at the end of their
   monthly cycle. Use the displayed expiry for each lot, and record whether a
   remaining balance can be separated by funding source.
2. Open **View invoice** for each relevant purchase or use
   [Invoices](https://app.kilo.ai/invoices). Archive the original invoice or
   receipt and match it to the bank settlement, including any separately
   charged fee or tax. Keep top-ups and Pass funding separate from inference
   usage. Record any Teams seat charges separately from prepaid credits.
3. Follow the [Drive archive procedure](../drive-archive.md) for raw exports,
   balance evidence, and original documents. Use the parent skill's ledger
   approval rules before writing account data.

See [Kilo billing](https://kilo.ai/docs/gateway/usage-and-billing) and
[organization analytics](https://kilo.ai/docs/collaborate/teams/analytics)
for provider terms and reporting fields.
