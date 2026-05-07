# Privacy Policy

**Updated: 2026-05-07**

## 1) Scope & Roles

This policy covers (a) the paid dashboard/API and (b) the pollinations.ai community website. For Discord/GitHub use, their policies also apply.

**Roles:** For our websites, accounts, billing, wallet, app authorization, and abuse-prevention operations, we are controller. When processing Customer Data on your behalf via the API, we are processor under the DPA.

## 2) Data We Process

* **Accounts & auth (commercial):** email, name/handle, org, password hash or SSO IDs.
* **API keys & app authorization:** key type, key ID, scopes, model restrictions, expiry, Pollen budget/cap, app name, redirect URI, GitHub identity shown on consent screens, connected-app records, revocations, and developer-earnings settings.
* **Billing & wallet (commercial):** plan, invoices, payment status, VAT ID, company details, Pollen purchases, tier balance, paid balance, grants, developer earnings, refunds, chargebacks, and wallet adjustments. Card data is handled by our payment provider; we do not store full card numbers.
* **Service usage & API metadata (commercial):** timestamps, endpoints/models, token/Pollen usage, balance bucket used, baseline model cost, app markup/developer credit where applicable, rate-limit events, IP, user-agent, and error logs.
* **Prompts/outputs (commercial & demos):** processed transiently/in-memory to deliver results; not retained beyond what's necessary to run the Service, except configuration you save and short-lived response caches. Generated responses may be cached temporarily in R2 for performance, reliability, cost control, and abuse prevention. Generated media cache identifiers and image metadata may include prompt-derived data.
* **Community identifiers (community):** Discord ID/username (if you link or use our bots); GitHub username (if you contribute or identify an app); email if you contact us.
* **Internal analytics datasource:** to support product analytics, billing attribution, abuse prevention, and developer-earnings reporting, we replicate selected fields from our auth and billing tables (user, API key, session, OAuth account, and Stripe event records) into an internal analytics datasource. Replicated fields include account identifiers, email, name, GitHub identity (where linked), tier and balance attributes, API key metadata (name, prefix, usage counters), session metadata (user agent, expiry), and Stripe event payloads (including customer email). We do not replicate passwords, password hashes, OAuth tokens, API key secrets, session tokens, or IP addresses from these tables.
* **Telemetry:** aggregated counters and performance metrics.
* **Support:** emails, tickets, in-app chats.

## 3) Purposes & Lawful Bases (GDPR)

* **Provide and improve services/sites** (contract; legitimate interests).
* **Run API keys, app authorization, wallet, and developer-earnings features** (contract; legitimate interests).
* **Security, abuse prevention, fraud prevention, and spending-control enforcement** (legitimate interests).
* **Billing/tax/compliance** (legal obligations).
* **Analytics & product research** using aggregated/pseudonymised metrics and the internal analytics datasource described in §2 (legitimate interests).
* **Service communications** (contract; legitimate interests). Service-related notifications are delivered in-product. Purchase invoices for paid Pollen are sent by email through our payment provider (Stripe). We do not currently send email directly. If we introduce direct email in the future, transactional messages will be limited to verification, billing, security, and service notices, and any marketing email will only be sent where permitted (consent) and will include an unsubscribe link and `List-Unsubscribe` header.

## 4) Authorized Apps

When you authorize a third-party app, we show you the app identity we have, the requested access, expiry, budget, and developer share where applicable. If you approve, the app receives an API key or token that lets it use your Pollinations account within the approved limits.

The app may process prompts, outputs, and other data you provide to that app under its own terms and privacy policy. Only authorize apps you trust. You can revoke app access or adjust app spending caps in the dashboard.

## 5) Model Training & Content Use

We do not use your prompts/outputs to train or fine-tune models without your permission. Any training requires explicit opt-in.

## 6) Cookies & SDKs

We currently use only essential cookies and similar storage needed for login, session, security, and service operation. We do not use third-party analytics or marketing cookies/SDKs at this time. If we add non-essential cookies or SDKs, we will request consent first and provide a way to change preferences.

## 7) Sharing & Recipients

* **Service providers (sub-processors):** we use the **categories** described at /terms#15-dpa-and-sub-processors. **Full named list available on request; we give at least 14 days' prior notice of material changes.**

**Depending on your model/provider selection, prompts and outputs may be sent transiently to our model/inference compute sub-processors (see categories at /terms#15-dpa-and-sub-processors).**

* **Authorized apps:** when you approve an app connection, we share the approved API key/token and authorization details with that app.
* **Affiliates:** internal operations under this policy.
* **Authorities:** when required by law or to protect rights/safety.

We do not sell personal data.

## 8) International Transfers

Where data leaves the EEA, we use approved safeguards (e.g., EU Standard Contractual Clauses) and appropriate supplementary measures.

## 9) Retention

* **Account, billing, wallet, and tax records:** account term + 7 years (accounting/tax/legal proof).
* **API usage metadata:** typically 24 months (billing, fraud, capacity, developer-earnings attribution).
* **Generated response caches (text, image, audio, video):** typically up to 30 days in R2 and in downstream public/browser caches.
* **Uploaded media files (media.pollinations.ai):** typically up to 30 days in R2 from upload; re-uploading the same file resets the timer.
* **App authorization records:** while active. Related usage, billing, security, and dispute records may be retained under the retention periods above.
* **Support tickets:** up to 24 months after closure.
* **Backups:** encrypted, rolling 30-90 days.

**Deletion rule:** deletion date = last activity + retention period. On account deletion, personal data is deleted within 30 days except where legal retention applies.

## 10) Your Rights (GDPR)

Access, correction, deletion, restriction, portability, objection to legitimate-interest processing, and withdrawal of consent where applicable.

You can complain to your local authority or the Estonian Data Protection Inspectorate (AKI). **Contact:** hi@myceli.ai.

## 11) Security

TLS in transit; encryption at rest where stored; key management; least-privilege admin access controls; audit logs; vulnerability management; incident response.

## 12) Children

Services are for users 16+. If under-16 data was provided, contact us for removal.

## 13) Automated Decision-Making

No decisions producing legal or similarly significant effects. Rate-limiting, abuse prevention, key-budget checks, app authorization checks, balance checks, and fraud controls may be automated.

## 14) Changes

We may update this policy; we'll post the new date and, for material changes, give reasonable in-app or email notice.

---

**Data Controller:**  
Myceli.AI OÜ  
Registry code: 17186693  
VAT number: EE102877908  
Registered address: Harju maakond, Tallinn, Kesklinna linnaosa, Tornimäe tn 5, 10145, Estonia  
Email: hi@myceli.ai
