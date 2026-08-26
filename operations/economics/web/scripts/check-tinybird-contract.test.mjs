import { expect, test } from "vitest";
import {
    checkTinybirdContract,
    REQUIRED_PIPES,
} from "./check-tinybird-contract.mjs";

test("accepts only when every required pipe returns a data array", async () => {
    const requested = [];
    await checkTinybirdContract({
        api: "https://tinybird.test",
        token: "redacted",
        fetchImpl: async (url, options) => {
            requested.push({ url, options });
            return Response.json({ data: [] });
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
                return Response.json({ data: [] });
            },
        }),
    ).rejects.toThrow(/economics_pollen_usage_api: invalid shape/);
});
