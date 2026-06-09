import { describe, expect, it } from "vitest";
import {
    computeScore,
    decideAction,
    detectClusters,
    isHardPaid,
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
    packPollenAllTime: 0,
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

    it("hard-skips when all-time pack pollen > 0", () => {
        expect(decideAction({ ...hammerer, packPollenAllTime: 0.5 }, 90)).toBe(
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
