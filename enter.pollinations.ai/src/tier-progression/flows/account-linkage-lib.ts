// Pure logic for the account-linkage scan (multi-account cluster detection for
// bonus protection). NO node:* imports — must stay importable in the vitest
// Workers pool. All I/O lives in account-linkage-scan.ts.
//
// Linkage is the primary axis (email-root / exact-IP / IP+UA), clustered with
// union-find. Usage/error behaviour rides along as a corroborating signal so a
// human can weigh both how accounts are linked AND how they behave.

import { GIBBERISH_SUFFIXES, isoMinute } from "./abuse-scan-lib.ts";

// A single exact IP shared by more than this many accounts is treated as shared
// infra (office / VPN / CGNAT), NOT a farm — it forms no linkage edge.
export const IP_CAP = 15;

// A clustered member counts as "hammering" (usage corroboration) at this volume.
export const HAMMER_FAILING = 1000;
export const HAMMER_ERR = 80; // %

export const CONFIDENCE_BANDS = { high: 55, medium: 30 } as const;

export interface AccountRow {
    id: string;
    email: string;
    tier: string;
    githubUsername: string;
    createdAt: number; // unix seconds
    packBalance: number; // D1 user.pack_balance
    hasCheckout: boolean; // D1 stripe_checkout_credits row exists
    hasStripeCustomerId: boolean; // D1 user.stripe_customer_id not null
}

// A set of account ids that share one linkage key (an exact IP, or an IP+UA
// pair). Produced by SQL GROUP BY in the orchestrator so only shared keys ship.
export interface IdGroup {
    key: string;
    ids: string[];
}

// Per-account usage over the window (Tinybird), joined by id. Absent for dormant
// accounts — that absence is itself informative (dormant + clustered = farm-in-waiting).
export interface LinkUsage {
    failingReqs: number;
    errorRate: number; // 0..100
    tierPollen: number; // free pollen burned
    packPollen: number; // paid pollen burned (a payer signal)
}

export type LinkAction = "block" | "review" | "skip" | "ok";
export type Band = "high" | "medium" | "low";

export interface Cluster {
    clusterId: string;
    members: AccountRow[];
    linkTypes: string[]; // subset of ["email","ip","ipua"]
    confidence: number;
    band: Band;
    hasPayer: boolean;
    signals: string[]; // human-readable tags
}

export interface EmailKey {
    root: string;
    domain: string;
}

// Tighter throwaway/suspicious domains (abuse-detection skill). Deliberately
// excludes gmail/hotmail/outlook — too mainstream to be a signal on their own.
const DISPOSABLE_DOMAINS = new Set([
    "proton.me",
    "protonmail.com",
    "qq.com",
    "163.com",
    "mail.ru",
    "vk.com",
    "rambler.ru",
    "gmx.com",
    "gmx.de",
    "yandex.com",
    "yandex.ru",
    "mailinator.com",
    "guerrillamail.com",
    "10minutemail.com",
    "tempmail.com",
    "trashmail.com",
    "dispostable.com",
    "yopmail.com",
    "sharklasers.com",
    "anonaddy.com",
    "anondrop.net",
]);

// Email normalization (artifact handling — critical). Returns a linking key, or
// null if the address should NOT be used to link (numeric local, too-short root).
//   - lowercase, split local/domain
//   - strip +alias
//   - gmail/googlemail: strip dots, fold googlemail → gmail (same inbox)
//   - root = local with digits removed
//   - skip if the local is all-numeric (QQ/163) or root length < 5
export function normalizeEmail(email: string): EmailKey | null {
    const lower = (email ?? "").trim().toLowerCase();
    const at = lower.lastIndexOf("@");
    if (at <= 0) return null;
    let local = lower.slice(0, at);
    let domain = lower.slice(at + 1);
    if (!domain) return null;

    const plus = local.indexOf("+");
    if (plus >= 0) local = local.slice(0, plus);

    if (domain === "gmail.com" || domain === "googlemail.com") {
        local = local.replace(/\./g, "");
        domain = "gmail.com";
    }

    if (!local || /^\d+$/.test(local)) return null; // all-numeric local

    const root = local.replace(/\d+/g, "");
    if (root.length < 5) return null;

    return { root, domain };
}

function emailKeyString(email: string): string | null {
    const k = normalizeEmail(email);
    return k ? `${k.root}@${k.domain}` : null;
}

function isDisposableDomain(email: string): boolean {
    const at = (email ?? "").lastIndexOf("@");
    if (at < 0) return false;
    return DISPOSABLE_DOMAINS.has(email.slice(at + 1).toLowerCase());
}

// Auto-generated-looking username: a known bot-farm suffix, or letters directly
// followed by a trailing digit run (numbered siblings like Zulari2, Hashim898).
function isGibberishName(name: string): boolean {
    const n = (name ?? "").toLowerCase();
    if (!n) return false;
    if (GIBBERISH_SUFFIXES.some((s) => n.endsWith(s))) return true;
    return /[a-z]\d+$/.test(n);
}

// --- union-find -----------------------------------------------------------

function makeUnionFind() {
    const parent = new Map<string, string>();
    const find = (x: string): string => {
        let p = parent.get(x);
        if (p === undefined) {
            parent.set(x, x);
            return x;
        }
        if (p !== x) {
            p = find(p);
            parent.set(x, p);
        }
        return p;
    };
    const union = (a: string, b: string): void => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
    };
    return { find, union };
}

// Cluster accounts by linkage edges into connected components (singletons dropped).
// Each cluster records which linkage signal types contributed (email / ip / ipua).
export function clusterAccounts(
    accounts: AccountRow[],
    ipGroups: IdGroup[],
    ipUaGroups: IdGroup[],
    cap: number = IP_CAP,
): Cluster[] {
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const uf = makeUnionFind();
    for (const a of accounts) uf.find(a.id); // register every node

    const linkTypeById = new Map<string, Set<string>>();
    const addType = (id: string, t: string): void => {
        if (!byId.has(id)) return;
        const s = linkTypeById.get(id) ?? new Set<string>();
        s.add(t);
        linkTypeById.set(id, s);
    };

    // E1 — email root (root len >= 5, numeric locals already excluded).
    const emailGroups = new Map<string, string[]>();
    for (const a of accounts) {
        const key = emailKeyString(a.email);
        if (!key) continue;
        const g = emailGroups.get(key);
        if (g) g.push(a.id);
        else emailGroups.set(key, [a.id]);
    }
    for (const ids of emailGroups.values()) {
        if (ids.length < 2) continue;
        for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i]);
        for (const id of ids) addType(id, "email");
    }

    // E2 / E3 — exact IP and IP+UA. Cap guards against shared-infra explosion:
    // a key shared by > cap accounts is infra, not a farm, and forms no edge.
    const applyGroups = (groups: IdGroup[], type: string): void => {
        for (const g of groups) {
            const ids = g.ids.filter((id) => byId.has(id));
            if (ids.length < 2 || ids.length > cap) continue;
            for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i]);
            for (const id of ids) addType(id, type);
        }
    };
    applyGroups(ipGroups, "ip");
    applyGroups(ipUaGroups, "ipua");

    const comps = new Map<string, AccountRow[]>();
    for (const a of accounts) {
        const root = uf.find(a.id);
        const arr = comps.get(root) ?? [];
        arr.push(a);
        comps.set(root, arr);
    }

    const clusters: Cluster[] = [];
    for (const members of comps.values()) {
        if (members.length < 2) continue; // drop singletons
        const linkTypes = new Set<string>();
        for (const m of members)
            for (const t of linkTypeById.get(m.id) ?? []) linkTypes.add(t);
        // Deterministic id = smallest member id (stable across runs/diffs).
        const clusterId = `lk:${members
            .map((m) => m.id)
            .sort()[0]
            .slice(0, 16)}`;
        clusters.push({
            clusterId,
            members,
            linkTypes: [...linkTypes].sort(),
            confidence: 0,
            band: "low",
            hasPayer: false,
            signals: [],
        });
    }
    return clusters;
}

// A member counts as a payer from D1 purchase history, a live pack balance, or
// paid pollen burned in the usage window. Shared by scoring and member actions.
export function isPayerMember(
    m: AccountRow,
    usageByUser: Map<string, LinkUsage>,
): boolean {
    return (
        m.hasCheckout ||
        m.packBalance > 0 ||
        (usageByUser.get(m.id)?.packPollen ?? 0) > 0
    );
}

// Score a cluster 0..100. Linkage is the core (independent signals agreeing),
// then size / signup-burst / disposable-domain / gibberish-names, then usage
// behaviour as corroboration, then the paid gate. Returns a scored copy.
export function scoreCluster(
    c: Cluster,
    usageByUser: Map<string, LinkUsage>,
): Cluster {
    const signals: string[] = [];
    let score = 0;
    const size = c.members.length;
    const has = (t: string): boolean => c.linkTypes.includes(t);

    if (has("email")) {
        score += 30;
        signals.push("email-link");
    }
    if (has("ip")) {
        score += 25;
        signals.push("ip-link");
    }
    if (has("ipua")) {
        score += 30;
        signals.push("ipua-link");
    }
    if (c.linkTypes.length >= 2) {
        score += 15;
        signals.push("multi-signal");
    }

    const sizePts = Math.min(30, (size - 2) * 4);
    if (sizePts > 0) {
        score += sizePts;
        signals.push(`size=${size}`);
    }

    let burst24 = false;
    const times = c.members.map((m) => m.createdAt).filter((t) => t > 0);
    if (times.length >= 3) {
        const span = Math.max(...times) - Math.min(...times);
        if (span <= 86400) {
            score += 12;
            burst24 = true;
            signals.push("burst<=24h");
        } else if (span <= 7 * 86400) {
            score += 6;
            signals.push("burst<=7d");
        }
    }

    if (c.members.some((m) => isDisposableDomain(m.email))) {
        score += 8;
        signals.push("disposable-domain");
    }

    const gib = c.members.filter((m) =>
        isGibberishName(m.githubUsername),
    ).length;
    if (gib >= 2) {
        score += 6;
        signals.push(`gibberish-names=${gib}`);
    }

    // Usage / behaviour corroboration (important, but not the primary axis).
    let hammering = 0;
    let errSum = 0;
    let errN = 0;
    let tierBurn = 0;
    for (const m of c.members) {
        const u = usageByUser.get(m.id);
        if (!u) continue;
        if (u.failingReqs >= HAMMER_FAILING && u.errorRate >= HAMMER_ERR)
            hammering++;
        errSum += u.errorRate;
        errN++;
        tierBurn += u.tierPollen;
    }
    if (hammering >= 3) {
        score += 12;
        signals.push(`hammering=${hammering}`);
    } else if (hammering >= 1) {
        score += 8;
        signals.push(`hammering=${hammering}`);
    }
    if (errN > 0 && errSum / errN >= HAMMER_ERR) {
        score += 4;
        signals.push("high-err");
    }
    if (tierBurn >= 50) {
        score += 4;
        signals.push("free-burn");
    }

    const hasPayer = c.members.some((m) => isPayerMember(m, usageByUser));
    if (hasPayer) {
        signals.push("has-payer");
    } else {
        score += 5;
        signals.push("all-unpaid");
    }

    const confidence = Math.min(100, Math.round(score));
    let band: Band =
        confidence >= CONFIDENCE_BANDS.high
            ? "high"
            : confidence >= CONFIDENCE_BANDS.medium
              ? "medium"
              : "low";
    // Never recommend auto-blocking a cluster that contains a payer.
    if (hasPayer && band === "high") band = "medium";
    // Email-root linkage alone is collision-prone: gmail digit-stripping merges
    // real people who share a common name root (johnsmith1990 / johnsmith2024).
    // Require a second link type, hammering, or a 24h signup burst before "high".
    const emailOnly = c.linkTypes.length === 1 && c.linkTypes[0] === "email";
    if (band === "high" && emailOnly && hammering === 0 && !burst24) {
        band = "medium";
    }

    return { ...c, confidence, band, hasPayer, signals };
}

// Recommended action for one member of a cluster (apply-compatible). The payer
// member is always skipped, but its unpaid siblings still go to a human (review)
// — one small purchase must not shield a whole farm from bonus protection.
export function memberAction(c: Cluster, isPayer = false): LinkAction {
    if (isPayer) return "skip";
    if (c.hasPayer) return c.band === "low" ? "ok" : "review";
    if (c.band === "high") return "block";
    if (c.band === "medium") return "review";
    return "ok";
}

const csvCell = (s: string | number): string =>
    `"${String(s).replace(/"/g, '""')}"`;

// Apply-compatible columns first (id..registered), then usage + cluster context.
export const MEMBERS_HEADER =
    "id,action,score,email,github_username,signals,tier,registered";
const MEMBERS_EXTRA =
    "failing_reqs,error_rate,tier_pollen,pack_pollen,cluster_id,confidence,band,link_types";

export function toMembersCsv(
    clusters: Cluster[],
    usageByUser: Map<string, LinkUsage>,
): string {
    const ordered = [...clusters].sort((a, b) => b.confidence - a.confidence);
    const rows: string[] = [];
    for (const c of ordered) {
        for (const m of [...c.members].sort((a, b) =>
            a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
        )) {
            const action = memberAction(c, isPayerMember(m, usageByUser));
            const u = usageByUser.get(m.id);
            rows.push(
                [
                    csvCell(m.id),
                    csvCell(action),
                    c.confidence,
                    csvCell(m.email),
                    csvCell(m.githubUsername),
                    csvCell(c.signals.join("; ")),
                    csvCell(m.tier),
                    csvCell(isoMinute(m.createdAt)),
                    u?.failingReqs ?? 0,
                    u?.errorRate ?? 0,
                    u?.tierPollen ?? 0,
                    u?.packPollen ?? 0,
                    csvCell(c.clusterId),
                    c.confidence,
                    csvCell(c.band),
                    csvCell(c.linkTypes.join("|")),
                ].join(","),
            );
        }
    }
    return [`${MEMBERS_HEADER},${MEMBERS_EXTRA}`, ...rows].join("\n");
}

export const CLUSTERS_HEADER =
    "cluster_id,confidence,band,size,link_types,signals,tiers,domains,has_payer,member_ids";

export function toClustersCsv(clusters: Cluster[]): string {
    const ordered = [...clusters].sort((a, b) => b.confidence - a.confidence);
    const rows = ordered.map((c) => {
        const tiers = [...new Set(c.members.map((m) => m.tier))].sort();
        const domains = [
            ...new Set(
                c.members.map((m) => {
                    const at = m.email.lastIndexOf("@");
                    return at >= 0 ? m.email.slice(at + 1).toLowerCase() : "?";
                }),
            ),
        ].sort();
        return [
            csvCell(c.clusterId),
            c.confidence,
            csvCell(c.band),
            c.members.length,
            csvCell(c.linkTypes.join("|")),
            csvCell(c.signals.join("; ")),
            csvCell(tiers.join("|")),
            csvCell(domains.join("|")),
            c.hasPayer ? 1 : 0,
            csvCell(c.members.map((m) => m.id).join("|")),
        ].join(",");
    });
    return [CLUSTERS_HEADER, ...rows].join("\n");
}
