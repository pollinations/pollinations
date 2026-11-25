# Azure Connector Guide

Canonical vendor: `azure`

## Verified — 2026-11-03

- Status: client-credential authentication, invoices, current credits and
  funding-lot APIs work.
- Dashboard login: `thomas@myceli.ai`. Use the registry's billing-profile link
  → Payment methods → Azure credits → View all credits (verified 2026-09-05).
- Browser fallback: sign into Azure as `thomas@myceli.ai` in an existing
  Workspace Chrome window and verify the billing profile. The Chrome profile
  itself need not use that email.
- Billing account:
  `d6c5b3e7-63ac-515a-8674-de5afbaec90d:d9f4ee4f-6add-42d1-ad32-b0cf92f726f4_2019-05-31`.
- Billing profile: `7E4U-QBXO-BG7-PGB`. Verify both the signed-in email and
  billing profile before collecting; do not start from the generic portal.
- Subscription `7725a3f5-6483-4079-ba51-a317aa4fc09e` is an alias of that
  billing account for balance-ledger coverage, not a second balance.
- The subscription Cost Management query also works. A 2026 year-to-date
  `ActualCost` query grouped by `ServiceName` and `Meter` returned exact model,
  SKU, infrastructure, usage-quantity, and month detail, including August MTD.
- Do not sum every returned invoice blindly. Select the monthly obligation
  and preserve invoice date separately from the covered billing period.

Primary evidence sources:

- Invoice/payment: monthly Azure/Microsoft invoice, usually issued around day 9 for the previous calendar month.
- Live credit balance: ARM credit summary and funding-lot APIs below. The
  matching billing-profile dashboard remains the fallback. Its prominent EUR
  balance is a translated estimate, not the original credit currency.
- API: Microsoft Billing invoices API through ARM.
- Detailed usage: subscription Cost Management API, or Azure cost/usage CSV,
  when service, SKU, or
  model/inference classification matters.
- Transaction context: `economics_bank_ledger` vendor `azure`.

Collection steps:

1. For invoices, place PDFs/receipts in `<collection-dir>/evidence/`.
2. Read both endpoints under
   `/providers/Microsoft.Billing/billingAccounts/{account}/billingProfiles/{profile}/providers/Microsoft.Consumption/`:
   `credits/balanceSummary?api-version=2024-08-01` and
   `lots?api-version=2024-08-01`. Archive both responses. Use the provider's
   `balanceSummary.estimatedBalance` in `creditCurrency` after checking pending
   eligible charges and active lots; retain its estimate status. Do not convert
   `estimatedBalanceInBillingCurrency` back to the credit currency. Exclude
   exhausted lots when identifying expiry. If several funded lots remain,
   preserve their individual evidence without allocating profile-wide pending
   charges arbitrarily.
3. For API evidence, query the billing profile invoices endpoint for the requested period only.
4. Required credentials:
   - `AZURE_TENANT_ID`
   - `AZURE_CLIENT_ID`
   - `AZURE_CLIENT_SECRET`
   - `AZURE_BILLING_ACCOUNT`
   - `AZURE_BILLING_PROFILE`
   - `AZURE_SUBSCRIPTION_ID`
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
     > "<collection-dir>/evidence/azure-<YYYY-MM>-billing-invoices.json"
   ```

7. Save raw API JSON to `<collection-dir>/evidence/azure-<period>-billing-invoices.json`.
8. For closed months, export Transactions from the monthly invoice in the
   billing profile. The CSV may begin with `SEP=,`; skip that line before
   parsing. Group only identical product family/product/SKU lines and pair
   usage charges with their credit lines. Preserve the exact invoice amounts
   and any cash-funded remainder, including small nonzero amounts. Verify the
   grouped charges, credits and net against the invoice.
9. Query subscription Cost Management with monthly granularity grouped by
   `ServiceName` and `Meter` for model labels and usage cross-checks. Raw costs
   can differ from finalized invoice transactions; do not proportionally
   allocate invoice totals when exact transaction lines are available.
   For `ActualCost`, use explicit first-day UTC midnight through final-day
   23:59:59 bounds and verify BillingMonth, currency and pagination. Honor
   retry headers on 429 responses. Before the invoice arrives, retain complete
   usage as non-posting source evidence if its cash/credit funding is unknown.
   Query `Product`/`Meter` for exact billed-product qualification and reconcile
   its total to the service/meter export. Preserve Product as `resource_sku`
   and Meter as `model` for `Meter | Product` mapping keys; do not substitute
   ServiceName or allocate region splits.
10. Use this skill for saved raw evidence.

## Verified — 2026-09-06

- The `Standard Text Records` meter under service category `Foundry Tools` is
  Azure AI Content Safety (`/contentsafety/text:analyze`, called by gen on image
  prompts). It is the safety layer, not a model: book it as `type: infra`
  (`resource_name: Azure AI Content Safety`), never as inference. Meta models
  bill as their own `Llama … Tokens` meters.

Known traps:

- Invoice periods should cover a full calendar month; skip one-day purchase receipts unless the user explicitly asks to ingest them.
- Use `billedAmount.value` for total invoice charges.
- Use `totalAmount.value` or `amountDue.value` for payable/due amount when payments are absent.
- Use `payments[].amount.value` when present for actual cash payment evidence.
- Use `freeAzureCreditApplied.value` and `azurePrepaymentApplied.value` for Azure credit/prepayment burn.
- Do not treat `creditAmount` alone as sponsorship credit; Azure documents it
  as refunds, returns, or cancellations. Paired invoice credit transactions
  corroborated by the Azure credits ledger establish the actual funding split,
  even with a nonzero cash remainder or zero `freeAzureCreditApplied`.
- Exception: if a full-month invoice has `billedAmount.value > 0`,
  `totalAmount.value == 0`, `amountDue.value == 0`, no payments, and
  `creditAmount.value == -billedAmount.value`, the invoice is evidence that the
  billed usage was fully offset by credit. Record this explicitly in
  `reconciliation_notes` because Azure may still show
  `freeAzureCreditApplied.value == 0` and `azurePrepaymentApplied.value == 0`.
- The running month has no full invoice until the next invoice is issued.
- A large current grant and pending eligible charges do not establish the
  closed month's funding split. When the monthly invoice/Transactions export
  is the remaining dependency, record its expected issue date and continue
  usage, mapping and current-balance checks independently.
- Non-Foundry services can contain model usage: Azure Speech Fast Transcription
  Promo is distinct from MAI Models streaming transcription. Use original
  product/meter identity, effective retail SKU, runtime route and same-month
  Pollen evidence for attribution; rates identify the product, not a formula
  for rebuilding billed cost. Unmatched model products remain unattributed.
- Keep each active grant's amount, effective date, expiry, and status in the
  evidence. Do not assign an exhausted grant's expiry to the current balance.
  Jan-Mar 2026 invoices had no sponsorship credit and were card-charged in full.
- Credit-transactions rows include finalized invoice balances and a gray,
  unbilled month-to-date row. For a current balance snapshot, use the balance
  after that unbilled row. For a closed-month reconciliation, use the finalized
  invoice row instead.
- Currency is usually EUR in the local billing profile.
- Dry-run mode: do not write the API dump. Verify command shape, env presence, period bounds, and intended `source_file` path only. Set `source_file` to the intended `<collection-dir>/evidence` path and mention dry-run paths in `reconciliation_notes`.
