# Security Audit Report

Target: `F:/bug-bounty/POLLINATIONS_BUG_BOUNTY/CODEBASE`

Commit audited: `9e194d97c` (`origin/main`)

Date: 2026-06-05

Methodology: 5-phase source-assisted audit with local benign verification. Known issues from the supplied blacklist and existing repo worklog were excluded, including BYOP redirect issues, quest payout idempotency, realtime/session billing cap behavior, transcription duration preflight, media active content, API-key budget atomicity, prefix classification, native API-key metadata, and Polly/GitHub workflow issues.

## Verified Findings

### [HIGH] Delegated `account:keys` API Key Can Mint Broader Child Keys Than Its Own Budget, Model Allowlist, and Lifetime

#### Description

The `/api/account/keys` endpoint allows API-key-authenticated callers to create new API keys when the caller is a secret key with the `account:keys` permission. The route strips the `keys` permission from child keys, but it does not constrain the child key's `pollenBudget`, `allowedModels`, or `expiresIn` relative to the parent key.

As a result, a BYOP/delegated key that a user approved with a small budget and narrow model allowlist can mint a new child key with a larger budget, different or broader model access, and a longer lifetime. That child key can then make generation requests using its own broader permissions and budget checks.

Root cause references:

- `enter.pollinations.ai/src/routes/account.ts:86` defines `requireKeysPermission()`, which checks only secret key type and `account:keys`.
- `enter.pollinations.ai/src/routes/account.ts:1373` applies that check before child key creation.
- `enter.pollinations.ai/src/routes/account.ts:1396` calls `createApiKeyForUser()` with caller-supplied `allowedModels`, `pollenBudget`, and `accountPermissions`.
- `shared/auth/api-key-creation.ts:258` strips `keys` from child account permissions when `allowAccountKeysPermission` is false.
- `shared/auth/api-key-creation.ts:263` accepts child `allowedModels` directly.
- `shared/auth/api-key-creation.ts:280` accepts child `expiresIn` directly.
- `shared/auth/api-key-creation.ts:301` stores child `pollenBudget` directly.
- `gen.pollinations.ai/src/utils/generation-access.ts:37` enforces generation budget from the authenticated key's own `pollenBalance`.
- `gen.pollinations.ai/src/middleware/auth.ts:71` to `:79` enforces generation model access from the authenticated key's own model permissions.

#### Proof of Concept

Benign local verification was performed with a temporary Vitest integration test, then the temporary file was removed.

The PoC created a local parent key with:

```json
{
  "allowedModels": ["flux"],
  "pollenBudget": 1,
  "accountPermissions": ["keys"]
}
```

Then it used that parent key to call:

```http
POST http://localhost:3000/api/account/keys
Authorization: Bearer <parent sk_ key>
Content-Type: application/json

{
  "name": "poc-child-broader",
  "allowedModels": ["openai"],
  "pollenBudget": 999,
  "accountPermissions": ["usage", "keys"]
}
```

Observed local result:

```text
HTTP 200
child.permissions = { "models": ["openai"], "account": ["usage"] }
child.pollenBudget = 999
```

Verification command:

```powershell
npx vitest run test/integration/account-keys-escalation.poc.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       1 passed (1)
```

The test runner also emitted teardown/log-write warnings from Wrangler under the sandbox, but the focused PoC test itself passed and returned the expected `200` child-key creation response.

#### Impact

An app or integration that receives a user-authorized key with `account:keys` can escape the user's approved spending and model constraints:

- Convert a low-budget delegated key into a high-budget or unlimited child key.
- Convert a model-restricted delegated key into a child key for other models.
- Create a child key with a longer lifetime than the delegated key.
- Use the child key for generation requests that are checked against the child key's broader budget and model permissions.

This is High severity because it can bypass user consent boundaries and spend from the victim account beyond the intended delegated cap. It requires the victim to grant `account:keys`, so it is not Critical.

#### Remediation

When an API key, not a session cookie, calls `/api/account/keys`, derive child constraints from the parent key and reject or clamp any broader request.

Recommended rules:

- Child `pollenBudget` must be non-null and no greater than the caller key's remaining `pollenBalance` when the caller key has a finite budget.
- Child `allowedModels` must be a subset of the caller key's `permissions.models` when the caller key is model-restricted.
- Child `expiresIn` must not outlive the caller key's expiration.
- Child account permissions must be a subset of the caller key's account permissions, with `keys` still stripped.
- Consider disallowing delegated key creation entirely for BYOP `createdVia: "redirect-auth"` keys unless there is a product requirement.

Sketch:

```ts
function enforceChildKeyBounds(parent: AuthenticatedApiKey, requested: CreateKeySchema) {
    if (parent.pollenBalance != null) {
        if (requested.pollenBudget == null || requested.pollenBudget > parent.pollenBalance) {
            throw new HTTPException(403, {
                message: "Child key budget cannot exceed parent key budget",
            });
        }
    }

    const parentModels = parent.permissions?.models;
    if (parentModels?.length) {
        const childModels = requested.allowedModels;
        if (!childModels?.length || childModels.some((m) => !parentModels.includes(m))) {
            throw new HTTPException(403, {
                message: "Child key models must be a subset of parent key models",
            });
        }
    }
}
```

Add regression coverage proving a parent key with `pollenBudget: 1`, `allowedModels: ["flux"]`, and `accountPermissions: ["keys"]` cannot create a child key with `pollenBudget: 999`, `allowedModels: ["openai"]`, null/unlimited budget, unrestricted models, or a longer expiry.
