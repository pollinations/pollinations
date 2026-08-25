import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    type EarningsResponse,
    earningsCommand,
} from "../src/commands/earnings.js";
import { setKeyOverride } from "../src/lib/config.js";
import { setOutputMode } from "../src/lib/output.js";

const apiPayload: EarningsResponse = {
    daily: [
        {
            date: "2026-08-24",
            entity_id: "app_1",
            entity_name: "My App",
            source: "byop_markup",
            requests: 10,
            paid_requests: 4,
            tier_requests: 6,
            baseline_price: 0.5,
            pollen_earned: 1.5,
            paid_earned: 0.9,
            tier_earned: 0.6,
            cost_usd: 2,
            reward_rate: 0.15,
        },
    ],
    perEntity: [
        {
            date: "",
            entity_id: "app_1",
            entity_name: "My App",
            source: "byop_markup",
            requests: 10,
            paid_requests: 4,
            tier_requests: 6,
            baseline_price: 0.5,
            pollen_earned: 1.5,
            paid_earned: 0.9,
            tier_earned: 0.6,
            cost_usd: 2,
            reward_rate: 0.15,
        },
    ],
};

describe("polli earnings end-to-end", () => {
    let stdout: string[];
    let stderr: string[];

    beforeEach(() => {
        stdout = [];
        stderr = [];
        vi.spyOn(process.stdout, "write").mockImplementation(((chunk) => {
            stdout.push(String(chunk));
            return true;
        }) as typeof process.stdout.write);
        vi.spyOn(process.stderr, "write").mockImplementation(((chunk) => {
            stderr.push(String(chunk));
            return true;
        }) as typeof process.stderr.write);
        setKeyOverride("test-key");
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("requests the right endpoint and renders totals + table", async () => {
        setOutputMode("human");
        const fetchMock = vi
            .fn()
            .mockResolvedValue(
                new Response(JSON.stringify(apiPayload), { status: 200 }),
            );
        vi.stubGlobal("fetch", fetchMock);

        await earningsCommand.parseAsync(["--days", "7"], { from: "user" });

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://gen.pollinations.ai/account/earnings?days=7");
        expect(init.headers).toMatchObject({
            Authorization: "Bearer test-key",
        });

        const output = stdout.join("") + stderr.join("");
        expect(output).toContain("1.5000 pollen earned");
        expect(output).toContain("My App");
        expect(output).toContain("byop_markup");
    });

    it("emits machine-readable totals in --json mode", async () => {
        setOutputMode("json");
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValue(
                    new Response(JSON.stringify(apiPayload), { status: 200 }),
                ),
        );

        await earningsCommand.parseAsync(["--days", "30"], { from: "user" });

        const payload = JSON.parse(stdout.join(""));
        expect(payload.days).toBe(30);
        expect(payload.totals).toEqual({
            requests: 10,
            paid_requests: 4,
            tier_requests: 6,
            pollen_earned: 1.5,
            cost_usd: 2,
        });
        expect(payload.perEntity).toHaveLength(1);
        expect(payload.perEntity[0].entity_name).toBe("My App");
    });

    it("prints a friendly note for an empty period", async () => {
        setOutputMode("human");
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ daily: [], perEntity: [] }), {
                    status: 200,
                }),
            ),
        );

        await earningsCommand.parseAsync(["--days", "90"], { from: "user" });

        expect(stderr.join("")).toContain("No earnings in the last 90 day(s)");
    });
});
