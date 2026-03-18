import { describe, expect, it } from "vitest";
import {
    buildGlobalAbusePrompt,
    buildSuspiciousCohorts,
    type GlobalAbuseSession,
    type GlobalAbuseUser,
} from "../scripts/user-pipeline/scoring/global-abuse-score.ts";

describe("buildSuspiciousCohorts", () => {
    it("builds a cohort when users share strong overlapping signals", () => {
        const users: GlobalAbuseUser[] = [
            {
                id: "u1",
                email: "bot001@example.com",
                github_id: 1,
                github_username: "bot001",
                tier: "spore",
                created_at: 1_770_000_000,
                trust_score: 85,
            },
            {
                id: "u2",
                email: "bot002@example.com",
                github_id: 2,
                github_username: "bot002",
                tier: "seed",
                created_at: 1_770_000_200,
                trust_score: 82,
            },
        ];

        const sessions: GlobalAbuseSession[] = [
            {
                user_id: "u1",
                ip_address: "1.2.3.4",
                user_agent: "Mozilla/5.0 Example Browser 1",
                created_at: 1_770_100_000,
            },
            {
                user_id: "u2",
                ip_address: "1.2.3.4",
                user_agent: "Mozilla/5.0 Example Browser 1",
                created_at: 1_770_100_100,
            },
        ];

        const cohorts = buildSuspiciousCohorts(users, sessions);

        expect(cohorts).toHaveLength(1);
        expect(cohorts[0]?.members).toHaveLength(2);
        expect(cohorts[0]?.signal_summary).toEqual(
            expect.arrayContaining([
                "email_pattern:2",
                "github_pattern:2",
                "shared_ip:2",
            ]),
        );
    });

    it("does not build a cohort from a single weak signal alone", () => {
        const users: GlobalAbuseUser[] = [
            {
                id: "u1",
                email: "legit-one@example.com",
                github_id: 1,
                github_username: "legitone",
                tier: "spore",
                created_at: 1_770_000_000,
                trust_score: 90,
            },
            {
                id: "u2",
                email: "legit-two@example.com",
                github_id: 2,
                github_username: "legittwo",
                tier: "spore",
                created_at: 1_770_500_000,
                trust_score: 92,
            },
        ];

        const sessions: GlobalAbuseSession[] = [
            {
                user_id: "u1",
                ip_address: "9.9.9.9",
                user_agent: null,
                created_at: 1_770_100_000,
            },
            {
                user_id: "u2",
                ip_address: "9.9.9.9",
                user_agent: null,
                created_at: 1_770_100_100,
            },
        ];

        expect(buildSuspiciousCohorts(users, sessions)).toEqual([]);
    });
});

describe("buildGlobalAbusePrompt", () => {
    it("renders the expected email-keyed CSV prompt", () => {
        const users: GlobalAbuseUser[] = [
            {
                id: "u1",
                email: "bot001@example.com",
                github_id: 1,
                github_username: "bot001",
                tier: "spore",
                created_at: 1_770_000_000,
                trust_score: 85,
            },
            {
                id: "u2",
                email: "bot002@example.com",
                github_id: 2,
                github_username: "bot002",
                tier: "seed",
                created_at: 1_770_000_200,
                trust_score: 82,
            },
        ];
        const sessions: GlobalAbuseSession[] = [
            {
                user_id: "u1",
                ip_address: "1.2.3.4",
                user_agent: "Mozilla/5.0 Example Browser 1",
                created_at: 1_770_100_000,
            },
            {
                user_id: "u2",
                ip_address: "1.2.3.4",
                user_agent: "Mozilla/5.0 Example Browser 1",
                created_at: 1_770_100_100,
            },
        ];

        const [cohort] = buildSuspiciousCohorts(users, sessions);
        expect(cohort).toBeDefined();
        const prompt = buildGlobalAbusePrompt(
            cohort as NonNullable<typeof cohort>,
        );

        expect(prompt).toContain("email,score,signals");
        expect(prompt).toContain("bot001@example.com,bot001,spore");
        expect(prompt).toContain("shared_ip:2");
    });
});
