import { describe, expect, it } from "vitest";
import {
    type AccountRow,
    CLUSTERS_HEADER,
    type Cluster,
    clusterAccounts,
    type IdGroup,
    type LinkUsage,
    MEMBERS_HEADER,
    memberAction,
    normalizeEmail,
    scoreCluster,
    toClustersCsv,
    toMembersCsv,
} from "../src/tier-progression/flows/account-linkage-lib.ts";

const acct = (over: Partial<AccountRow> & { id: string }): AccountRow => ({
    email: `${over.id}@example.com`,
    tier: "seed",
    githubUsername: over.id,
    createdAt: 1767387198,
    packBalance: 0,
    hasCheckout: false,
    hasStripeCustomerId: false,
    ...over,
});

const noUsage = new Map<string, LinkUsage>();

describe("normalizeEmail", () => {
    it("strips gmail dots and folds googlemail to gmail (same inbox)", () => {
        const a = normalizeEmail("j.o.hn.smith@gmail.com");
        const b = normalizeEmail("John.Smith@googlemail.com");
        expect(a).toEqual({ root: "johnsmith", domain: "gmail.com" });
        expect(b).toEqual({ root: "johnsmith", domain: "gmail.com" });
    });

    it("strips +alias and trailing digits to a root", () => {
        expect(normalizeEmail("maciek.gawrysiuk+promo@gmail.com")).toEqual({
            root: "maciekgawrysiuk",
            domain: "gmail.com",
        });
        expect(normalizeEmail("numberphotos2@gmail.com")).toEqual({
            root: "numberphotos",
            domain: "gmail.com",
        });
    });

    it("rejects all-numeric locals (QQ/163) and too-short roots", () => {
        expect(normalizeEmail("123456@qq.com")).toBeNull();
        expect(normalizeEmail("a1@gmail.com")).toBeNull(); // root "a" < 5
        expect(normalizeEmail("john@x.com")).toBeNull(); // root "john" len 4
        expect(normalizeEmail("not an email")).toBeNull();
    });
});

describe("clusterAccounts", () => {
    it("clusters >=2 accounts sharing an email root (gmail dot/+ variants)", () => {
        const accounts = [
            acct({ id: "a", email: "monik.wilkas@gmail.com" }),
            acct({ id: "b", email: "monikwilkas+1@gmail.com" }),
            acct({ id: "c", email: "m.o.nikwilkas2@googlemail.com" }),
            acct({ id: "z", email: "someoneelse@gmail.com" }),
        ];
        const clusters = clusterAccounts(accounts, [], []);
        expect(clusters).toHaveLength(1);
        expect(clusters[0].members.map((m) => m.id).sort()).toEqual([
            "a",
            "b",
            "c",
        ]);
        expect(clusters[0].linkTypes).toEqual(["email"]);
    });

    it("links transitively across email and IP edges", () => {
        const accounts = [
            acct({ id: "a", email: "shareroot1@proton.me" }),
            acct({ id: "b", email: "shareroot2@proton.me" }),
            acct({ id: "c", email: "unrelated@outlook.com" }),
        ];
        // b and c share an exact IP → whole thing is one component
        const ipGroups: IdGroup[] = [{ key: "1.2.3.4", ids: ["b", "c"] }];
        const clusters = clusterAccounts(accounts, ipGroups, []);
        expect(clusters).toHaveLength(1);
        expect(clusters[0].members.map((m) => m.id).sort()).toEqual([
            "a",
            "b",
            "c",
        ]);
        expect(clusters[0].linkTypes).toEqual(["email", "ip"]);
    });

    it("does NOT cluster a shared-infra IP above the cap", () => {
        // Distinct letter-only roots (digits are stripped by the normalizer, so
        // numeric suffixes would collapse to one root) → only the IP could link.
        const accounts = Array.from({ length: 20 }, (_, i) =>
            acct({
                id: `u${i}`,
                email: `person${String.fromCharCode(97 + i)}root@outlook.com`,
            }),
        );
        const ipGroups: IdGroup[] = [
            { key: "9.9.9.9", ids: accounts.map((a) => a.id) },
        ];
        const clusters = clusterAccounts(accounts, ipGroups, [], 15);
        expect(clusters).toHaveLength(0);
    });

    it("ignores microbe/unknown ids inside an IP group", () => {
        const accounts = [acct({ id: "a" }), acct({ id: "b" })];
        // group references a third id not in the account set (e.g. a microbe)
        const ipGroups: IdGroup[] = [
            { key: "1.1.1.1", ids: ["a", "b", "ghost"] },
        ];
        const clusters = clusterAccounts(accounts, ipGroups, []);
        expect(clusters).toHaveLength(1);
        expect(clusters[0].members.map((m) => m.id).sort()).toEqual(["a", "b"]);
    });
});

describe("scoreCluster", () => {
    const mk = (over: Partial<Cluster>): Cluster => ({
        clusterId: "lk:test",
        members: [acct({ id: "a" }), acct({ id: "b" })],
        linkTypes: ["email"],
        confidence: 0,
        band: "low",
        hasPayer: false,
        signals: [],
        ...over,
    });

    it("scores a multi-signal cluster above a single-signal one of equal size", () => {
        const single = scoreCluster(mk({ linkTypes: ["email"] }), noUsage);
        const multi = scoreCluster(
            mk({ linkTypes: ["email", "ip", "ipua"] }),
            noUsage,
        );
        expect(multi.confidence).toBeGreaterThan(single.confidence);
        expect(multi.signals).toContain("multi-signal");
    });

    it("ranks a hammering cluster above an identical quiet cluster", () => {
        const members = [
            acct({ id: "a" }),
            acct({ id: "b" }),
            acct({ id: "c" }),
        ];
        const base = mk({ members, linkTypes: ["email"] });
        const quiet = scoreCluster(base, noUsage);
        const usage = new Map<string, LinkUsage>([
            [
                "a",
                {
                    failingReqs: 5000,
                    errorRate: 99,
                    tierPollen: 30,
                    packPollen: 0,
                },
            ],
            [
                "b",
                {
                    failingReqs: 9000,
                    errorRate: 97,
                    tierPollen: 40,
                    packPollen: 0,
                },
            ],
        ]);
        const loud = scoreCluster(base, usage);
        expect(loud.confidence).toBeGreaterThan(quiet.confidence);
        expect(loud.signals.some((s) => s.startsWith("hammering="))).toBe(true);
    });

    it("surfaces a big single-root farm as high band", () => {
        const members = Array.from({ length: 12 }, (_, i) =>
            acct({ id: `m${i}`, email: `iitdata${i}@gmail.com` }),
        );
        const c = scoreCluster(
            mk({ members, linkTypes: ["email", "ip"] }),
            noUsage,
        );
        expect(c.band).toBe("high");
    });

    it("caps a cluster with a payer at medium and skips its members", () => {
        const members = [
            acct({ id: "a", hasCheckout: true }),
            acct({ id: "b" }),
        ];
        const c = scoreCluster(
            mk({ members, linkTypes: ["email", "ip", "ipua"] }),
            noUsage,
        );
        expect(c.hasPayer).toBe(true);
        expect(c.band).not.toBe("high");
        expect(memberAction(c)).toBe("skip");
    });

    it("maps bands to apply actions", () => {
        expect(memberAction(mk({ band: "high" }))).toBe("block");
        expect(memberAction(mk({ band: "medium" }))).toBe("review");
        expect(memberAction(mk({ band: "low" }))).toBe("ok");
    });
});

describe("CSV output", () => {
    const clusters: Cluster[] = [
        scoreCluster(
            {
                clusterId: "lk:high",
                members: Array.from({ length: 6 }, (_, i) =>
                    acct({ id: `h${i}`, email: `farmroot${i}@gmail.com` }),
                ),
                linkTypes: ["email", "ip"],
                confidence: 0,
                band: "low",
                hasPayer: false,
                signals: [],
            },
            noUsage,
        ),
        scoreCluster(
            {
                clusterId: "lk:payer",
                members: [
                    acct({ id: "p0", hasCheckout: true }),
                    acct({ id: "p1" }),
                ],
                linkTypes: ["email", "ip", "ipua"],
                confidence: 0,
                band: "low",
                hasPayer: false,
                signals: [],
            },
            noUsage,
        ),
    ];

    it("members CSV starts with the apply-compatible header and appends usage", () => {
        const csv = toMembersCsv(clusters, noUsage);
        const header = csv.split("\n")[0];
        expect(header.startsWith(MEMBERS_HEADER)).toBe(true);
        expect(header).toContain("failing_reqs");
        expect(header).toContain("cluster_id");
    });

    it("emits block rows for high clusters and skip for payer clusters", () => {
        const csv = toMembersCsv(clusters, noUsage);
        expect(csv).toContain('"block"');
        expect(csv).toContain('"skip"');
    });

    it("clusters CSV lists members and pipe-joined link types", () => {
        const csv = toClustersCsv(clusters);
        expect(csv.split("\n")[0]).toBe(CLUSTERS_HEADER);
        expect(csv).toContain("email|ip|ipua");
        expect(csv).toContain("h0|h1|h2|h3|h4|h5");
    });
});
