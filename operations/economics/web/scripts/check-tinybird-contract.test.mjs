import { expect, test } from "vitest";
import { FIXTURES } from "../src/fixtures";
import {
    checkTinybirdContract,
    REQUIRED_PIPES,
} from "./check-tinybird-contract.mjs";

const pipeName = (url) => new URL(url).pathname.split("/").at(-1).slice(0, -5);
const validResponse = (url) => Response.json({ data: FIXTURES[pipeName(url)] });

test("accepts populated responses matching the dashboard contracts", async () => {
    const requested = [];
    await checkTinybirdContract({
        api: "https://tinybird.test",
        token: "redacted",
        fetchImpl: async (url, options) => {
            requested.push({ url, options });
            return validResponse(url);
        },
    });

    expect(requested.map(({ url }) => url)).toEqual(
        REQUIRED_PIPES.map(
            (pipe) => `https://tinybird.test/v0/pipes/${pipe}.json`,
        ),
    );
    expect(
        requested.every(
            ({ options }) =>
                options.headers.Authorization === "Bearer redacted",
        ),
    ).toBe(true);
});

test("blocks deployment when a pipe is absent or malformed", async () => {
    await expect(
        checkTinybirdContract({
            api: "https://tinybird.test",
            token: "redacted",
            fetchImpl: async (url) => {
                if (url.includes("economics_pollen_usage_api")) {
                    return Response.json({ rows: [] });
                }
                return validResponse(url);
            },
        }),
    ).rejects.toThrow(/economics_pollen_usage_api: invalid shape/);
});

test.each(
    REQUIRED_PIPES,
)("rejects an empty required dataset: %s", async (pipe) => {
    await expect(
        checkTinybirdContract({
            api: "https://tinybird.test",
            token: "redacted",
            fetchImpl: async (url) =>
                pipeName(url) === pipe
                    ? Response.json({ data: [] })
                    : validResponse(url),
        }),
    ).rejects.toThrow(`${pipe}: no rows`);
});

test.each([
    ["economics_bank_ledger_api", "amount", "100", "amount: expected number"],
    [
        "economics_revenue_share_api",
        "github_username",
        null,
        "github_username: expected string",
    ],
    [
        "economics_revenue_share_api",
        "sources_json",
        '[{"type":"app"}]',
        "Revenue Share source 0 is invalid",
    ],
    ["economics_private_config_api", "config", "{}", "config: invalid shape"],
    [
        "economics_user_balances_api",
        "users",
        0,
        "expected one populated D1 snapshot row",
    ],
])("rejects incompatible %s.%s", async (pipe, field, value, message) => {
    await expect(
        checkTinybirdContract({
            api: "https://tinybird.test",
            token: "redacted",
            fetchImpl: async (url) =>
                pipeName(url) === pipe
                    ? Response.json({
                          data: FIXTURES[pipe].map((row) => ({
                              ...row,
                              [field]: value,
                          })),
                      })
                    : validResponse(url),
        }),
    ).rejects.toThrow(message);
});

test("reports all failing endpoints without reflecting provider response bodies", async () => {
    const requested = [];
    await expect(
        checkTinybirdContract({
            api: "https://tinybird.test",
            token: "redacted",
            fetchImpl: async (url) => {
                const pipe = pipeName(url);
                requested.push(pipe);
                if (pipe === REQUIRED_PIPES[0])
                    throw new Error("private upstream details");
                if (pipe === REQUIRED_PIPES[1])
                    return new Response("private upstream details", {
                        status: 404,
                    });
                if (pipe === REQUIRED_PIPES[2])
                    return new Response("private upstream details");
                return validResponse(url);
            },
        }),
    ).rejects.toThrow(
        /economics_bank_ledger_api: request failed; economics_compute_ledger_api: HTTP 404; economics_pollen_usage_api: invalid JSON/,
    );
    expect(requested).toEqual(REQUIRED_PIPES);
});

test("validates the configured staging Pollen snapshot using the same Pollen contract", async () => {
    const requested = [];
    await checkTinybirdContract({
        api: "https://tinybird.test",
        token: "redacted",
        pollenPipe: "economics_pollen_usage_snapshot_api",
        fetchImpl: async (url) => {
            requested.push(pipeName(url));
            return pipeName(url) === "economics_pollen_usage_snapshot_api"
                ? Response.json({ data: FIXTURES.economics_pollen_usage_api })
                : validResponse(url);
        },
    });
    expect(requested).toContain("economics_pollen_usage_snapshot_api");
    expect(requested).not.toContain("economics_pollen_usage_api");
});
