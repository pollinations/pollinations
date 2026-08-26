# Azure Connector Guide

Canonical vendor: `azure`

## Verified — 2026-08-22

- Status: client-credential authentication and the invoices API work.
- Dashboard login: `thomas@myceli.ai`. In Azure Portal, open Cost Management +
  Billing → Benefits → Azure credits.
- The subscription Cost Management query also works. A 2026 year-to-date
  `ActualCost` query grouped by `ServiceName` and `Meter` returned exact model,
  SKU, infrastructure, usage-quantity, and month detail, including August MTD.
- Do not sum every returned invoice blindly. Select the monthly obligation
  and preserve invoice date separately from the covered billing period.

Use when:

- collecting Microsoft Azure invoice/billing-profile evidence
- tracking startup sponsorship credits and card-paid Azure usage
- reconciling Azure invoices and cloud usage rows

Primary evidence sources:

- Invoice/payment: monthly Azure/Microsoft invoice, usually issued around day 9 for the previous calendar month.
- Live credit balance and expiry: Azure Portal → Cost Management + Billing →
  Benefits → Azure credits. Use the latest USD transaction balance after
  unbilled eligible charges for the OP Cloud balance snapshot. The prominent
  EUR balance is an estimated display translated at a monthly benchmark rate.
- API: Microsoft Billing invoices API through ARM.
- Detailed usage: subscription Cost Management API, or Azure cost/usage CSV,
  when service, SKU, or
  model/inference classification matters.
- Transaction context: `economics_bank_ledger` vendor `azure`.

Collection steps:

1. For invoices, place PDFs/receipts in `data/inbox/`.
2. For the current balance, record one dated `type: balance` OP Cloud snapshot
   from the latest USD balance in the Azure credit-transactions table. Do not
   convert the displayed EUR estimate back to USD.
3. For API evidence, query the billing profile invoices endpoint for the requested period only.
4. Required credentials:
   - `AZURE_TENANT_ID`
   - `AZURE_CLIENT_ID`
   - `AZURE_CLIENT_SECRET`
   - `AZURE_BILLING_ACCOUNT`
   - `AZURE_BILLING_PROFILE`
5. Token flow:

   ```bash
   for v in AZURE_TENANT_ID AZURE_CLIENT_ID AZURE_CLIENT_SECRET AZURE_BILLING_ACCOUNT AZURE_BILLING_PROFILE; do
     test -n "$(eval "printf %s \"\${$v}\"")" || echo "missing $v"
   done

   TOKEN="$(
     curl -fsS -X POST "https://login.microsoftonline.com/$AZURE_TENANT_ID/oauth2/v2.0/token" \
       -H "Content-Type: application/x-www-form-urlencoded" \
       --data-urlencode "grant_type=client_credentials" \
       --data-urlencode "client_id=$AZURE_CLIENT_ID" \
       --data-urlencode "client_secret=$AZURE_CLIENT_SECRET" \
       --data-urlencode "scope=https://management.azure.com/.default" \
     | jq -r '.access_token'
   )"
   ```

6. Invoice endpoint:

   Microsoft documents `periodStartDate` and `periodEndDate` as `MM-DD-YYYY`.

   ```bash
   curl -fsS \
     -H "Authorization: Bearer $TOKEN" \
     "https://management.azure.com/providers/Microsoft.Billing/billingAccounts/$AZURE_BILLING_ACCOUNT/billingProfiles/$AZURE_BILLING_PROFILE/invoices?api-version=2024-04-01&periodStartDate=<MM-DD-YYYY>&periodEndDate=<MM-DD-YYYY>" \
     > "data/inbox/azure-<YYYY-MM>-billing-invoices.json"
   ```

7. Save raw API JSON to `data/inbox/azure-<period>-billing-invoices.json`.
8. For provider detail, query the subscription Cost Management endpoint with
   monthly granularity and group by `ServiceName` and `Meter`. Preserve the raw
   values; for closed months, allocate the final invoice total and funding split
   across meter rows so the detailed ledger still ties exactly to the invoice.
9. Use `agent.system.txt` with `mode: extract` for saved raw evidence.

Expected entry:

- `cost_category`: `infrastructure`, `model`, `inference_serverless`, or `credit` depending on the source detail
- `op_cloud_type`: `infra` by default; `inference` if Azure OpenAI/model usage is explicit
- `op_transaction_category`: `cloud` for invoices/payments, `null` for pure credit/usage evidence
- `should_match_op_transaction`: true for paid invoices/card charges, false for pure credit burn or usage evidence
- `should_match_op_cloud`: true for Azure usage/cost evidence

Known traps:

- Invoice periods should cover a full calendar month; skip one-day purchase receipts unless the user explicitly asks to ingest them.
- Use `billedAmount.value` for total invoice charges.
- Use `totalAmount.value` or `amountDue.value` for payable/due amount when payments are absent.
- Use `payments[].amount.value` when present for actual cash payment evidence.
- Use `freeAzureCreditApplied.value` and `azurePrepaymentApplied.value` for Azure credit/prepayment burn.
- Do not treat `creditAmount` as sponsorship credit; Azure documents it as refunds, returns, or cancellations.
- Exception: if a full-month invoice has `billedAmount.value > 0`,
  `totalAmount.value == 0`, `amountDue.value == 0`, no payments, and
  `creditAmount.value == -billedAmount.value`, the invoice is evidence that the
  billed usage was fully offset by credit. Record this explicitly in
  `reconciliation_notes` because Azure may still show
  `freeAzureCreditApplied.value == 0` and `azurePrepaymentApplied.value == 0`.
- The running month has no full invoice until the next invoice is issued.
- Local historical note: the first USD 100,000 startup lot is fully used. The
  active USD 250,036 lot runs 2026-04-06 to 2028-04-06. Jan-Mar 2026 invoices
  had no sponsorship credit and were card-charged in full.
- Credit-transactions rows include finalized invoice balances and a gray,
  unbilled month-to-date row. For a current balance snapshot, use the balance
  after that unbilled row. For a closed-month reconciliation, use the finalized
  invoice row instead.
- Currency is usually EUR in the local billing profile.
- Dry-run mode: do not write the API dump. Verify command shape, env presence, period bounds, and intended `source_file` path only. Set `source_file` to the intended `data/inbox` path and mention dry-run paths in `reconciliation_notes`.

Reconciliation notes:

- Invoice/API billing evidence can explain both paid transaction rows and cloud usage rows.
- Sponsorship-credit months should not be forced to match cash transactions.
- If the invoice lacks service breakdown, use it for the ledger-level cash/credit
  amount only. Use Azure usage exports or dashboard evidence for detailed
  service/model/GPU attribution; if those are unavailable, classify cautiously
  and explain the limitation in `reconciliation_notes`.

## Rotation

- Rotates the Azure OpenAI/Cognitive Services keys gen.pollinations.ai uses for
  model calls (key1/key2 slots per resource: `east`, `sweden`, `safety`) — a
  different credential from this connector's `AZURE_CLIENT_ID`/`AZURE_TENANT_ID`/
  `AZURE_CLIENT_SECRET` billing-API app registration, so rotating it does not
  affect billing collection here.
- Mechanism: each Cognitive Services resource exposes two key slots. Detect
  which slot the current SOPS value matches, regenerate the unused slot, then
  switch SOPS to it. The previous slot stays valid the whole time — true
  zero-downtime, no delete step needed.
- SOPS files: `gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json`.
- Deploy target: gen's Cloudflare deploy workflow. Health check:
  `POST gen.pollinations.ai/v1/chat/completions` against an Azure-backed model
  → 200.
- The `safety` resource lives in a subscription not visible under the default
  `az` context — run `az account set --subscription <other>` first.
