# Azure Connector Guide

Canonical vendor: `azure`

## Empirical status — 2026-07-10

- Status: client-credential authentication and the invoices API work.
- The June billing-period query returned four invoices: three zero-EUR
  invoices issued during June and one EUR 3,798.88 invoice issued July 9.
- Do not sum every returned invoice blindly. Select the monthly obligation
  and preserve invoice date separately from the covered billing period.

Use when:

- collecting Microsoft Azure invoice/billing-profile evidence
- tracking startup sponsorship credits and card-paid Azure usage
- reconciling Azure invoices and cloud usage rows

Primary evidence sources:

- Invoice/payment: monthly Azure/Microsoft invoice, usually issued around day 9 for the previous calendar month.
- Dashboard/usage: Azure billing profile and sponsorship/credit pages.
- API: Microsoft Billing invoices API through ARM.
- Detailed usage: Azure cost/usage CSV or dashboard export when service, SKU, or
  model/inference classification matters.
- Transaction context: `op_transactions` vendor `azure`.

Collection steps:

1. For invoices, place PDFs/receipts in `data/inbox/`.
2. For API evidence, query the billing profile invoices endpoint for the requested period only.
3. Required credentials:
   - `AZURE_TENANT_ID`
   - `AZURE_CLIENT_ID`
   - `AZURE_CLIENT_SECRET`
   - `AZURE_BILLING_ACCOUNT`
   - `AZURE_BILLING_PROFILE`
4. Token flow:

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

5. Invoice endpoint:

   Microsoft documents `periodStartDate` and `periodEndDate` as `MM-DD-YYYY`.

   ```bash
   curl -fsS \
     -H "Authorization: Bearer $TOKEN" \
     "https://management.azure.com/providers/Microsoft.Billing/billingAccounts/$AZURE_BILLING_ACCOUNT/billingProfiles/$AZURE_BILLING_PROFILE/invoices?api-version=2024-04-01&periodStartDate=<MM-DD-YYYY>&periodEndDate=<MM-DD-YYYY>" \
     > "data/inbox/azure-<YYYY-MM>-billing-invoices.json"
   ```

6. Save raw API JSON to `data/inbox/azure-<period>-billing-invoices.json`.
7. Use `agent.system.txt` with `mode: extract` for saved raw evidence.

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
- Local historical note: startup lot runs 2026-04-06 to 2028-04-06; Jan-Mar 2026 invoices had no sponsorship credit and were card-charged in full.
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
