# Terms of Service

**Updated: 2026-08-22**

_2026-07-02 — Pollen purchases now include a service fee shown before payment, and prices are shown exclusive of tax; applicable VAT or similar taxes are added at checkout._

_2026-05-11 — Wallet now expires after 12 months of account inactivity. Effective 2026-06-01; the inactivity clock starts on that date for all existing balances._

## About Pollinations

Pollinations.ai ("Pollinations", "we", "us") is a service operated by Myceli.AI OÜ, the legal service provider and contracting party. We operate commercial, hosted services (dashboard & APIs) built on the open-source Pollinations codebase. We handle billing and support; the open-source software remains under its repository licences.

By accessing or using the Service, you agree to these Terms. If you do not agree, do not use the Service.

**Legal operator:**

- Myceli.AI OÜ
- Registered in: Estonian Commercial Register
- Registry code: 17186693
- VAT number: EE102877908
- Registered address: Harju maakond, Tallinn, Kesklinna linnaosa, Tornimäe tn 5, 10145, Estonia
- General contact: hello@pollinations.ai
- Billing contact: billing@pollinations.ai

---

## 1) Accounts, Keys & App Access

Provide accurate registration/billing details and keep credentials secure. Secret API keys are for server-side use. Publishable App Keys identify apps on Pollinations consent screens and may be used in client-side authorization flows.

When you authorize an app, you allow that app to use your Pollinations account through the approved API key, scopes, model restrictions, expiry, and Pollen spending cap. Only authorize apps you trust. You can revoke app access or adjust app spending caps in the dashboard.

When you delete your account, we permanently revoke its access and remove or de-identify its profile, credentials, balances, connected-app access, and user-owned resources as described in the Privacy Policy. We retain the linked GitHub user ID with reward ledger records to prevent duplicate quest payouts. If you later create a new account with the same GitHub identity, rewards already issued to that identity cannot be claimed again.

Third-party app developers are responsible for their own apps, claims, user interfaces, and end-user relationships. Unless we say otherwise, third-party apps are not operated by us. Betas/experiments are provided "as is".

## 2) Beta Services

Features, plans, or pricing labeled "beta" or "preview" may be modified, suspended, or discontinued at any time with in-product notice. This includes changes to:

- Wallet and reward structures and associated benefits (for example Quest Pollen grants, promotional credits, and usage limits)
- Model availability, capabilities, and per-model pricing
- Developer-earnings rates and markup percentages
- Quest availability, eligibility criteria, reward amounts, and payout timing
- Usage limits, quotas, and rate limits
- Feature availability and functionality

Beta features carry no service level commitments. By using beta features, you acknowledge this flexibility and agree that we are not liable for changes made during the beta period.

## 3) The Service

Hosted access to model-powered APIs and tools per your plan, balance, and usage limits. Model outputs vary and may be incomplete, inaccurate, unsafe, unavailable, or unsuitable for your intended use. You are responsible for reviewing outputs before relying on them.

**Externally hosted community models.** Third-party community providers, not Pollinations, operate these models. Using one sends your request to its provider and any configured community fallback providers. Those providers are responsible for how they store, share, secure, train on, or otherwise use it; their terms and privacy policies apply. Pollinations does not control or verify those practices and, to the extent permitted by law, is not responsible for them. Provider details come from the provider and are not an endorsement. Check them before sending credentials, confidential information, or sensitive personal data.

**Managed agents.** Pollinations hosts these agents, and publishing one does not give its creator access to caller requests. Selected models and tools may still process those requests, and public agent instructions may be inferred or extracted. Creators must not include credentials or confidential data in agent instructions.

We may make non-breaking changes and will notify you of material reductions where practical.

## 4) Customer Data & Privacy

You retain all rights to data you submit ("Customer Data"). How personal data is collected, stored, and processed — including our no-training-without-opt-in commitment, retention periods, and sub-processors — is governed by our **[Privacy Policy](/privacy)**.

## 5) Acceptable Use & Safety

Do not violate law; infringe IP/likeness/privacy; attack the Service; evade rate limits or spending controls; abuse Pollen grants, app attribution, or developer earnings; or replicate non-public features to build a competing hosted service. **No deepfakes of real people without consent. No CSAM (real or fictional).**

If you publish an externally hosted community model, you are responsible for the endpoint and the caller data it receives. Identify the provider accurately, keep its privacy information current, use appropriate security and retention controls, and comply with applicable law. Clearly disclose how you store, share, train on, or otherwise use caller data. Do not mislead callers about the endpoint or its data practices.

## 6) Pollen, Fees, Taxes & Billing

Fees are per plan/order/invoice; currency is by default USD. Pollen purchases, including auto top-up charges, include a service fee shown before payment.

**Pollen.** "Pollen" is an in-service credit used only to pay for Pollinations API usage. Pollen is not legal tender, e-money, cryptocurrency, a deposit, a bank account balance, or stored value outside the Service. Pollen is not transferable, withdrawable, or redeemable for cash except where required by law or expressly approved by us as a refund under these Terms.

**Balances.** Your wallet may include:

- **Quest Pollen balance:** Pollen earned from quests, contribution rewards, free grants, promotional credits, manual credits, and developer earnings credited from Quest Pollen usage. Quest Pollen does not create an entitlement to future credits, fixed grant amounts, or fixed grant timing.
- **Paid Pollen balance:** purchased Pollen and developer earnings credited from Paid Pollen usage. Paid Pollen does not automatically refill.

**Wallet inactivity.** Effective **2026-06-01**, if your account remains inactive for 12 consecutive months, any remaining Pollen in your wallet (Quest Pollen and Paid Pollen) will expire. For balances held before that date, the inactivity clock starts on 2026-06-01, so every existing user gets a full 12-month window from the effective date. Signing in, making API requests, or purchasing Pollen counts as activity and resets the inactivity clock.

**Request billing.** Pollen is consumed when API requests run. Regular models draw from Quest Pollen first; paid-only models draw from Paid Pollen only. We may refuse requests when the available balance can't cover them. If actual usage exceeds our estimate, the balance that paid for the request may briefly go negative and clears through later credits to that balance or top-ups.

**Rewards.** We may offer quests, contribution rewards, promotional credits, referral credits, or manual credits. Eligibility may be verified from your Pollinations account activity, API usage metadata, billing events, app-directory records, linked GitHub profile/activity, and public GitHub issue/PR status. Rewards are credited only when our systems or maintainers verify completion. We retain minimized identity and reward records after account deletion to prevent a reward from being claimed again through a replacement account. We may withhold, reverse, or adjust rewards for duplicate claims, mistaken payouts, abuse, fraud, failure to follow quest instructions, or other billing corrections. Rewards are Pollen and have no cash value.

**Developer earnings.** App developers may enable developer earnings on their Publishable App Keys, in which case authorized requests include a markup that goes to the developer. The current rate and the user's share are shown before authorization.

Developer earnings are credited as Pollen to the developer wallet in the same balance type the user paid from. They are not cash payouts and are not transferable, withdrawable, or redeemable outside the Service. We may review and adjust developer earnings for refunds, chargebacks, fraud, abuse, pricing errors, self-crediting (using your own app to inflate your earnings), or other billing corrections.

**Taxes.** Prices for Pollen purchases are shown exclusive of tax. Applicable VAT or similar transaction taxes are calculated and added at checkout based on your billing details. Estonian standard VAT is 24% where applicable. For eligible EU B2B customers with a valid VAT ID, reverse-charge rules may apply.

**Payments.** Payments are processed by Stripe Payments Europe, Limited. Stripe sends purchase invoices by email.

**No late payments.** All Pollen is prepaid: there are no invoices, due dates, or late fees. The only way a balance can go below zero is when final usage on a request exceeds the pre-flight estimate; that negative balance clears automatically through later credits to that balance or future top-ups, as described under Request billing above. We may refuse new paid-model requests until a negative Paid Pollen balance is covered.

**Price changes.** Prices, model costs, and Pollen rates may change at any time without notice; what's shown at top-up or in the pre-flight estimate is what applies to that transaction. If a change materially raises the cost of models you actively use, you may request a refund of unused Paid Pollen balance within 14 days.

## 7) Refunds & Cancellations

Refunds, cancellations, and chargebacks are governed by our **[Refunds & Cancellations Policy](/refunds)**. Nothing in these Terms limits non-waivable statutory rights.

## 8) IP & Open-Source

We and our licensors own the Service, models, and documentation. The Service may include or run against OSS; those components are governed by their licences. **Model licences vary**; verify before commercial use. Feedback may be used to improve the Service.

## 9) Service Level & Support

Commercially reasonable efforts to maintain availability (target 99.5% monthly). Support is provided through the channels on our site. We do not offer SLA credits.

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

We may use your name/logo to identify you as a customer unless you opt out in writing. You will comply with export/sanctions controls. Assignment with consent (not unreasonably withheld); notices by email; severability; no waiver; force majeure. We may update these Terms; for material adverse changes we give reasonable prior notice. If these Terms and the DPA conflict, the DPA controls for personal-data processing.

## 14) Governing Law & Venue

**Estonia** / **Harju County Court (Tallinn)**.

## 15) DPA and Sub-Processors

When we process personal data on your behalf, you are the **controller** and we are the **processor** under our Data Processing Addendum (DPA). The DPA (including EU Standard Contractual Clauses for international transfers) is maintained at this location. Categories of **sub-processors** we may use are listed below. The full named list is available on request, and we provide at least **14 days'** prior notice of material changes to sub-processors.

**Categories of sub-processors** we may use to deliver the Service:

- **Payments / Merchant of Record** (also delivers purchase invoices by email on our behalf)
- **CDN/WAF & edge routing**
- **Cloud infrastructure & storage**
- **Analytics / data pipeline**
- **Model / inference compute providers** (for text/image/video generation)

**Data residency.** Depending on the selected model, provider, and availability, Customer Data may be processed in the EEA, the United States, or other locations where our model and infrastructure providers operate. Where personal data leaves the EEA, we use approved safeguards such as EU Standard Contractual Clauses and appropriate supplementary measures.

---

## 16) Polli Discord Bot

**Effective date: September 4, 2026**

### 1. About Polli

Polli is the Pollinations.ai Discord bot and related assistant service operated by **Myceli.AI OÜ** ("we," "us," or "our"). These Terms govern your use of Polli through Discord, its API integration, and connected GitHub features.

By using Polli, you agree to these Terms and our [Polli Privacy Policy](/privacy#16-polli-discord-bot). You must also follow the applicable Discord, GitHub, Pollinations.ai, and community or repository rules.

If you do not agree, do not use Polli.

### 2. Eligibility

You may use Polli only if you meet Discord's minimum age requirements in your country and are legally able to agree to these Terms. If you use Polli on behalf of an organization, you represent that you are authorized to do so.

### 3. What Polli Does

Depending on configuration and your permissions, Polli may:

- answer questions and participate in Discord conversations;
- process messages, attachments, links, images, and recent thread context;
- search Discord messages, channels, threads, members, or roles within enforced access boundaries;
- search and inspect public GitHub repositories, issues, pull requests, and comments;
- create or comment on GitHub issues and perform other actions where explicitly authorized;
- generate tables, charts, and diagrams as image attachments; and
- provide an OpenAI-compatible API interface for Polli's assistant functionality.

Some features may be unavailable, limited, delayed, or changed based on permissions, service configuration, provider availability, rate limits, or safety controls.

### 4. Permissions and Authorized Use

You may request only information and actions that you are authorized to access or perform.

Discord-originated searches are limited by the requesting member's effective access and the bot's permissions. Public API callers do not have a Discord member identity and are restricted to publicly visible channel content; member and role enumeration and private-thread access are unavailable through that path.

Polli may perform GitHub actions using credentials controlled by its operator. Those actions remain subject to Polli's internal authorization rules and the permissions of the connected GitHub account or application. A request does not guarantee that Polli will perform an action.

You are responsible for reviewing any requested public or consequential action before relying on it. GitHub comments, issues, pull requests, commits, and other actions may be public, persistent, indexed, or difficult to reverse.

### 5. Acceptable Use

You must not use Polli to:

- violate law, regulation, contractual obligations, or another platform's terms;
- access, infer, expose, or distribute private information without authorization;
- bypass permissions, authentication, rate limits, safety controls, or access boundaries;
- impersonate others, misrepresent authorization, or deceive users about Polli's output;
- harass, threaten, exploit, discriminate against, or endanger others;
- generate or distribute malware, credential theft, destructive payloads, spam, or abusive automation;
- interfere with Polli, Discord, GitHub, Pollinations.ai, or related infrastructure;
- submit credentials, secrets, authentication tokens, or unnecessarily sensitive personal data; or
- use automated means to overload, scrape, benchmark, or probe the service in a manner that harms availability or security.

Authorized security testing must be scoped, lawful, non-destructive, and approved by the relevant system owner.

### 6. Your Content

You retain the rights you hold in content you submit. You grant us a limited, worldwide license to host, transmit, transform, and process that content only as reasonably necessary to operate, secure, and improve Polli and fulfill your requests.

You represent that you have the rights and permissions necessary to submit the content and request the processing or actions involved.

Content you submit may be sent to Discord, GitHub, Pollinations.ai, model providers, and infrastructure providers as described in the Privacy Policy. Do not submit content that you are not permitted to share with those services.

### 7. Generated Output

Polli uses automated models and tools. Outputs may be inaccurate, incomplete, outdated, misleading, insecure, or unsuitable for your purpose. Polli may misunderstand context, omit results due to permissions or indexing, or propose actions that require human review.

You are responsible for evaluating output before using it. Do not rely on Polli as a substitute for professional, legal, medical, financial, safety, or security advice. Review code, commands, repository changes, and other consequential output before execution or approval.

### 8. Third-Party Services

Polli depends on third-party services, including Discord, GitHub, Pollinations.ai, model providers, and hosting or infrastructure providers. Your use of those services remains governed by their respective terms and policies.

We are not responsible for third-party service outages, changes, content, security, moderation, account actions, or retention practices. Features may stop working if a third party changes or removes an API, permission, account, or integration.

### 9. Open-Source Software

Polli's source code is publicly available under the license provided with the repository. The availability of source code does not grant access to production systems, credentials, private data, trademarks, or services beyond the rights stated in the applicable software license.

Production behavior may also depend on deployment configuration, permissions, secrets, infrastructure, and third-party services that are not contained in the public source repository.

### 10. Service Changes and Enforcement

We may modify, limit, suspend, or discontinue any part of Polli. We may refuse requests, restrict access, remove integrations, or take protective action when reasonably necessary for security, safety, legal compliance, platform compliance, abuse prevention, or service reliability.

We may suspend or terminate access for violations of these Terms. Server administrators and platform operators may also restrict or remove Polli independently.

### 11. Availability

Polli is provided on an as-available basis. We do not guarantee uninterrupted availability, specific response times, complete search results, preservation of conversation context, compatibility with every client, or continued support for a particular feature or provider.

### 12. Disclaimers

To the maximum extent permitted by law, Polli is provided "as is" and "as available," without warranties of merchantability, fitness for a particular purpose, non-infringement, accuracy, availability, or error-free operation.

Nothing in these Terms excludes warranties or rights that cannot legally be excluded.

### 13. Limitation of Liability

To the maximum extent permitted by law, Myceli.AI OÜ and its contributors, officers, employees, contractors, and service providers will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of profits, data, goodwill, business opportunity, or service availability arising from Polli.

Our aggregate liability arising from Polli will not exceed the greater of the amount you paid specifically for Polli during the three months before the event giving rise to the claim or EUR 50. This limitation does not apply where liability cannot legally be limited.

### 14. Indemnity

To the extent permitted by law, you agree to indemnify and hold Myceli.AI OÜ harmless from claims, losses, and reasonable costs arising from your unlawful use of Polli, your violation of these Terms, or content and actions you were not authorized to submit or request.

### 15. Governing Law

These Terms are governed by the laws of Estonia, without regard to conflict-of-law principles. Courts with jurisdiction in Estonia will have exclusive jurisdiction unless mandatory consumer law provides otherwise.

If you are a consumer, you retain any mandatory protections and venues available under the law of your country of residence.

### 16. Changes to These Terms

We may update these Terms as Polli, its providers, or applicable requirements change. We will update the effective date when revised Terms are published. Continued use after an update takes effect constitutes acceptance where permitted by law.

### 17. Contact

**Operator:** Myceli.AI OÜ\
**Product:** Pollinations.ai / Polli\
**Email:** hello@pollinations.ai
