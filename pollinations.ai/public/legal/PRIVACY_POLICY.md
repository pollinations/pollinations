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

## 5) Community Models & Managed Agents

Externally hosted community models run on independent providers' infrastructure, not Pollinations. When you use one, your request is sent to that provider and any configured community fallback providers. A request may include prompts, messages, instructions, files or media, tool definitions and results, and generation settings. We do not send your Pollinations API key.

Community providers are responsible for how they store, share, secure, train on, or otherwise use your request. Their terms and privacy policies apply; Pollinations does not control or verify those practices. Check the provider information before sending credentials, confidential information, or sensitive personal data.

Managed agents run on Pollinations infrastructure. Publishing one does not give its creator access to caller requests, but its selected models and tools may process them. If a selected model is externally hosted, the rules above apply. Public agent instructions may be inferred or extracted, so creators should not include credentials or confidential data.

## 6) Model Training & Content Use

Pollinations does not use your prompts or outputs to train or fine-tune models without explicit opt-in. Community providers may follow different practices under their own policies.

## 7) Cookies & SDKs

We currently use only essential cookies and similar storage needed for login, session, security, and service operation. We do not use third-party analytics or marketing cookies/SDKs at this time. If we add non-essential cookies or SDKs, we will request consent first and provide a way to change preferences.

## 8) Sharing & Recipients

* **Service providers (sub-processors):** we use the **categories** described at /terms#15-dpa-and-sub-processors. **Full named list available on request; we give at least 14 days' prior notice of material changes.**

**Depending on your model/provider selection, prompts and outputs may be sent transiently to our model/inference compute sub-processors (see categories at /terms#15-dpa-and-sub-processors).**

* **Community providers:** when you use an externally hosted community model, your request is sent to its provider and any configured community fallback providers. These independent providers are responsible for their own endpoints and data practices.
* **Authorized apps:** when you approve an app connection, we share the approved API key/token and authorization details with that app.
* **Affiliates:** internal operations under this policy.
* **Authorities:** when required by law or to protect rights/safety.

We do not sell personal data.

## 9) International Transfers

Where data leaves the EEA, we use approved safeguards (e.g., EU Standard Contractual Clauses) and appropriate supplementary measures.

Community providers may process data in other countries. Before sending personal data, check that the provider meets any residency or transfer requirements that apply to you.

## 10) Retention

* **Account and profile data:** while the account is active. When an account is deleted, access is revoked immediately and its profile, credentials, connected-app access, balances, and user-owned resources are deleted or de-identified from active systems within 30 days.
* **Reward-protection records:** an immutable linked GitHub user ID and reward ledger records are retained while needed to prevent the same identity from receiving the same one-time reward more than once. We review this retention while the reward programmes remain available.
* **Billing, wallet, and tax records:** account term + 7 years where needed for accounting, tax, fraud, disputes, and legal proof.
* **API usage metadata:** typically 24 months (billing, fraud, capacity, developer-earnings attribution).
* **Quest and reward records:** reward ledger records follow wallet/accounting retention where needed for balance, audit, fraud, and dispute purposes. Synced public GitHub quest issue records are retained while needed to display, process, and audit quest rewards.
* **Generated response caches (text, image, audio, video):** typically up to 30 days, plus any downstream public/browser caches.
* **Community providers:** each provider sets its own retention policy. Review it before sending sensitive content.
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

---

## 16) Polli Discord Bot

**Effective date: September 4, 2026**

### 1. About Polli

Polli is the Pollinations.ai Discord bot and related assistant service operated by **Myceli.AI OÜ** ("we," "us," or "our"). This Privacy Policy explains how Polli processes information when people interact with it through Discord, its API integration, or connected GitHub features.

For privacy questions or requests, contact **hello@pollinations.ai**.

### 2. Information Polli Processes

Depending on the feature you use, Polli may process:

- **Discord account and server information:** user IDs, usernames, display names, role IDs, channel and thread IDs, server IDs, and permission information.
- **Messages and conversation context:** messages directed to Polli, recent messages needed to understand a conversation, and Discord content retrieved when you ask Polli to search.
- **Attachments and links:** files, images, videos, URLs, embeds, and related metadata supplied in a conversation or returned by an authorized search.
- **GitHub information:** public repository content, issues, pull requests, comments, usernames, and metadata needed to answer questions or perform requested GitHub actions.
- **API information:** prompts, conversation history, model parameters, authentication and authorization results, and technical request metadata when Polli is accessed through an API.
- **Operational information:** timestamps, request status, errors, latency, tool activity, rate-limit information, and limited logs needed to operate, secure, and troubleshoot the service.

Polli does not need your password, Discord token, GitHub token, Pollinations API key, or other credentials in message content. Do not send credentials or unnecessary sensitive information to Polli.

### 3. How Polli Uses Information

Polli processes information to:

- answer questions and maintain relevant conversation context;
- search Discord content within the access boundaries enforced by Polli;
- inspect public repository information and perform authorized GitHub actions;
- process attachments, links, tables, charts, and diagrams;
- enforce permissions, rate limits, and abuse protections;
- diagnose errors, monitor reliability, and improve service operation; and
- comply with legal obligations and protect users, communities, and our services.

Polli's source code is publicly available, allowing its implemented behavior and permission controls to be inspected. Public source code does not expose production credentials or private user data.

### 4. Discord Search and Access Controls

Polli applies Discord access controls using the identity and permission context available for each interaction. Search availability and results depend on the bot's permissions, server configuration, Discord indexing, and the request context.

Public API callers do not have a Discord member identity. Discord search through that interface may therefore be unavailable or limited to content configured for public access. Access controls may reduce or omit results, and a successful search response does not imply that every matching Discord message was retrieved.

### 5. AI and Service Providers

Polli uses Pollinations.ai model APIs and may use model and infrastructure providers needed to generate responses or operate specific features. Information included in a request may be transmitted to those providers for processing. Polli may also interact with:

- **Discord**, for messages, server context, permissions, and bot functionality;
- **GitHub**, for repository information and requested repository actions;
- **Cloud and infrastructure providers**, for hosting, networking, logging, and storage; and
- **Model providers routed through Pollinations.ai**, for inference and related processing.

Those services may process information under their own terms and privacy policies. We select and configure services for Polli's operation, but we do not control data you independently publish to Discord or GitHub.

Polli does not sell personal data. We do not intentionally use private conversation content to train Polli. We do not promise that content sent to an external platform or model provider is governed only by this Policy; the applicable provider's terms and configured data-handling practices also apply.

### 6. Retention

Polli keeps conversation context temporarily so it can respond coherently. In-memory sessions and short-lived caches expire automatically according to operational settings.

Operational logs may be retained for security, reliability, debugging, abuse prevention, and legal compliance for as long as reasonably necessary for those purposes. We do not claim a fixed retention period where the underlying implementation or hosting configuration does not enforce one.

Discord messages, GitHub content, and attachments remain subject to the retention, deletion, and visibility controls of Discord, GitHub, the relevant server or repository, and their users. A requested GitHub action or comment may be public and persist in repository history even after Polli's temporary context expires.

### 7. Legal Bases

Where the European Economic Area or similar law applies, we process information as necessary to:

- provide the service requested by you;
- pursue legitimate interests in operating, securing, and improving Polli;
- comply with legal obligations; and
- act with consent where consent is required.

### 8. Sharing

We share information only as needed to operate Polli, fulfill a request, protect the service, comply with law, or complete a transaction you direct. This may include the providers described above and authorized contributors who need access to diagnose or operate the service.

We may disclose information if reasonably necessary to respond to lawful requests, enforce our terms, investigate abuse, or protect rights, safety, and service integrity.

### 9. International Processing

Polli and its providers may process information in countries other than your own. Where required, we use appropriate safeguards for international transfers. Discord, GitHub, and model providers may independently determine where they process information under their own policies.

### 10. Security

We use access controls, scoped credentials, permission checks, rate limits, input restrictions, and operational monitoring appropriate to Polli's functions. No online service is completely secure, and we cannot guarantee absolute security.

If you believe Polli exposed information or has a security issue, stop sharing sensitive data and contact **hello@pollinations.ai**.

### 11. Your Choices and Rights

You can avoid further processing by not interacting with Polli, removing Polli from a server you control, deleting content through the platform where available, or asking a server administrator for help.

Depending on applicable law, you may have rights to request access, correction, deletion, restriction, objection, or portability of personal data, and to complain to a data-protection authority. To make a request, contact **hello@pollinations.ai** and provide enough information for us to identify the relevant interaction without sending credentials or unnecessary sensitive data.

Some requests may need to be handled through Discord, GitHub, or a server administrator because those parties control the original content or account data. We may retain information where required by law or necessary for security, fraud prevention, dispute resolution, or protection of legal rights.

### 12. Children

Polli is not directed to children under 16. You must also meet Discord's minimum age requirements in your country to use Polli.

### 13. Automated Output

Polli generates automated responses and may make mistakes. Its output should not be treated as professional, legal, medical, financial, or security advice. Human review is required before relying on consequential output or approving repository changes.

### 14. Changes to This Policy

We may update this Privacy Policy as Polli, its providers, or applicable requirements change. We will update the effective date when material changes are published.

### 15. Contact

**Data controller:** Myceli.AI OÜ\
**Product:** Pollinations.ai / Polli\
**Email:** hello@pollinations.ai
