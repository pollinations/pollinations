# Local access

Use existing credentials on this machine. They may live in macOS Keychain, CLI
credential stores or encrypted SOPS files; do not assume they are all in Keychain
or that another operator uses the same account/profile. This skill contains no
credentials and performs no login, token creation or secret mutation itself.
Follow `AGENTS.md` for access, secret and production-operation boundaries.

## Mail coverage

- Use `gog` with explicit `--client` and `--account` on every mail command.
  Inspect authenticated account metadata to find the Pollinations mailbox;
  never choose the first/default mailbox. Keep machine-specific account/client
  configuration outside this shared skill.
- Start with `hello@pollinations.ai`, `billing@pollinations.ai`, historical
  `billing@myceli.ai`, and the active operator's current and historical work
  addresses. For Elliot, include `elliot@pollinations.ai` and `elliot@myceli.ai`.
  These are recipient search addresses, not fixed CLI account/client settings.
- Discover additional historical addresses from authorized account/alias
  metadata, forwarding configuration when available, and prior correspondence
  headers. Do not assume the Gmail send-as list includes retired inbound aliases.
  Search confirmed addresses across accessible relevant mailboxes; forwarding
  may put several addresses in one mailbox. Ask the operator about unresolved
  historical coverage while continuing the known scope. Do not invent aliases
  or search unrelated personal accounts. Address history does not widen the
  requested date range to all time.

## Reply identity

- Identify the active operator from the session and verified account metadata.
  Always reply from that person's verified `@pollinations.ai` address, regardless
  of the address that received the message. Elliot uses `elliot@pollinations.ai`;
  for Thomas, discover and verify his own Pollinations address rather than
  guessing its local part. Sign with the actual operator's name.
- Verify the selected mailbox can send as that address. Pass it explicitly with
  `--from` on draft creation and updates, and display it in `envelope.from` in
  the preview. Do not default to a shared support alias, a legacy `@myceli.ai`
  address, or another operator's identity. Do not set Reply-To to a legacy or
  different address unless the operator explicitly requests it.
- If the operator or authorized sender is ambiguous or unavailable, ask which
  existing account/identity to use; continue read-only triage. Do not create an
  alias or change account settings as part of triage.
- Read threads without changing unread state. After creating/sending a draft,
  read it back and verify From, recipient, subject, thread and exact HTML and
  plain-text content.

## Footer delivery

- Gmail web-composer signatures are not automatically inserted by Gmail API
  sends. Workspace's **Gmail → Compliance → Append footer** is a separate rule.
- Rollout configured 2026-10-13: root organization `pollinations.ai` has
  `Pollinations signature — shared wordmark` enabled for outbound and internal
  mail. Child organizations inherit it; the earlier Elliot pilot rule is
  disabled to prevent duplicates. Design B is one 144 × 18 clickable wordmark,
  with no separate visible URL. Verify current inheritance for the operator;
  this recorded setup is not a substitute for checking the live setting.
- Confirm the sender's applicable rule and footer content before choosing
  `footerDelivery: "workspace"`. The renderer's preview represents the small
  pinned clickable wordmark (design B), with no separate visible website URL.
  If the Admin footer changes, update and review that
  representation before relying on it. Do not infer delivery from the Sent
  copy alone: inspect an authorized external recipient's message when testing.
- With Workspace branding, the operator's Gmail composer signature should
  contain personal details only. Avoid adding the same logo/website twice.
  Use `footerDelivery: "workspace"` for covered senders, including Thomas;
  retain their own name and verified Pollinations sender address. If coverage
  is unknown, resolve it before drafting rather than guessing a footer mode.
  Changes to Workspace or signature settings are separate from routine triage.
  See [Google's footer setup and inheritance documentation](https://knowledge.workspace.google.com/admin/gmail/advanced/add-a-standard-footer-to-outgoing-emails).

## Production evidence

| System | Existing access and checks |
| --- | --- |
| GitHub | `gh auth status`; repository `pollinations/pollinations`. Inspect current refs, full issue/PR discussions and Actions jobs. Do not print tokens. |
| Cloudflare/D1 | `wrangler whoami`; match the account/database against `enter.pollinations.ai/wrangler.toml` production configuration. From that service directory use `npx wrangler d1 execute DB --env production --remote --command '<scoped SELECT>'`. Both flags are required: the default binding selects development. See `.claude/skills/enter-services/SKILL.md`. Avoid key/credential columns and `SELECT *`. |
| Tinybird | Use `enter.pollinations.ai/observability/scripts/tb-prod.sh` and `.claude/skills/spending-analysis/SKILL.md`. The script reads the production read token from SOPS; do not substitute a staging token, print decrypted values, or persist tokens elsewhere. Confirm production workspace and event freshness. Tinybird's D1 copy can lag; use D1 for current state. |
| Stripe | Use the local Pollinations Stripe CLI profile, explicitly selected, and `--live`. Read account metadata first and confirm Pollinations/Myceli.AI; another company's default profile may exist. Use email/customer/user IDs to scope results and verify filters actually applied. Never print full card data, client secrets or API keys. |
| Authenticated API | `AGENTS.md` documents existing test-token lookup, including the Keychain service/account where configured. Read directly into the process, not output, arguments or a scratch file. Verify the token is recognized by the intended environment. Do not generate a key just to investigate support. |

Keep outputs small: IDs, timestamps, statuses, totals and relevant error fields.
Never dump credential files or whole provider objects. Access errors require
locating existing access, not rotating secrets. Ask for a secure location or
connection when needed and continue checks that do not depend on it.

Account email and profile names are not secrets. A local credential-like value
is not automatically an external exposure; redact it and follow the repo's
evidence-based secret policy. Do not disable work on keywords alone.
