import { describe, expect, it } from "vitest";
import {
    buildSubnetClusterQuery,
    buildUsageQuery,
    computeScore,
    decideAction,
    detectClusters,
    isHardPaid,
    REPORT_HEADER,
    type ScoredUser,
    toReportCsv,
    type UserSignals,
} from "../src/tier-progression/flows/abuse-scan-lib.ts";

const base: UserSignals = {
    id: "u1",
    email: "a@gmail.com",
    githubUsername: "alice",
    tier: "seed",
    createdAt: 1767387198,
    totalReqs: 10,
    failingReqs: 0,
    errorRate: 0,
    tierPollen: 0,
    packPollenWindow: 0,
    uniqIpHash: 1,
    topIpSubnet: "1.2.3.0",
    ipClusterSize: 1,
    hasCheckoutCredits: false,
    packBalance: 0,
    hasStripeCustomerId: false,
};

describe("computeScore", () => {
    it("scores a clean low-volume user 0", () => {
        expect(computeScore(base).score).toBe(0);
    });

    it("scores a high-volume 402 hammerer into the block band", () => {
        const u = {
            ...base,
            totalReqs: 994000,
            failingReqs: 993000,
            errorRate: 99,
            uniqIpHash: 40,
        };
        const { score, signals } = computeScore(u);
        expect(score).toBeGreaterThanOrEqual(70);
        expect(signals).toContain("fail>=100k");
        expect(signals).toContain("err>=95");
    });

    it("caps at 100", () => {
        const u = {
            ...base,
            failingReqs: 999999,
            errorRate: 100,
            uniqIpHash: 999,
            ipClusterSize: 999,
            clusterId: "x",
        };
        expect(computeScore(u).score).toBeLessThanOrEqual(100);
    });
});

describe("paid gate", () => {
    const hammerer: UserSignals = {
        ...base,
        failingReqs: 993000,
        errorRate: 99,
        uniqIpHash: 40,
    };

    it("hard-skips a paying user even with pack_pollen=0 in window (checkout credits)", () => {
        const u = { ...hammerer, hasCheckoutCredits: true };
        expect(isHardPaid(u)).toBe(true);
        expect(decideAction(u, computeScore(u).score)).toBe("skip");
    });

    it("hard-skips when pack_balance > 0", () => {
        expect(decideAction({ ...hammerer, packBalance: 2.5 }, 90)).toBe(
            "skip",
        );
    });

    it("hard-skips when pack pollen was burned in the window", () => {
        expect(decideAction({ ...hammerer, packPollenWindow: 0.5 }, 90)).toBe(
            "skip",
        );
    });

    it("caps a stripe_customer_id-only user at review (not block)", () => {
        expect(
            decideAction({ ...hammerer, hasStripeCustomerId: true }, 90),
        ).toBe("review");
    });

    it("blocks a never-paid hammerer", () => {
        expect(decideAction(hammerer, 90)).toBe("block");
    });

    it("returns ok below the review threshold", () => {
        expect(decideAction(base, 10)).toBe("ok");
    });
});

describe("detectClusters", () => {
    it("flags >=3 accounts sharing an email local-part root (numbered siblings)", () => {
        const users: UserSignals[] = [
            {
                ...base,
                id: "a",
                email: "numberphotos2@gmail.com",
                githubUsername: "Hashim898",
            },
            {
                ...base,
                id: "b",
                email: "numberphotos3@gmail.com",
                githubUsername: "Zulari3",
            },
            {
                ...base,
                id: "c",
                email: "numberphotos4@gmail.com",
                githubUsername: "Zulari2",
            },
            {
                ...base,
                id: "d",
                email: "alice@gmail.com",
                githubUsername: "alice",
            },
        ];
        detectClusters(users);
        expect(users[0].clusterId).toBe("root:numberphotos");
        expect(users[1].clusterId).toBe("root:numberphotos");
        expect(users[2].clusterId).toBe("root:numberphotos");
        expect(users[3].clusterId).toBeUndefined();
    });

    it("does not cluster a root shared by only 2 accounts", () => {
        const users: UserSignals[] = [
            { ...base, id: "a", email: "solo1@gmail.com" },
            { ...base, id: "b", email: "solo2@gmail.com" },
        ];
        detectClusters(users);
        expect(users[0].clusterId).toBeUndefined();
    });
});

describe("query builders", () => {
    it("usage query windows by days and excludes undefined users", () => {
        const q = buildUsageQuery(7);
        expect(q).toContain("INTERVAL 7 DAY");
        expect(q).toContain("selected_meter_slug = 'v1:meter:tier'");
        expect(q).toContain("uniq(ip_hash)");
        expect(q).toContain("topK(10)(ip_subnet)");
        expect(q).toContain("user_id NOT IN ('undefined', '')");
    });

    it("subnet cluster query uses uniq(user_id) and filters by subnet/window", () => {
        const q = buildSubnetClusterQuery(["1.2.3.0", "4.5.6.0"], 7);
        expect(q).toContain("uniq(user_id)");
        expect(q).toContain("ip_subnet IN ('1.2.3.0','4.5.6.0')");
        expect(q).toContain("ip_subnet NOT IN ('undefined', '')");
        expect(q).toContain("INTERVAL 7 DAY");
    });
});

describe("toReportCsv", () => {
    const scored: ScoredUser = {
        id: "u1",
        email: "a,b@gmail.com",
        githubUsername: "alice",
        tier: "seed",
        createdAt: 1767387198,
        totalReqs: 100,
        failingReqs: 99,
        errorRate: 99,
        tierPollen: 1.2,
        packPollenWindow: 0,
        uniqIpHash: 3,
        topIpSubnet: "1.2.3.0",
        ipClusterSize: 5,
        hasCheckoutCredits: false,
        packBalance: 0,
        hasStripeCustomerId: false,
        score: 80,
        signals: ["fail>=20k", "err>=95"],
        action: "block",
    };

    it("starts with the apply-compatible header columns", () => {
        const csv = toReportCsv([scored]);
        const header = csv.split("\n")[0];
        expect(header.startsWith(REPORT_HEADER)).toBe(true);
    });

    it("quotes fields with commas and keeps extra columns after the contract columns", () => {
        const csv = toReportCsv([scored]);
        const row = csv.split("\n")[1];
        expect(row).toContain('"a,b@gmail.com"');
        expect(row).toContain('"block"');
        expect(row).toContain('"fail>=20k; err>=95"');
        // extra columns appended (apply ignores them)
        expect(row.trim().endsWith("5")).toBe(true); // ip_cluster_size last
    });
});
