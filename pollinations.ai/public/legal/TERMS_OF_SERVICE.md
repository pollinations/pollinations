# Terms of Service

**Updated: 2026-05-06**

## What Myceli.AI Is

We operate commercial, hosted services (dashboard & APIs) built on the open-source pollinations.ai codebase. We handle billing and support; the OSS remains under its repository licences.

**Company identity:**  
Myceli.AI OÜ  
Registry code: 17186693  
VAT number: EE102877908  
Registered address: Harju maakond, Tallinn, Kesklinna linnaosa, Tornimäe tn 5, 10145, Estonia  
Email: hi@myceli.ai

---

## 1) Accounts, Keys & App Access

Provide accurate registration/billing details and keep credentials secure. Secret API keys (`sk_`) are for server-side use. Publishable App Keys (`pk_`) identify apps on Pollinations consent screens and may be used in client-side authorization flows.

When you authorize an app, you allow that app to use your Pollinations account through the approved API key, scopes, model restrictions, expiry, and Pollen spending cap. Only authorize apps you trust. You can revoke app access or adjust app spending caps in the dashboard.

Third-party app developers are responsible for their own apps, claims, user interfaces, and end-user relationships. Unless we say otherwise, third-party apps are not operated by us. Betas/experiments are provided "as is".

## 2) Beta Services

Features, plans, or pricing labeled "beta" or "preview" may be modified, suspended, or discontinued at any time with in-product notice. This includes changes to:

- Tier structures and associated benefits (for example Pollen allocations and daily/hourly limits)
- Model availability, capabilities, and per-model pricing
- Developer-earnings rates and markup percentages
- Usage limits, quotas, and rate limits
- Feature availability and functionality

Beta features carry no service level commitments. By using beta features, you acknowledge this flexibility and agree that we are not liable for changes made during the beta period.

## 3) The Service

Hosted access to model-powered APIs and tools per your plan, balance, and usage limits. Model outputs vary and may be incomplete, inaccurate, unsafe, unavailable, or unsuitable for your intended use. You are responsible for reviewing outputs before relying on them.

We may make non-breaking changes and will notify you of material reductions where practical.

## 4) Customer Data & Privacy

- **Ownership.** You retain all rights to data you submit ("Customer Data").
- **Processing.** We process Customer Data to provide and secure the Service, prevent abuse, run billing/wallet features, attribute authorized app usage, and improve core functionality.
- **Content storage.** Prompts/outputs are processed transiently/in-memory to deliver results and are not retained beyond what's necessary to run the Service, except configuration you choose to save and legally required logs, consent records, security records, app authorization records, and billing/wallet records.
- **No training without opt-in.** We do not use prompts/outputs to train models without your permission.
- **GDPR/DPA.** When we process personal data on your behalf, you are the controller and we are the processor. Our DPA and sub-processor list are linked at /terms#dpa-subprocessors.

## 5) Acceptable Use & Safety

Do not violate law; infringe IP/likeness/privacy; attack the Service; evade rate limits or spending controls; abuse Pollen grants, app attribution, or developer earnings; or replicate non-public features to build a competing hosted service. **No deepfakes of real people without consent. No CSAM (real or fictional).**

## 6) Pollen, Fees, Taxes & Billing

Fees are per plan/order/invoice; currency is by default USD.

**Pollen.** "Pollen" is an in-service credit used only to pay for Pollinations API usage. Pollen is not legal tender, e-money, cryptocurrency, a deposit, a bank account balance, or stored value outside the Service. Pollen is not transferable, withdrawable, or redeemable for cash except where required by law or expressly approved by us as a refund under these Terms.

**Balances.** Your wallet may include:

- **Tier balance:** free Pollen grants and developer earnings. Tier balance refills according to your tier and can be capped by tier rules.
- **Paid balance:** purchased Pollen and developer earnings credited from paid-balance usage. Paid balance does not expire and does not automatically refill.

**Request billing.** Pollen is consumed when API requests run. Regular models use tier balance first when it can cover the request; otherwise paid balance may be used. Paid-only models use paid balance only. We may refuse a request when no allowed balance can cover the pre-flight estimate. Final usage can exceed estimates and make the selected balance negative. Tier debt recovers through future tier refills; paid-balance debt clears through future top-ups or future paid-balance developer earnings.

**Developer earnings.** App developers may turn on developer earnings for a Publishable App Key. When developer earnings are enabled on a verified Publishable App Key, authorized app requests may include a 25% markup over model cost. From the user's perspective, this means 20% of total spend on that request goes to the app developer. We show the app share before authorization.

Developer earnings are credited as Pollen to the developer wallet and land in the same balance type the user paid from: tier spend credits tier balance, and paid spend credits paid balance. Developer earnings are not cash payouts and are not transferable, withdrawable, or redeemable outside the Service. We may reverse or adjust developer earnings for refunds, chargebacks, fraud, abuse, pricing errors, self-crediting (using your own app to inflate your earnings), or other billing corrections.

**Taxes.** Prices are net of VAT; we charge Estonian VAT (24%) where applicable. For eligible EU B2B customers with a valid VAT ID, reverse-charge rules apply. **Check:** gross = net x 1.24.

**Payments.** Payments are processed through the checkout provider shown at checkout where applicable.

**Payment & late fees.** Pay by due date; late amounts may accrue 1.5%/month (or legal max). We may suspend for non-payment after notice.

**Price changes.** Outside beta, we'll give 30 days' notice of fee changes; you may cancel before the effective date. During beta, pricing may change with in-product notice.

## 7) Refunds & Cancellations (Digital Services & Pollen)

All sales are final except where required by law or expressly approved by us. Our APIs and Pollen top-ups are digital services delivered immediately after purchase.

**Paid Pollen packs/top-ups.** Paid Pollen is non-refundable once provisioned, including unused paid balance, except where required by law or where we approve a refund case-by-case. Used Pollen cannot be refunded or clawed back. Free tier grants, promotional credits, and developer earnings have no cash value and are not refundable.

**EU/EEA consumer withdrawal.** If you purchase as a consumer in the EU/EEA, you may have a 14-day right of withdrawal for distance contracts. For digital content/services delivered immediately, you can lose this right once performance begins if you expressly consent to immediate delivery and acknowledge that you lose the withdrawal right. We present this consent at checkout where required.

**Limited refund review.** We may review refund requests for unused paid balance where required by law or for a proven duplicate/unauthorized charge, failure to provision paid Pollen after payment, or a material documented technical fault that prevents any meaningful use within a reasonable start period. Approval is discretionary except where required by law. On any approved refund, associated Pollen, credits, benefits, and developer earnings may be revoked or adjusted.

**How to request.** Contact hi@myceli.ai with order ID and account email. Approved refunds are returned to the original payment method subject to payment-network timelines.

**Chargebacks.** Unpaid/charged-back amounts may lead to suspension; we will revoke or adjust associated Pollen, credits, benefits, and developer earnings.

## 8) IP & Open-Source

We and our licensors own the Service, models, and documentation. The Service may include or run against OSS; those components are governed by their licences. **Model licences vary**; verify before commercial use. Feedback may be used to improve the Service.

## 9) Service Level & Support

Commercially reasonable efforts to maintain availability (target 99.5% monthly). We provide support via the channels on our site; SLA credits (if any) are set in your Order Form.

## 10) Warranties & Liability

We warrant reasonable skill and care. Otherwise the Service is **"as is"**.
**Cap:** each party's aggregate liability is limited to **12 months of fees paid** by you.
**Exclusions:** no indirect/special/incidental/consequential damages or lost profits/data.
**Exceptions:** caps/exclusions do not apply to payment obligations, confidentiality breaches, IP indemnity, or wilful misconduct.

## 11) Confidentiality

Each party protects the other's confidential information and uses it only for this relationship.

## 12) Term; Suspension; Termination

Term begins on first access and continues per plan. Either party may terminate for uncured material breach after 30 days' notice. On termination we delete/return Customer Data per the DPA within 30 days unless legal retention applies. **Survival:** fees, confidentiality, IP, warranties & liability, and governing law survive.

## 13) Publicity; Export; Changes; Misc.

We may use your name/logo to identify you as a customer unless you opt out in writing. You will comply with export/sanctions controls. Assignment with consent (not unreasonably withheld); notices by email; severability; no waiver; force majeure. We may update these Terms; for material adverse changes we give reasonable prior notice. Order of precedence: Order Form -> these Terms -> DPA.

## 14) Governing Law & Venue

**Estonia** / **Harju County Court (Tallinn)**.

## 15) DPA & Sub-Processors {#dpa-subprocessors}

When we process personal data on your behalf, you are the **controller** and we are the **processor** under our Data Processing Addendum (DPA). The DPA (including EU Standard Contractual Clauses for international transfers) and our current list of **sub-processors** are maintained at this location. We provide at least **14 days'** prior notice of material changes to sub-processors.

**Categories of sub-processors** we may use to deliver the Service:

- **Payments / Merchant of Record**
- **CDN/WAF & edge routing**
- **Cloud infrastructure & storage (EU-first)**
- **Email / notifications**
- **Analytics / data pipeline**
- **Model / inference compute providers** (for text/image/video generation)

**Data residency.** We route jobs to **EU regions by default**. If a model/provider is only available outside the EEA, we use appropriate safeguards (e.g., SCCs) and only enable upon project-level opt-in.

We'll email workspace owners on sub-processor changes.
