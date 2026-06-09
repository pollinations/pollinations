import { describe, expect, it } from "vitest";
import {
    computeScore,
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
