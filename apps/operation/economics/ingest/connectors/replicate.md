# Replicate Connector Guide

Canonical vendor: `replicate`

## Empirical status — 2026-07-10

- Status: account and predictions APIs work; invoice/balance remains manual.
- The token resolved to an organization account. The first predictions page
  contained 100 rows: 97 succeeded and three failed, with another page
  available.
- Predictions prove operational activity, not the amount charged.

Use when:

- collecting Replicate invoice, receipt, billing UI, or Wise/card payment evidence
- checking recent Replicate prediction evidence for missing model usage
- reconciling Replicate invoices against Tinybird metered model costs
- investigating provider-wide gaps before changing individual model prices

Primary evidence sources:

- Invoice/payment: Replicate invoice PDF, billing receipt email, billing UI screenshot, or Wise/card transaction.
- Dashboard: Replicate account billing page for monthly spend, invoices, and payment context.
- API account check: `GET https://api.replicate.com/v1/account`
- API recent predictions: `GET https://api.replicate.com/v1/predictions`
- API model schema: `GET https://api.replicate.com/v1/models/{owner}/{name}`
- Pricing evidence: public Replicate model pages. Pricing is not exposed in the model API.
- Internal usage context: Tinybird `generation_event` rows where `model_provider = 'replicate'`.

Required credential:

- `REPLICATE_API_TOKEN`

Collection steps:

1. For invoices, receipts, or billing screenshots, place the original evidence in `data/inbox/`.
2. Validate the token before API collection:

   ```bash
   curl -sS "https://api.replicate.com/v1/account" \
     -H "Authorization: Bearer $REPLICATE_API_TOKEN"
   ```

   For production evidence, expect the account to be the `myceli-ai` organization.

3. For prediction evidence, query a bounded period where possible:

   ```bash
   curl -sS "https://api.replicate.com/v1/predictions?created_after=<iso_start>&created_before=<iso_end>" \
     -H "Authorization: Bearer $REPLICATE_API_TOKEN"
   ```

   Save raw JSON to `data/inbox/replicate-<period>-predictions.json`. Follow `next` pagination only as far as needed for the requested period.

4. For model schema evidence, fetch each relevant model:

   ```bash
   curl -sS "https://api.replicate.com/v1/models/<owner>/<name>" \
     -H "Authorization: Bearer $REPLICATE_API_TOKEN"
   ```

   Save raw JSON to `data/inbox/replicate-<model>-schema-<date>.json` when model input/output fields are part of the investigation.

5. For model pricing, save model page screenshots or short HTML/text evidence from the public model page. Do not infer pricing from `metrics.predict_time`.
6. For invoice reconciliation, compare Replicate cash/invoice evidence with Tinybird metered Replicate model costs. Treat any remainder as a Replicate-wide reconciliation item until the missing source is identified.
7. Use `agent.system.txt` with `mode: extract` for saved raw evidence.

Seedance 2.0 pricing witness:

- Validated 2026-05-07 from the public model page and completed prediction
  metrics.
- `non_video_in` at 720p is $0.18 per output second.
- `video_in` at 720p is $0.22 per output second.
- Pollinations exposes `non_video_in` at 720p; audio and image input do not
  change that tier.
- Re-check the public Replicate model page before changing the registry price.

Expected entry:

- `cost_category`: `model` for public model predictions, `gpu` or `inference_serverless` only when the source explicitly supports it; `storage` or `network` only when an invoice line proves it
- `op_cloud_type`: `inference` for model prediction usage, `gpu` for explicit dedicated GPU/deployment compute, `null` for cash-only invoice or payment evidence
- `op_transaction_category`: `cloud` for invoices/card charges, `null` for pure prediction/API evidence
- `should_match_op_transaction`: true for invoices, receipts, and card/Wise payments; false for pure prediction/API evidence
- `should_match_op_cloud`: true for prediction/model usage evidence; false for cash-only payments unless they include usage detail

Known traps:

- Replicate has no public invoice export API and no per-model spend API. Monthly cash evidence must come from invoices, receipts, Wise/card records, or the billing UI.
- The predictions API is operational evidence, not a billing ledger. It is useful for finding models, statuses, sources, and recent runs, but it may not be enough to reconstruct a closed month.
- The predictions API returns 100 records per page. Do not rely on older `prediction_count` examples to limit page size.
- `metrics.predict_time` is CPU/GPU runtime, not our user-facing price and not necessarily the provider invoice amount.
- Failed and canceled runs have provider-specific billing behavior. Do not assume zero cost unless the Replicate billing evidence supports it.
- Public model pricing lives on model pages, not in the API response.
- Official model predictions use `/v1/models/{owner}/{name}/predictions`; pinned/community predictions use `/v1/predictions` with a version hash.
- A provider-wide invoice gap should not be assigned to a single model price until untracked models, web UI runs, private deployments, storage/egress, background jobs, failed-but-billed work, and missing invoice lines have been checked.

Reconciliation notes:

- The invoice or Wise/card charge explains `op_transactions`.
- Tinybird `generation_event.total_cost` explains internal per-model `op_cloud` attribution.
- Replicate prediction exports can help find untracked model IDs, web-created predictions, status mix, and output metrics for video pricing.
- If invoice total exceeds metered model cost, keep the raw model price unchanged unless independent model-level pricing evidence shows the model itself is underpriced.

## Rotation

- Rotates the runtime `REPLICATE_API_TOKEN` gen.pollinations.ai uses for
  predictions — the same env var this connector uses. Verify empirically
  whether it's the identical token as the economics copy before assuming it
  stays valid; update `secrets/env.json` too if shared.
- Replicate has no public token create/delete API. The operator must create
  the new token and (later) delete the old one manually in the Replicate UI
  (<https://replicate.com/account/api-tokens>); only the middle step can be
  automated: update SOPS, deploy, verify.
- SOPS files: `gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json`.
- Deploy target: gen's Cloudflare deploy workflow. Health check: a live
  prediction or `GET /v1/account` with the new token, plus an end-to-end
  Pollinations smoke test.
