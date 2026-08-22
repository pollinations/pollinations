# Privacy Policy

**Updated: 2026-08-22**

## 1) Scope & Roles

This policy covers (a) the paid dashboard/API and (b) the pollinations.ai community website. For Discord/GitHub use, their policies also apply.

**Roles:** For our websites, accounts, billing, wallet, app authorization, and abuse-prevention operations, we are controller. When processing Customer Data on your behalf via the API, we are processor under the DPA.

## 2) Data We Process

* **Accounts & auth (commercial):** email, name/handle, org, password hash or SSO IDs.
* **API keys & app authorization:** key type, key ID, scopes, model restrictions, expiry, Pollen budget/cap, app name, redirect URI, GitHub identity shown on consent screens, connected-app records, revocations, and developer-earnings settings.
* **Billing & wallet (commercial):** plan, invoices, payment status, VAT ID, company details, Pollen purchases, Quest Pollen balance, Paid Pollen balance, grants, rewards, developer earnings, refunds, chargebacks, and wallet adjustments. Card data is handled by our payment provider; we do not store full card numbers.
* **Service usage & API metadata (commercial):** timestamps, endpoints/models, token/Pollen usage, balance bucket used, baseline model cost, app markup/developer credit where applicable, rate-limit events, IP, user-agent, and error logs.
* **Quests & rewards (commercial/community):** quest availability, progress, completions, reward amounts, credited balance bucket, source references, and display/audit metadata such as quest titles, app names/URLs, app-directory approval records, GitHub issue/PR numbers, issue titles/URLs, assignees, labels, and completion timestamps.
* **Prompts/outputs (commercial & demos):** processed transiently to deliver results; not retained beyond what's necessary to run the Service, except configuration you save and short-lived response caches. Generated responses may be cached temporarily for performance, reliability, cost control, and abuse prevention. Generated media cache identifiers and image metadata may include prompt-derived data.
* **Community model and agent configurations:** provider profile details, endpoint URLs, model identifiers, visibility, pricing, declared capabilities, and managed-agent instructions and tool settings that you save. Community endpoint credentials are stored encrypted and are never returned through the API.
* **Community identifiers (community):** Discord ID/username (if you link or use our bots); GitHub ID/username and public GitHub profile/repository/activity signals if you link GitHub, contribute, identify an app, or complete GitHub-based quests; email if you contact us.
* **Analytics processing:** we also use the data categories above (account identifiers, email, name, GitHub identity where linked, wallet balance attributes, API key metadata, session metadata, and payment-provider event records including customer email) for product analytics, billing attribution, abuse prevention, and developer-earnings reporting. We do not use passwords, password hashes, OAuth tokens, API key secrets, session tokens, or IP addresses for these analytics purposes.
* **Telemetry:** aggregated counters and performance metrics.
* **Support:** emails, tickets, in-app chats.

## 3) Purposes & Lawful Bases (GDPR)

* **Provide and improve services/sites** (contract; legitimate interests).
* **Run API keys, app authorization, wallet, quests, rewards, and developer-earnings features** (contract; legitimate interests).
* **Verify quest eligibility, credit rewards, and prevent duplicate or abusive reward claims** (contract; legitimate interests).
* **Security, abuse prevention, fraud prevention, and spending-control enforcement** (legitimate interests).
* **Billing/tax/compliance** (legal obligations).
* **Analytics & product research** using aggregated/pseudonymised metrics and the analytics processing described in §2 (legitimate interests).
* **Service communications** (contract; legitimate interests). Service-related notifications are delivered in-product. Purchase invoices for paid Pollen are sent by email through our payment provider (Stripe). We do not currently send email directly. If we introduce direct email in the future, transactional messages will be limited to verification, billing, security, and service notices, and any marketing email will only be sent where permitted (consent) and will include an unsubscribe link and `List-Unsubscribe` header.

## 4) Authorized Apps

When you authorize a third-party app, we show you the app identity we have, the requested access, expiry, budget, and developer share where applicable. If you approve, the app receives an API key or token that lets it use your Pollinations account within the approved limits.

The app may process prompts, outputs, and other data you provide to that app under its own terms and privacy policy. Only authorize apps you trust. You can revoke app access or adjust app spending caps in the dashboard.

## 5) Community Models & Agents

Community models and externally hosted agents are operated on infrastructure selected by their community providers, not by Pollinations. When you select one, we route the content needed to complete the request to that provider. Depending on the request, this may include prompts, messages, caller-supplied system or developer instructions, files or media, tool definitions and results, and generation parameters. We do not send the caller's Pollinations API key to the community provider.

Community providers can technically inspect or retain the content their endpoints receive. Their own privacy, retention, and model-training practices may apply, and their identity, location, and safeguards can differ. Review the provider details shown with the model where available. Do not use a community model or externally hosted agent for credentials, confidential information, or sensitive personal data unless you have reviewed and accepted the provider's practices and any required data-transfer arrangements.

Managed prompt agents run on Pollinations infrastructure using instructions supplied by their creator, a selected base model, and optional Pollinations tools. Publishing an agent does not by itself give its creator access to callers' request content. However, community-created instructions are not verified by us, may affect what the agent sends to enabled models or tools, and may be inferred or extracted through interactions. Agent creators should not place credentials, personal data, or confidential information in agent instructions.

## 6) Model Training & Content Use

We do not use your prompts/outputs to train or fine-tune models without your permission. Any training requires explicit opt-in.

This commitment applies to Pollinations' use of your content. Independently operated community providers may have their own practices as described above.

## 7) Cookies & SDKs

We currently use only essential cookies and similar storage needed for login, session, security, and service operation. We do not use third-party analytics or marketing cookies/SDKs at this time. If we add non-essential cookies or SDKs, we will request consent first and provide a way to change preferences.

## 8) Sharing & Recipients

* **Service providers (sub-processors):** we use the **categories** described at /terms#15-dpa-and-sub-processors. **Full named list available on request; we give at least 14 days' prior notice of material changes.**

**Depending on your model/provider selection, prompts and outputs may be sent transiently to our model/inference compute sub-processors (see categories at /terms#15-dpa-and-sub-processors).**

* **Community providers:** when you select a community model or externally hosted agent, we disclose the request content described in §5 to the provider operating that endpoint. Community providers are independently operated recipients and are responsible for their own endpoint and data practices.
* **Authorized apps:** when you approve an app connection, we share the approved API key/token and authorization details with that app.
* **Affiliates:** internal operations under this policy.
* **Authorities:** when required by law or to protect rights/safety.

We do not sell personal data.

## 9) International Transfers

Where data leaves the EEA, we use approved safeguards (e.g., EU Standard Contractual Clauses) and appropriate supplementary measures.

Community providers may operate in other countries under provider-specific arrangements. Do not select a community model or externally hosted agent for personal data that requires a particular residency or transfer mechanism unless you have confirmed that the provider meets those requirements.

## 10) Retention

* **Account and profile data:** while the account is active. When an account is deleted, access is revoked immediately and its profile, credentials, connected-app access, balances, and user-owned resources are deleted or de-identified from active systems within 30 days.
* **Reward-protection records:** an immutable linked GitHub user ID and reward ledger records are retained while needed to prevent the same identity from receiving the same one-time reward more than once. We review this retention while the reward programmes remain available.
* **Billing, wallet, and tax records:** account term + 7 years where needed for accounting, tax, fraud, disputes, and legal proof.
* **API usage metadata:** typically 24 months (billing, fraud, capacity, developer-earnings attribution).
* **Quest and reward records:** reward ledger records follow wallet/accounting retention where needed for balance, audit, fraud, and dispute purposes. Synced public GitHub quest issue records are retained while needed to display, process, and audit quest rewards.
* **Generated response caches (text, image, audio, video):** typically up to 30 days, plus any downstream public/browser caches.
* **Community providers:** independently operated community providers control their own retention of content received by their endpoints. Review the provider's notice where available before sending sensitive content.
* **Uploaded media files (media.pollinations.ai):** a 30-day lifecycle applies from upload or the latest refresh. Retrieving the file body refreshes the lifecycle only when the file is at least 15 days old, so actively accessed uploads can remain longer.
* **App authorization records:** while active. Related usage, billing, security, and dispute records may be retained under the retention periods above.
* **Support conversations:** we don't run a proprietary ticket system. Support happens on third-party channels (GitHub Issues, Discord) and email. GitHub Issues are public and retained by GitHub; Discord and email retention follows those platforms' own policies. Don't share sensitive data in public channels.
* **Backups:** encrypted, rolling 30-90 days. Data deleted from active systems may remain in restricted backup copies until those copies expire through the normal backup rotation.

**Account deletion:** account access is revoked immediately. Personal data is deleted or de-identified from active systems within 30 days except for the reward-protection, billing, usage, fraud-prevention, and legal records described above. Residual backup copies expire through the backup schedule described above. If you later create a new account with the same GitHub identity, rewards already issued to that identity cannot be claimed again.

## 11) Your Rights (GDPR)

Access, correction, deletion, restriction, portability, objection to legitimate-interest processing, and withdrawal of consent where applicable.

You can complain to your local authority or the Estonian Data Protection Inspectorate (AKI). **Contact:** hello@pollinations.ai.

## 12) Security

We apply industry-standard administrative, technical, and physical safeguards, including encryption in transit, encryption at rest where applicable, access controls, and incident response.

## 13) Children

Services are for users 16+. If under-16 data was provided, contact us for removal.

## 14) Automated Decision-Making

No decisions producing legal or similarly significant effects. Rate-limiting, abuse prevention, key-budget checks, app authorization checks, balance checks, and fraud controls may be automated.

## 15) Changes

We may update this policy; we'll post the new date and, for material changes, give reasonable in-app or email notice.

---

**Data Controller:**  
Myceli.AI OÜ  
Registry code: 17186693  
VAT number: EE102877908  
Registered address: Harju maakond, Tallinn, Kesklinna linnaosa, Tornimäe tn 5, 10145, Estonia  
Email: hello@pollinations.ai
