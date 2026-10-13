# Local access

Use existing credentials on this machine. They may live in macOS Keychain, CLI
credential stores or encrypted SOPS files; do not assume they are all in Keychain
or that another operator uses the same account/profile. This skill contains no
credentials and performs no login, token creation or secret mutation itself.
Follow `AGENTS.md` for access, secret and production-operation boundaries.

## Mail and sender

- Use `gog` with explicit `--client` and `--account` on every mail command.
  Inspect authenticated account metadata to find the Pollinations mailbox;
  never choose the first/default mailbox. Keep machine-specific account/client
  configuration outside this shared skill.
- Verify the chosen account can access the requested support aliases and that
  the sender is a verified Gmail send-as identity. Reply from the addressed
  support alias (`hello@pollinations.ai` or `billing@pollinations.ai`) when
  available, unless the operator has chosen another sender. Pass it explicitly
  with `--from` on both draft creation and updates. If that identity is unavailable,
  ask the operator; do not silently fall back to a personal address.
  Use the operator's name in the signature. Ask only
  when the account or sender cannot be uniquely established from the session.
- Read threads without changing unread state. After creating/sending a draft,
  read it back and verify From, recipient, subject, thread and exact HTML/plain-text content.

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
