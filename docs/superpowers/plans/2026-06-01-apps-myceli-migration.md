# Apps → Myceli Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Git policy (project override):** This repo requires **explicit user approval before any `git commit`/`git push`** ("yes commit"/"go ahead" — not "ok"). The commit steps below are part of the plan, but the executor MUST pause and get the user's go-ahead before running them. Never push or open a PR without an explicit instruction.

**Goal:** Move the 14 `apps.json` apps from the old Pollinations Cloudflare account to the Myceli account, keeping their `<app>.pollinations.ai` public URLs unchanged by forwarding through the existing `pollinations-proxy` worker.

**Architecture:** Apps become Cloudflare **Pages** projects (`apps-<sub>`) in Myceli, served at `<sub>.myceli.ai`. The old-account `pollinations-proxy` worker forwards `<sub>.pollinations.ai → <sub>.myceli.ai` via a **generic transform** (no embedded app list). The per-app deploy (`deploy.sh` → `deploy-app.js`) runs in **two phases in one job**: provision+upload+**verify the Myceli origin first**, then reclaim and attach the public domain — so the public URL is never flipped to an unbuilt origin (no cross-workflow race). The proxy's full route set is **generated from `apps.json` plus explicit ops routes** (`kpi`, `economics`) and that generated config is the source of truth for final route reconciliation, so Wrangler can never prune a live app or ops dashboard once the full config is deployed.

**Tech Stack:** Cloudflare Workers + Pages, Wrangler 4, Cloudflare REST API v4, Node.js (deploy scripts), TypeScript, Vitest, GitHub Actions, Bash.

---

## Reference values

- Old account (zone + proxy): `efdcb0933eaac64f27c0b295039b28f2`
- Myceli account (apps + compute): `b6ec751c0862027ba269faf7029b2501`
- `pollinations.ai` zone id (old account): `0942247b74a58e4fc5ea70341a3754a3`
- `myceli.ai` zone id: resolved at runtime via `GET /zones?name=myceli.ai`
- Proxy worker: `pollinations-proxy` (prod), `pollinations-proxy-staging` (staging)
- Apps (`apps/apps.json` keys, excluding `_defaults`): `react`, `catgpt`, `ai-dungeon-master`, `sirius-cybernetics-elevator-challenge`, `map-to-isometric`, `product-packaging-designer`, `virtual-makeup`, `opposite-prompt-generator`, `chat`, `model-monitor`, `changelog-generator`, `gsoc`, `openclaw`, `slidepainter`
- Worker custom-domain API: `PUT /accounts/{acct}/workers/domains` body `{hostname, service, environment, zone_id}` (idempotent upsert); `GET /accounts/{acct}/workers/domains`; `DELETE /accounts/{acct}/workers/domains/{domain_id}`

## Source-of-truth decision (why the generator)

Wrangler treats config as authoritative for routes: *"If you change your routes in the dashboard, Wrangler will override them in the next deploy"* ([source-of-truth docs](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth)), and custom domains in `routes` are actively reconciled and can even transfer between env Workers on deploy ([workers-sdk #13925](https://github.com/cloudflare/workers-sdk/issues/13925)). Therefore we never rely on "Wrangler won't prune API-added domains." Instead:

- During migration, app domains are attached **per-app via the API** (granular, gated on origin verification).
- During migration, `deploy:production` stays a **core-only safe deploy** (`wrangler deploy`) so an accidental proxy deploy cannot claim every app hostname before their origins exist.
- After migration, a generator (`scripts/gen-routes.mjs`) writes the full route set (core + every app in `apps.json` + `kpi`/`economics` ops routes) into `wrangler.generated.toml`, and `deploy:production:full` deploys **that** file — so the config always contains every live app/ops route and reconciliation is a correct no-op.

**Ordering constraint:** `npm run deploy:production` / `npm run deploy:production:core` is safe before app cutovers, but do NOT run it after app domains have been attached via API (Task 6/7) and before the full generated deploy (Task 8) — it would prune them. The first proxy redeploy after Task 6/7 must be `npm run deploy:production:full`.

## File structure

| File | Change | Responsibility |
| --- | --- | --- |
| `pollinations-myceli-proxy/src/upstream.ts` | Create | Pure `lookupUpstream(mapJson, host)` with generic transform |
| `pollinations-myceli-proxy/src/upstream.test.ts` | Create | Vitest unit tests |
| `pollinations-myceli-proxy/src/index.ts` | Modify | Import `lookupUpstream` from `./upstream` |
| `pollinations-myceli-proxy/package.json` | Modify | `vitest` devDep + `test`; split `deploy:production:core`/`:full` |
| `apps/_scripts/deploy-app.js` | Rewrite | Two-phase, cross-account, throw-on-failure |
| `apps/_scripts/deploy.sh` | Modify | Use `subdomain`; orchestrate origin → verify → cutover |
| `.github/workflows/app-deploy-automatic.yml` | Modify | Map Myceli + old-account creds |
| `pollinations-myceli-proxy/scripts/gen-routes.mjs` | Create (Task 8) | Generate full route set from `apps.json` plus explicit ops routes |
| `pollinations-myceli-proxy/wrangler.toml` | Modify (Task 8) | Add generated-routes marker |
| `.gitignore` | Modify (Task 8) | Ignore `wrangler.generated.toml` |
| `apps/operation/kpi/wrangler.toml` | Modify | Add `kpi.myceli.ai` origin route |
| `apps/operation/kpi/README.md` | Modify | Document public + origin URLs |
| `apps/operation/economics/README.md` | Modify | Document public + origin URLs and proxy shape |

---

## Task 0: Prerequisites (no code — confirm before starting)

**Files:** none.

- [ ] **Step 1: Confirm the old-account token can manage Worker custom domains + DNS**

The `CLOUDFLARE_API_TOKEN` repo secret (old account) needs **Workers Scripts: Edit** (account) + **Workers Routes: Edit** and **DNS: Edit** (zone `pollinations.ai`). With it exported as `OLD_TOKEN`:

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/efdcb0933eaac64f27c0b295039b28f2/workers/domains" \
  -H "Authorization: Bearer $OLD_TOKEN" | head -c 400
```

Expected: `"success": true` (not auth error `code: 10000`). If it fails, have the user extend/mint the token.

- [ ] **Step 2: Confirm the Myceli token can manage Pages + myceli.ai DNS**

With the Myceli token exported as `MYC_TOKEN`:

```bash
curl -s "https://api.cloudflare.com/client/v4/zones?name=myceli.ai" \
  -H "Authorization: Bearer $MYC_TOKEN" | grep -o '"id":"[a-f0-9]*"' | head -1
curl -s "https://api.cloudflare.com/client/v4/accounts/b6ec751c0862027ba269faf7029b2501/pages/projects?per_page=5" \
  -H "Authorization: Bearer $MYC_TOKEN" | head -c 200
```

Expected: a zone id is printed and the Pages list returns `"success": true`.

- [ ] **Step 3: Create `apps/.env` for local runs (must be gitignored)**

```bash
cat > apps/.env <<'EOF'
CLOUDFLARE_API_TOKEN_MYCELI=<myceli token>
CLOUDFLARE_ACCOUNT_ID_MYCELI=b6ec751c0862027ba269faf7029b2501
CLOUDFLARE_API_TOKEN_OLD=<old account token>
CLOUDFLARE_ACCOUNT_ID_OLD=efdcb0933eaac64f27c0b295039b28f2
EOF
git check-ignore apps/.env && echo "ignored OK" || echo "WARNING: add apps/.env to .gitignore"
```

Expected: `ignored OK`. If not, add `apps/.env` to `.gitignore` before continuing.

---

## Task 1: Proxy generic forwarding (TDD)

**Files:**
- Create: `pollinations-myceli-proxy/src/upstream.ts`, `pollinations-myceli-proxy/src/upstream.test.ts`
- Modify: `pollinations-myceli-proxy/src/index.ts`, `pollinations-myceli-proxy/package.json`

- [ ] **Step 1: Add vitest to the proxy package**

Edit `pollinations-myceli-proxy/package.json` — add the `test` script and `vitest` devDep:

```json
{
    "name": "pollinations-myceli-proxy",
    "type": "module",
    "version": "1.0.0",
    "description": "Thin proxy: forwards traffic from *.pollinations.ai to *.myceli.ai upstreams. Lives in the Pollinations Cloudflare account so the zone keeps owning the public domain.",
    "private": true,
    "main": "src/index.ts",
    "scripts": {
        "deploy:staging": "wrangler deploy --env staging",
        "deploy:production": "npm run deploy:production:core",
        "deploy:production:core": "wrangler deploy",
        "deploy:production:full": "node scripts/gen-routes.mjs && wrangler deploy --config wrangler.generated.toml",
        "tail:staging": "wrangler tail --env staging",
        "tail:production": "wrangler tail",
        "typecheck": "tsc --noEmit",
        "test": "vitest run"
    },
    "devDependencies": {
        "@cloudflare/workers-types": "^4.20251101.0",
        "typescript": "^5.9.3",
        "vitest": "^3.2.4",
        "wrangler": "^4.55.0"
    }
}
```

Then: `cd pollinations-myceli-proxy && npm install`. Expected: installs `vitest` cleanly.

- [ ] **Step 2: Write the failing test**

Create `pollinations-myceli-proxy/src/upstream.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lookupUpstream } from "./upstream";

const PROD_MAP = JSON.stringify({
    "pollinations.ai": "pollinations.myceli.ai",
    "enter.pollinations.ai": "enter.myceli.ai",
    "gen.pollinations.ai": "gen.myceli.ai",
    "media.pollinations.ai": "media.myceli.ai",
});

const STAGING_MAP = JSON.stringify({
    "staging.pollinations.ai": "staging.pollinations.myceli.ai",
    "staging.enter.pollinations.ai": "staging.enter.myceli.ai",
    "staging.gen.pollinations.ai": "staging.gen.myceli.ai",
});

describe("lookupUpstream", () => {
    it("maps the apex via the explicit map", () => {
        expect(lookupUpstream(PROD_MAP, "pollinations.ai")).toBe(
            "pollinations.myceli.ai",
        );
    });
    it("maps core services via the explicit map", () => {
        expect(lookupUpstream(PROD_MAP, "enter.pollinations.ai")).toBe(
            "enter.myceli.ai",
        );
    });
    it("maps an app subdomain via the generic rule", () => {
        expect(lookupUpstream(PROD_MAP, "catgpt.pollinations.ai")).toBe(
            "catgpt.myceli.ai",
        );
    });
    it("maps hyphenated app subdomains", () => {
        expect(
            lookupUpstream(PROD_MAP, "ai-dungeon-master.pollinations.ai"),
        ).toBe("ai-dungeon-master.myceli.ai");
    });
    it("returns undefined for non-pollinations hosts", () => {
        expect(lookupUpstream(PROD_MAP, "example.com")).toBeUndefined();
    });
    it("does not generic-match multi-label hosts", () => {
        expect(
            lookupUpstream(PROD_MAP, "staging.enter.pollinations.ai"),
        ).toBeUndefined();
    });
    it("explicit map wins over the generic rule (staging apex)", () => {
        expect(lookupUpstream(STAGING_MAP, "staging.pollinations.ai")).toBe(
            "staging.pollinations.myceli.ai",
        );
    });
    it("still resolves when the map JSON is malformed", () => {
        expect(lookupUpstream("not json", "catgpt.pollinations.ai")).toBe(
            "catgpt.myceli.ai",
        );
    });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd pollinations-myceli-proxy && npx vitest run src/upstream.test.ts
```

Expected: FAIL — `Failed to resolve import "./upstream"`.

- [ ] **Step 4: Create the pure module**

Create `pollinations-myceli-proxy/src/upstream.ts`:

```ts
/**
 * Resolve the Myceli upstream host for an incoming public host.
 *
 * 1. Explicit map (UPSTREAM_MAP var) wins — covers the apex (pollinations.ai)
 *    and any staging hosts whose upstream isn't a simple label swap.
 * 2. Generic rule: a single-label subdomain of pollinations.ai maps to the same
 *    label under myceli.ai (catgpt.pollinations.ai -> catgpt.myceli.ai). This is
 *    how apps route — the set of app custom domains attached to the proxy is the
 *    allowlist, so the proxy code never changes when apps change.
 * 3. Otherwise undefined (caller returns 502).
 *
 * Multi-label hosts (e.g. staging.enter.pollinations.ai) never match the generic
 * rule and must be in the explicit map.
 */
export function lookupUpstream(
    mapJson: string,
    host: string,
): string | undefined {
    let map: Record<string, string> = {};
    try {
        map = JSON.parse(mapJson) as Record<string, string>;
    } catch {
        // Malformed map: skip it and fall through to the generic rule.
    }

    if (map[host]) return map[host];

    const match = /^([a-z0-9-]+)\.pollinations\.ai$/.exec(host);
    if (match) return `${match[1]}.myceli.ai`;

    return undefined;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd pollinations-myceli-proxy && npx vitest run src/upstream.test.ts
```

Expected: PASS — all 8 tests green.

- [ ] **Step 6: Wire the proxy to the module**

Edit `pollinations-myceli-proxy/src/index.ts`. Add at the top:

```ts
import { lookupUpstream } from "./upstream";
```

Delete the inline definition at the bottom of the file:

```ts
function lookupUpstream(mapJson: string, host: string): string | undefined {
    try {
        const map = JSON.parse(mapJson) as Record<string, string>;
        return map[host];
    } catch {
        return undefined;
    }
}
```

Leave the call site `const upstreamHost = lookupUpstream(env.UPSTREAM_MAP, publicHost);` unchanged.

- [ ] **Step 7: Typecheck + full test**

```bash
cd pollinations-myceli-proxy && npm run typecheck && npx vitest run
```

Expected: typecheck clean, all tests pass.

- [ ] **Step 8: Biome + commit** (pause for user approval)

```bash
npx biome check --write pollinations-myceli-proxy/src/
git add pollinations-myceli-proxy/
git commit -m "proxy: generic pollinations.ai -> myceli.ai forwarding for apps"
```

---

## Task 2: Deploy proxy forwarding code (core routes only)

**Files:** none (operational). The generic forwarding must be live before any app domain is attached. The proxy config still has **core-only routes** at this point (the generator is Task 8), so deploying does not touch app domains.

- [ ] **Step 1: Deploy to staging and smoke-test**

```bash
cd pollinations-myceli-proxy
# wrangler authenticated to the OLD account (default.toml <- pollinations.toml)
npm run deploy:staging
curl -sI https://staging.pollinations.ai | head -1   # core staging still serves
```

- [ ] **Step 2: Deploy to production and smoke-test core services**

```bash
cd pollinations-myceli-proxy && npm run deploy:production:core
curl -sI https://pollinations.ai | head -1            # apex 200
curl -sI https://enter.pollinations.ai | head -1      # core service unaffected
curl -sI https://gen.pollinations.ai | head -1
```

Expected: all core hosts still serve (forwarding for them is unchanged — explicit map). No app domains are attached yet.

---

## Task 3: Two-phase, cross-account `deploy-app.js`

**Files:**
- Rewrite: `apps/_scripts/deploy-app.js`

- [ ] **Step 1: Replace `apps/_scripts/deploy-app.js`**

Write the full file:

```js
#!/usr/bin/env node

/**
 * Provision Cloudflare routing for an app, in two phases (run in order by
 * deploy.sh, with an origin-health gate between them):
 *
 *   --phase=origin   (BEFORE `wrangler pages deploy`)
 *     Myceli: create apps-<sub> Pages project, add the <sub>.myceli.ai custom
 *     domain, upsert the myceli.ai DNS CNAME.
 *
 *   --phase=cutover  (AFTER the upload AND after <sub>.myceli.ai is verified 200)
 *     Old account: reclaim <sub>.pollinations.ai from any old Pages project,
 *     delete the stale pages.dev CNAME, then attach <sub>.pollinations.ai as a
 *     custom domain on the pollinations-proxy worker.
 *
 * Splitting the phases means the public URL is never pointed at an origin that
 * hasn't been uploaded and verified. All Cloudflare calls throw on unexpected
 * failure so a broken step aborts the deploy instead of silently half-migrating.
 *
 * Usage: node deploy-app.js <appName> --phase=origin|cutover
 */

const fs = require("node:fs");
const path = require("node:path");

const CF_API = "https://api.cloudflare.com/client/v4";
const OLD_POLLINATIONS_ZONE_ID = "0942247b74a58e4fc5ea70341a3754a3"; // pollinations.ai
const PROXY_WORKER = "pollinations-proxy";
const PUBLIC_ZONE = "pollinations.ai";
const UPSTREAM_ZONE = "myceli.ai";

function loadEnvFile() {
    const envPath = path.join(__dirname, "../.env");
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
}

function loadCredentials() {
    loadEnvFile();
    const mycToken =
        process.env.CLOUDFLARE_API_TOKEN_MYCELI ||
        process.env.CLOUDFLARE_API_TOKEN;
    const mycAccount =
        process.env.CLOUDFLARE_ACCOUNT_ID_MYCELI ||
        process.env.CLOUDFLARE_ACCOUNT_ID;
    const oldToken = process.env.CLOUDFLARE_API_TOKEN_OLD;
    const oldAccount = process.env.CLOUDFLARE_ACCOUNT_ID_OLD;
    return { mycToken, mycAccount, oldToken, oldAccount };
}

const headersFor = (token) => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
});

/** fetch + JSON; returns {ok, json}. Never throws on its own. */
async function cf(url, headers, init = {}) {
    const res = await fetch(url, { headers, ...init });
    let json = {};
    try {
        json = await res.json();
    } catch {
        // empty body (e.g. some DELETEs)
    }
    return { ok: res.ok, json };
}

const hasCode = (json, ...codes) =>
    json.errors?.some((e) => codes.includes(e.code));

async function resolveZoneId(zoneName, headers) {
    const { json } = await cf(`${CF_API}/zones?name=${zoneName}`, headers);
    const zone = json.result?.[0];
    if (!zone) throw new Error(`Zone not found: ${zoneName}`);
    return zone.id;
}

async function createPagesProject(account, headers, project, appConfig) {
    const { ok, json } = await cf(
        `${CF_API}/accounts/${account}/pages/projects`,
        headers,
        {
            method: "POST",
            body: JSON.stringify({
                name: project,
                production_branch: "production",
                build_config: {
                    build_command: appConfig.buildCommand || "",
                    destination_dir: appConfig.outputDir || ".",
                },
            }),
        },
    );
    if (ok || hasCode(json, 8000002)) {
        // 8000002 = already exists
        console.log(`✅ Pages project ready: ${project}`);
        return;
    }
    throw new Error(`Create project ${project} failed: ${JSON.stringify(json)}`);
}

/** Find the Pages project (in `account`) holding `customDomain` and remove it. */
async function detachPagesDomain(account, headers, customDomain) {
    const { json } = await cf(
        `${CF_API}/accounts/${account}/pages/projects?per_page=100`,
        headers,
    );
    for (const project of json.result || []) {
        const { json: domains } = await cf(
            `${CF_API}/accounts/${account}/pages/projects/${project.name}/domains`,
            headers,
        );
        if (!domains.result?.some((d) => d.name === customDomain)) continue;
        const { ok, json: del } = await cf(
            `${CF_API}/accounts/${account}/pages/projects/${project.name}/domains/${customDomain}`,
            headers,
            { method: "DELETE" },
        );
        if (!ok)
            throw new Error(
                `Detach ${customDomain} from ${project.name} failed: ${JSON.stringify(del)}`,
            );
        console.log(`   Detached ${customDomain} from ${project.name}`);
        return;
    }
    // not held by any project — nothing to do
}

async function addPagesDomain(account, headers, project, customDomain) {
    const post = () =>
        cf(
            `${CF_API}/accounts/${account}/pages/projects/${project}/domains`,
            headers,
            { method: "POST", body: JSON.stringify({ name: customDomain }) },
        );
    let { ok, json } = await post();
    if (ok || hasCode(json, 8000007)) {
        // 8000007 = domain already on this project
        console.log(`✅ Pages custom domain: ${customDomain}`);
        return;
    }
    if (hasCode(json, 8000018)) {
        // 8000018 = claimed by another project in this account
        console.log(`   ${customDomain} claimed elsewhere — reclaiming...`);
        await detachPagesDomain(account, headers, customDomain);
        ({ ok, json } = await post());
        if (ok) {
            console.log(`✅ Pages custom domain (reclaimed): ${customDomain}`);
            return;
        }
    }
    throw new Error(
        `Add Pages domain ${customDomain} failed: ${JSON.stringify(json)}`,
    );
}

/** Upsert a proxied CNAME `<name>` -> `target` in `zoneId`. */
async function upsertCname(zoneId, headers, name, target) {
    const { ok, json } = await cf(
        `${CF_API}/zones/${zoneId}/dns_records`,
        headers,
        {
            method: "POST",
            body: JSON.stringify({
                type: "CNAME",
                name,
                content: target,
                ttl: 1,
                proxied: true,
            }),
        },
    );
    if (ok) {
        console.log(`✅ DNS CNAME: ${name} -> ${target}`);
        return;
    }
    if (hasCode(json, 81053, 81057)) {
        // already exists — patch to the correct target
        const { json: list } = await cf(
            `${CF_API}/zones/${zoneId}/dns_records?type=CNAME&name=${name}`,
            headers,
        );
        const record = list.result?.[0];
        if (record && record.content !== target) {
            const { ok: upOk, json: up } = await cf(
                `${CF_API}/zones/${zoneId}/dns_records/${record.id}`,
                headers,
                { method: "PATCH", body: JSON.stringify({ content: target }) },
            );
            if (!upOk)
                throw new Error(`DNS update ${name} failed: ${JSON.stringify(up)}`);
            console.log(`✅ DNS CNAME updated: ${name} -> ${target}`);
        } else {
            console.log(`✅ DNS CNAME already correct: ${name}`);
        }
        return;
    }
    throw new Error(`DNS upsert ${name} failed: ${JSON.stringify(json)}`);
}

/** Delete a CNAME by exact name. No-op if absent. */
async function deleteCname(zoneId, headers, name) {
    const { json } = await cf(
        `${CF_API}/zones/${zoneId}/dns_records?type=CNAME&name=${name}`,
        headers,
    );
    const record = json.result?.[0];
    if (!record) return;
    const { ok, json: del } = await cf(
        `${CF_API}/zones/${zoneId}/dns_records/${record.id}`,
        headers,
        { method: "DELETE" },
    );
    if (!ok) throw new Error(`Delete CNAME ${name} failed: ${JSON.stringify(del)}`);
    console.log(`   Removed old CNAME ${name}`);
}

/** Attach `hostname` as a custom domain on the proxy worker (idempotent PUT). */
async function attachWorkerDomain(account, headers, hostname, zoneId) {
    const { ok, json } = await cf(
        `${CF_API}/accounts/${account}/workers/domains`,
        headers,
        {
            method: "PUT",
            body: JSON.stringify({
                hostname,
                service: PROXY_WORKER,
                environment: "production",
                zone_id: zoneId,
            }),
        },
    );
    if (!ok)
        throw new Error(
            `Attach proxy domain ${hostname} failed: ${JSON.stringify(json)}`,
        );
    console.log(`✅ Proxy custom domain: ${hostname} -> ${PROXY_WORKER}`);
}

function appContext(appName) {
    const config = JSON.parse(
        fs.readFileSync(path.join(__dirname, "../apps.json"), "utf8"),
    );
    const appConfig = config[appName];
    if (!appConfig) throw new Error(`App ${appName} not found in apps.json`);
    const sub = appConfig.subdomain || appName;
    return {
        appConfig,
        sub,
        project: `apps-${sub}`,
        originDomain: `${sub}.${UPSTREAM_ZONE}`,
        publicDomain: `${sub}.${PUBLIC_ZONE}`,
    };
}

async function runOrigin(appName) {
    const { appConfig, sub, project, originDomain } = appContext(appName);
    console.log(`1️⃣ Myceli origin for ${originDomain}`);
    const myc = headersFor(MYC_TOKEN);
    const mycZoneId = await resolveZoneId(UPSTREAM_ZONE, myc);
    await createPagesProject(MYC_ACCOUNT, myc, project, appConfig);
    await addPagesDomain(MYC_ACCOUNT, myc, project, originDomain);
    await upsertCname(mycZoneId, myc, sub, `${project}.pages.dev`);
    console.log(`✨ Origin provisioned: https://${originDomain}`);
}

async function runCutover(appName) {
    const { publicDomain, originDomain } = appContext(appName);
    console.log(`2️⃣ Public cutover ${publicDomain} -> ${originDomain}`);
    const old = headersFor(OLD_TOKEN);
    await detachPagesDomain(OLD_ACCOUNT, old, publicDomain);
    await deleteCname(OLD_POLLINATIONS_ZONE_ID, old, publicDomain);
    await attachWorkerDomain(OLD_ACCOUNT, old, publicDomain, OLD_POLLINATIONS_ZONE_ID);
    console.log(`✨ Public routing ready: https://${publicDomain}`);
}

const {
    mycToken: MYC_TOKEN,
    mycAccount: MYC_ACCOUNT,
    oldToken: OLD_TOKEN,
    oldAccount: OLD_ACCOUNT,
} = loadCredentials();

const appName = process.argv[2];
const phaseArg = process.argv.find((a) => a.startsWith("--phase="));
const phase = phaseArg ? phaseArg.split("=")[1] : "";

if (!appName || (phase !== "origin" && phase !== "cutover")) {
    console.error("Usage: node deploy-app.js <appName> --phase=origin|cutover");
    process.exit(1);
}
if (!MYC_TOKEN || !MYC_ACCOUNT) {
    console.error("❌ Missing Myceli creds (CLOUDFLARE_API_TOKEN_MYCELI / _ACCOUNT_ID_MYCELI)");
    process.exit(1);
}
if (phase === "cutover" && (!OLD_TOKEN || !OLD_ACCOUNT)) {
    console.error("❌ Missing old-account creds (CLOUDFLARE_API_TOKEN_OLD / _ACCOUNT_ID_OLD)");
    process.exit(1);
}

const run = phase === "origin" ? runOrigin : runCutover;
run(appName).catch((err) => {
    console.error(`❌ ${phase} failed:`, err.message);
    process.exit(1);
});
```

- [ ] **Step 2: Biome + syntax check**

```bash
npx biome check --write apps/_scripts/deploy-app.js
node --check apps/_scripts/deploy-app.js
```

Expected: biome clean, `node --check` exits 0.

- [ ] **Step 3: Commit** (pause for user approval)

```bash
git add apps/_scripts/deploy-app.js
git commit -m "apps: two-phase cross-account routing (origin then cutover)"
```

---

## Task 4: `deploy.sh` — subdomain + ordered phases with origin gate

**Files:**
- Modify: `apps/_scripts/deploy.sh`

- [ ] **Step 1: Derive the subdomain from apps.json (fix #5)**

In `apps/_scripts/deploy.sh`, after `BUILD_CMD=...`, replace:

```bash
PROJECT_NAME="apps-$APP_NAME"
```

with:

```bash
SUBDOMAIN=$(echo "$CONFIG" | node -e "const c=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(c.subdomain || process.argv[1])" "$APP_NAME")
PROJECT_NAME="apps-$SUBDOMAIN"
```

And update the `echo "📋 Project: $PROJECT_NAME"` area to also log `echo "🌐 Subdomain: $SUBDOMAIN"`.

- [ ] **Step 2: Replace the deploy/cutover tail of the script (fix #1)**

Replace everything from `# Step 4: Setup Cloudflare infrastructure` to the end of the file with:

```bash
# Step 4: Provision the Myceli origin (BEFORE upload)
echo ""
echo "☁️ Provisioning Myceli origin..."
node "$SCRIPT_DIR/deploy-app.js" "$APP_NAME" --phase=origin

# Step 5: Upload content to Cloudflare Pages (Myceli)
echo ""
echo "🚀 Uploading to Cloudflare Pages..."
npx wrangler pages deploy "$APP_PATH/$OUTPUT_DIR" \
    --project-name="$PROJECT_NAME" \
    --branch=production \
    --commit-dirty=true

# Step 6: Gate — the origin must serve before we flip the public URL
echo ""
echo "⏳ Waiting for https://$SUBDOMAIN.myceli.ai to serve (cert provisioning)..."
for i in $(seq 1 30); do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://$SUBDOMAIN.myceli.ai" || echo "000")
    if [ "$CODE" = "200" ]; then echo "✅ Origin live"; break; fi
    if [ "$i" = "30" ]; then
        echo "❌ Origin not live (last: $CODE) — aborting before cutover"
        exit 1
    fi
    sleep 10
done

# Step 7: Public cutover (AFTER origin verified)
echo ""
echo "🔀 Cutting over public domain..."
node "$SCRIPT_DIR/deploy-app.js" "$APP_NAME" --phase=cutover

# Step 8: Verify the public URL serves via the proxy
echo ""
echo "⏳ Verifying https://$SUBDOMAIN.pollinations.ai ..."
for i in $(seq 1 30); do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://$SUBDOMAIN.pollinations.ai" || echo "000")
    if [ "$CODE" = "200" ]; then echo "✅ Public URL live"; break; fi
    if [ "$i" = "30" ]; then
        echo "❌ Public URL not serving (last: $CODE) — investigate (rollback in plan Task 6)"
        exit 1
    fi
    sleep 10
done

echo ""
echo "✅ Deployed: https://$SUBDOMAIN.pollinations.ai (origin: https://$SUBDOMAIN.myceli.ai)"
```

- [ ] **Step 3: Lint + commit** (pause for user approval)

```bash
bash -n apps/_scripts/deploy.sh
git add apps/_scripts/deploy.sh
git commit -m "apps: order origin->verify->cutover; key project on subdomain"
```

Expected: `bash -n` reports no syntax errors.

---

## Task 5: Workflow credentials

**Files:**
- Modify: `.github/workflows/app-deploy-automatic.yml`

- [ ] **Step 1: Map both credential sets into the Deploy step**

Replace the `Deploy` step's `env`/`run`:

```yaml
      - name: Deploy
        if: steps.app.outputs.skip != 'true'
        env:
          # wrangler pages deploy + deploy-app.js origin phase target Myceli.
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN_MYCELI }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID_MYCELI }}
          # Old account: cutover phase attaches <app>.pollinations.ai to the proxy.
          CLOUDFLARE_API_TOKEN_OLD: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID_OLD: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: ./apps/_scripts/deploy.sh ${{ steps.app.outputs.app_name }}
```

- [ ] **Step 2: Commit** (pause for user approval)

```bash
git add .github/workflows/app-deploy-automatic.yml
git commit -m "ci: point app deploy at myceli, keep old-account proxy creds"
```

---

## Task 6: Cutover `catgpt` first (local, end-to-end)

**Files:** none (operational). Validates the whole two-phase pipeline + gates on one static app before merge. Expect a brief (seconds–~1 min) blip on `catgpt.pollinations.ai` while the proxy custom-domain cert provisions during cutover.

- [ ] **Step 1: Run the pipeline locally**

```bash
# apps/.env (Task 0) supplies _MYCELI / _OLD. wrangler pages deploy needs the
# plain vars set to Myceli:
export CLOUDFLARE_API_TOKEN=$(grep ^CLOUDFLARE_API_TOKEN_MYCELI apps/.env | cut -d= -f2-)
export CLOUDFLARE_ACCOUNT_ID=b6ec751c0862027ba269faf7029b2501
./apps/_scripts/deploy.sh catgpt
```

Expected: origin provisioned → upload → `catgpt.myceli.ai` 200 → cutover → `catgpt.pollinations.ai` 200. Script aborts if either gate fails.

- [ ] **Step 2: Independent verification**

```bash
curl -s https://catgpt.pollinations.ai | head -c 200
curl -s https://catgpt.myceli.ai | head -c 200
```

Expected: identical bodies (public served from the Myceli origin via the proxy).

- [ ] **Step 3: If broken — roll back catgpt (restores Pages domain AND CNAME, fix #4)**

```bash
OLD_TOKEN=$(grep ^CLOUDFLARE_API_TOKEN_OLD apps/.env | cut -d= -f2-)
ACCT=efdcb0933eaac64f27c0b295039b28f2
ZONE=0942247b74a58e4fc5ea70341a3754a3
# 1. detach from the proxy worker
DID=$(curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCT/workers/domains" \
  -H "Authorization: Bearer $OLD_TOKEN" \
  | python3 -c 'import sys,json;[print(d["id"]) for d in json.load(sys.stdin)["result"] if d["hostname"]=="catgpt.pollinations.ai"]')
[ -n "$DID" ] && curl -s -X DELETE "https://api.cloudflare.com/client/v4/accounts/$ACCT/workers/domains/$DID" \
  -H "Authorization: Bearer $OLD_TOKEN" | head -c 120
# 2. re-add the Pages custom domain on the old project (ok if 8000007 already-exists)
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCT/pages/projects/apps-catgpt/domains" \
  -H "Authorization: Bearer $OLD_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"catgpt.pollinations.ai"}' | head -c 120
# 3. restore the proxied CNAME — patch if it exists, else create (no blind POST)
BODY='{"type":"CNAME","name":"catgpt","content":"apps-catgpt.pages.dev","ttl":1,"proxied":true}'
REC=$(curl -s "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records?type=CNAME&name=catgpt.pollinations.ai" \
  -H "Authorization: Bearer $OLD_TOKEN" \
  | python3 -c 'import sys,json;r=json.load(sys.stdin)["result"];print(r[0]["id"] if r else "")')
if [ -n "$REC" ]; then
  curl -s -X PATCH "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records/$REC" \
    -H "Authorization: Bearer $OLD_TOKEN" -H "Content-Type: application/json" -d "$BODY" | head -c 200
else
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records" \
    -H "Authorization: Bearer $OLD_TOKEN" -H "Content-Type: application/json" -d "$BODY" | head -c 200
fi
# 4. REQUIRE a 200 before declaring rollback done
for i in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' https://catgpt.pollinations.ai || echo 000)
  [ "$CODE" = "200" ] && { echo "✅ rollback verified"; break; }
  [ "$i" = "30" ] && echo "❌ rollback NOT verified (last: $CODE) — investigate before retrying"
  sleep 10
done
```

Then diagnose before retrying.

---

## Task 7: Merge, then cut over the remaining 13 apps

**Files:** none (operational).

- [ ] **Step 1: Merge the code** (pause for user approval)

Open a PR with Tasks 1/3/4/5 (proxy already deployed in Task 2). Request review (`polly` comment) and merge to `main`. The push touches only `apps/_scripts/**` and `.github/**`; the workflow's app detector extracts a non-app path and skips, so the merge auto-deploys nothing.

- [ ] **Step 2: Cut over the remaining apps**

Each via `workflow_dispatch` (merged code + secrets) or locally as in Task 6. Local loop (each app runs the full gated pipeline; a failure aborts that app and the loop continues):

```bash
export CLOUDFLARE_API_TOKEN=$(grep ^CLOUDFLARE_API_TOKEN_MYCELI apps/.env | cut -d= -f2-)
export CLOUDFLARE_ACCOUNT_ID=b6ec751c0862027ba269faf7029b2501
for app in react ai-dungeon-master sirius-cybernetics-elevator-challenge \
  map-to-isometric product-packaging-designer virtual-makeup \
  opposite-prompt-generator chat model-monitor changelog-generator \
  gsoc openclaw slidepainter; do
    echo "=== $app ==="; ./apps/_scripts/deploy.sh "$app" || echo "FAILED: $app"
done
```

- [ ] **Step 3: Verify every app**

```bash
for app in react catgpt ai-dungeon-master sirius-cybernetics-elevator-challenge \
  map-to-isometric product-packaging-designer virtual-makeup \
  opposite-prompt-generator chat model-monitor changelog-generator \
  gsoc openclaw slidepainter; do
    echo "$app -> $(curl -s -o /dev/null -w '%{http_code}' "https://$app.pollinations.ai")"
done
```

Expected: every app `200`. Exercise `chat` and `model-monitor` interactively (streaming/WS), not just the index page.

**Do not redeploy the proxy after this step until Task 8** (a core-only deploy would prune the just-attached app domains — see Source-of-truth decision).

---

## Task 7.5: Prepare KPI and economics ops routes

**Files:**
- Modify: `apps/operation/kpi/wrangler.toml`, `apps/operation/kpi/README.md`, `apps/operation/economics/README.md`

These are not community apps and should stay out of `apps/apps.json`, but they should use the same public forwarding rule: `<sub>.pollinations.ai → <sub>.myceli.ai`.

- [ ] **Step 1: Publish/verify the KPI Myceli origin**

Deploy `apps/operation/kpi` to the Myceli account so the Worker owns `kpi.myceli.ai`:

```bash
cd apps/operation/kpi && npx wrangler deploy
curl -s -o /dev/null -w '%{http_code}\n' https://kpi.myceli.ai
```

Expected: `200` from `kpi.myceli.ai` before the full proxy config claims `kpi.pollinations.ai`.

- [ ] **Step 2: Verify the economics Myceli origin**

Economics is served by the existing Cloudflare Tunnel/Grafana stack, so verify the origin before claiming the public hostname:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://economics.myceli.ai
```

Expected: `200` or a deliberate auth/login response from Grafana. If `economics.pollinations.ai` redirects to the Myceli origin after cutover, Grafana is still configured with `GF_SERVER_ROOT_URL=https://economics.myceli.ai`; update that only if the public hostname should become canonical.

---

## Task 8: Make the proxy config the durable source of truth (generator)

**Files:**
- Create: `pollinations-myceli-proxy/scripts/gen-routes.mjs`
- Modify: `pollinations-myceli-proxy/wrangler.toml`, `pollinations-myceli-proxy/package.json`, `.gitignore`

- [ ] **Step 1: Add the generated-routes marker to `wrangler.toml`**

In `pollinations-myceli-proxy/wrangler.toml`, change the top-level `routes` array to keep the 4 core entries and add a marker line as the last array element placeholder:

```toml
routes = [
  { pattern = "pollinations.ai", custom_domain = true },
  { pattern = "enter.pollinations.ai", custom_domain = true },
  { pattern = "gen.pollinations.ai", custom_domain = true },
  { pattern = "media.pollinations.ai", custom_domain = true },
  # GENERATED-PROXY-ROUTES (apps + ops; injected by scripts/gen-routes.mjs)
]
```

(Leave the `[env.staging]` and `[env.dev]` route blocks untouched — app/ops generated routes are production-only.)

- [ ] **Step 2: Create the generator**

Create `pollinations-myceli-proxy/scripts/gen-routes.mjs`:

```js
// Generate wrangler.generated.toml with app routes from apps.json plus explicit
// ops routes. apps.json remains the source of truth for community app domains.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MARKER =
    "  # GENERATED-PROXY-ROUTES (apps + ops; injected by scripts/gen-routes.mjs)";
const OPS_SUBDOMAINS = ["economics", "kpi"];

const apps = JSON.parse(
    readFileSync(join(here, "../../apps/apps.json"), "utf8"),
);
const subs = Object.entries(apps)
    .filter(([key]) => key !== "_defaults")
    .map(([key, cfg]) => cfg.subdomain || key) // match deploy code's source-of-truth contract
    .sort();

const routes = [...subs, ...OPS_SUBDOMAINS]
    .sort()
    .map((sub) => `  { pattern = "${sub}.pollinations.ai", custom_domain = true },`)
    .join("\n");

const base = readFileSync(join(here, "../wrangler.toml"), "utf8");
if (!base.includes(MARKER)) {
    throw new Error("GENERATED-PROXY-ROUTES marker not found in wrangler.toml");
}
writeFileSync(
    join(here, "../wrangler.generated.toml"),
    base.replace(MARKER, routes),
);
console.log(
    `Generated ${subs.length} app routes + ${OPS_SUBDOMAINS.length} ops routes -> wrangler.generated.toml`,
);
```

- [ ] **Step 3: Split the safe and full production deploy commands**

In `pollinations-myceli-proxy/package.json`, change:

```json
        "deploy:production": "wrangler deploy",
```

to:

```json
        "deploy:production": "npm run deploy:production:core",
        "deploy:production:core": "wrangler deploy",
        "deploy:production:full": "node scripts/gen-routes.mjs && wrangler deploy --config wrangler.generated.toml",
```

(`deploy:staging` stays `wrangler deploy --env staging` on the base config.)

- [ ] **Step 4: Ignore the generated file**

Append to `.gitignore`:

```
pollinations-myceli-proxy/wrangler.generated.toml
```

- [ ] **Step 5: Generate + sanity check the output (no deploy yet)**

```bash
cd pollinations-myceli-proxy && node scripts/gen-routes.mjs
grep -c 'custom_domain = true' wrangler.generated.toml
grep -q 'catgpt.pollinations.ai' wrangler.generated.toml && echo "app route present"
grep -q 'kpi.pollinations.ai' wrangler.generated.toml && echo "kpi route present"
grep -q 'economics.pollinations.ai' wrangler.generated.toml && echo "economics route present"
```

Expected: prints "Generated 14 app routes + 2 ops routes"; the count is `24` — the generated file is the **whole** config, so it includes 4 core + 14 apps + 2 ops + 3 staging + 1 dev custom domains (the env blocks carry their own); and all presence checks print.

- [ ] **Step 6: Commit + merge the generator FIRST** (pause for user approval)

The deployed proxy config is the route source of truth, so it must match committed repo state — otherwise a later deploy from `main` (still core-only) would prune the app domains. Commit and merge **before** deploying.

```bash
npx biome check --write pollinations-myceli-proxy/scripts/gen-routes.mjs
git add pollinations-myceli-proxy/ .gitignore
git commit -m "proxy: generate app routes from apps.json as source of truth"
```

Open/merge the PR, then deploy from the merged state:

```bash
git checkout main && git pull
```

- [ ] **Step 7: Deploy the durable config from the committed state (reconcile no-op)**

All 14 app domains are already attached (Task 7), so this declares them in config and changes nothing — but now deployed state == `main`:

```bash
cd pollinations-myceli-proxy && npm run deploy:production:full
for app in catgpt chat gsoc slidepainter; do
    echo "$app -> $(curl -s -o /dev/null -w '%{http_code}' "https://$app.pollinations.ai")"
done
for app in kpi economics; do
    echo "$app -> $(curl -s -o /dev/null -w '%{http_code}' "https://$app.pollinations.ai")"
done
```

Expected: all `200`. From now on, `deploy:production:full` regenerates from `apps.json` plus explicit ops routes, is complete, and matches the repo.

---

## Task 9: Post-migration cleanup (after ~1 day stable)

**Files:** none (operational).

- [ ] **Step 1: Confirm all apps healthy** — re-run Task 7 Step 3; all `200`.

- [ ] **Step 2: Delete the old-account `apps-*` Pages projects**

```bash
OLD_TOKEN=$(grep ^CLOUDFLARE_API_TOKEN_OLD apps/.env | cut -d= -f2-)
for app in react catgpt ai-dungeon-master sirius-cybernetics-elevator-challenge \
  map-to-isometric product-packaging-designer virtual-makeup \
  opposite-prompt-generator chat model-monitor changelog-generator \
  gsoc openclaw slidepainter; do
    curl -s -X DELETE \
      "https://api.cloudflare.com/client/v4/accounts/efdcb0933eaac64f27c0b295039b28f2/pages/projects/apps-$app" \
      -H "Authorization: Bearer $OLD_TOKEN" | head -c 100; echo " <- apps-$app"
done
```

Expected: each `"success": true`. (The proxy custom domains already own the public hostnames; deleting old Pages projects doesn't affect them.)

- [ ] **Step 3: Remove orphaned `<app>` CNAMEs in the pollinations.ai zone** that still point at `*.pages.dev` (the worker custom domain owns the record now). List CNAMEs, delete only stale `pages.dev` ones for app subdomains, leave everything else.

- [ ] **Step 4: (optional) Fix `.github/docs/DEPLOYMENT.md`** — it names `app-deploy.yml`/`production`; reality is `app-deploy-automatic.yml`/`main`, destination Myceli.

---

## Self-review notes

- **Findings addressed (round 1):** #1 deploy order → two-phase + origin gate (Tasks 3–4); #2 source of truth → generator + `deploy:production:full --config wrangler.generated.toml` (Task 8 + Source-of-truth section); #3 warn→throw → all CF helpers throw on unexpected failure (Task 3); #4 rollback CNAME → explicit CNAME recreate (Task 6 Step 3); #5 `$APP_NAME`→subdomain (Task 4 Step 1).
- **Findings addressed (round 2):** `deploy:production` remains core-only and the full generated deploy is explicit (`deploy:production:full`); commit/merge the generator **before** deploying it (Task 8 Steps 6–7, deployed state == repo); corrected route-count expectation to `24` incl. staging/dev and ops routes (Task 8 Step 5); rollback now list→patch-or-create→require-200 (Task 6 Step 3); generator uses `cfg.subdomain || key` to match deploy code.
- **Spec coverage:** generic forwarding ✓; reuse per-app deploy cross-account ✓; per-app cutover with reclaim ✓; naming `apps-<sub>` / Pages ✓; KPI/economics explicit ops routes ✓; rollback ✓; cleanup ✓; doc drift ✓.
- **Name consistency:** `runOrigin`/`runCutover`, `appContext`, `cf`, `hasCode`, helpers, and the `--phase=origin|cutover` contract match between `deploy-app.js` and `deploy.sh`. Generator marker string identical in `wrangler.toml` and `gen-routes.mjs`.
- **Credentials:** Myceli via `CLOUDFLARE_API_TOKEN_MYCELI` (falls back to `CLOUDFLARE_API_TOKEN`, set to Myceli in CI); old via `CLOUDFLARE_API_TOKEN_OLD`. Both secrets already exist; no new secret types, no new workflow.
- **Out of scope:** websim, app staging envs, app source changes.
