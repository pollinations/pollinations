import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

const ID = "A1".repeat(16);

const usageRow = {
    timestamp: "2026-09-17 12:00:00",
    type: "generate.text",
    model: "openai",
    api_key: "polli-harness-dsh",
    api_key_id: ID,
    meter_source: "pack",
    cost_usd: 0.125,
    input_text_tokens: 10,
    input_cached_tokens: 20,
    input_audio_tokens: 3,
    input_image_tokens: 4,
    output_text_tokens: 5,
    output_reasoning_tokens: 6,
    output_audio_tokens: 7,
    output_image_tokens: 8,
};

/** Run the real CLI parser with a URL-routed fetch stub. */
const run = async (
    args: string[],
    router: (url: URL) => Response,
): Promise<{
    fetch: ReturnType<typeof vi.fn>;
    parse: Promise<unknown>;
    stdout: () => string;
    stderr: () => string;
}> => {
    vi.resetModules();
    vi.stubEnv("NO_UPDATE_NOTIFIER", "1");
    const fetch = vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(router(new URL(String(input)))),
    );
    vi.stubGlobal("fetch", fetch);
    const stdout = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);
    const stderr = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);
    const { program } = await import("./program.js");
    const parse = program.parseAsync(args, { from: "user" });
    return {
        fetch,
        parse,
        stdout: () =>
            stdout.mock.calls.map(([chunk]) => String(chunk)).join(""),
        stderr: () =>
            stderr.mock.calls.map(([chunk]) => String(chunk)).join(""),
    };
};

it("filters history by ID through the production parser without looking up keys", async () => {
    const { fetch, parse, stdout } = await run(
        [
            "--key",
            "sk_test_fixture",
            "usage",
            "--history",
            "--key",
            ID,
            "--json",
        ],
        (url) =>
            url.pathname === "/account/usage"
                ? Response.json({ usage: [usageRow], count: 1 })
                : Response.json(
                      { error: `unexpected ${url.pathname}` },
                      { status: 500 },
                  ),
    );
    await parse;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
        new URL(String(fetch.mock.calls[0][0])).searchParams.get("api_key_ids"),
    ).toBe(ID);
    const rows = JSON.parse(stdout()) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
        key: "polli-harness-dsh",
        tokens_in: 37,
        tokens_out: 26,
    });
});

it("resolves a key name through /account/keys and sends models, days and limit", async () => {
    const { fetch, parse, stdout } = await run(
        [
            "--key",
            "sk_test_fixture",
            "usage",
            "--history",
            "--key",
            "polli-harness-dsh",
            "--model",
            "openai",
            "--model",
            "flux",
            "--days",
            "7",
            "--json",
        ],
        (url) => {
            if (url.pathname === "/account/keys")
                return Response.json({
                    data: [{ id: ID, name: "polli-harness-dsh" }],
                });
            if (url.pathname === "/account/usage")
                return Response.json({ usage: [usageRow], count: 1 });
            return Response.json(
                { error: `unexpected ${url.pathname}` },
                { status: 500 },
            );
        },
    );
    await parse;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetch.mock.calls[0][0])).pathname).toBe(
        "/account/keys",
    );
    const usageUrl = new URL(String(fetch.mock.calls[1][0]));
    expect(usageUrl.searchParams.get("api_key_ids")).toBe(ID);
    expect(usageUrl.searchParams.get("models")).toBe("openai,flux");
    expect(usageUrl.searchParams.get("days")).toBe("7");
    expect(usageUrl.searchParams.get("limit")).toBe("20");
    const rows = JSON.parse(stdout()) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ model: "openai", tokens_in: 37 });
});

it("joins repeated key filters into a comma-separated api_key_ids", async () => {
    const secondId = "B2".repeat(16);
    const { fetch, parse } = await run(
        [
            "--key",
            "sk_test_fixture",
            "usage",
            "--history",
            "--key",
            "polli-harness-dsh",
            "--key",
            secondId,
            "--json",
        ],
        (url) => {
            if (url.pathname === "/account/keys")
                return Response.json({
                    data: [
                        { id: ID, name: "polli-harness-dsh" },
                        { id: secondId, name: "other" },
                    ],
                });
            if (url.pathname === "/account/usage")
                return Response.json({ usage: [], count: 0 });
            return Response.json(
                { error: `unexpected ${url.pathname}` },
                { status: 500 },
            );
        },
    );
    await parse;
    const usageUrl = new URL(String(fetch.mock.calls.at(-1)[0]));
    expect(usageUrl.searchParams.get("api_key_ids")).toBe(`${ID},${secondId}`);
});

it("keeps the root --key auth override separate from a usage --key filter", async () => {
    const { fetch, parse } = await run(
        ["--key", "sk_auth", "usage", "--history", "--key", ID, "--json"],
        (url) =>
            url.pathname === "/account/usage"
                ? Response.json({ usage: [usageRow], count: 1 })
                : Response.json(
                      { error: `unexpected ${url.pathname}` },
                      { status: 500 },
                  ),
    );
    await parse;
    expect(fetch).toHaveBeenCalledTimes(1);
    const [input, init] = fetch.mock.calls[0];
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe("Bearer sk_auth");
    expect(new URL(String(input)).searchParams.get("api_key_ids")).toBe(ID);
});

it("prints the raw CSV export verbatim for --history --csv", async () => {
    const csv =
        "timestamp,type,model,api_key,cost_usd\n2026-09-17 12:00:00,generate.text,openai,polli-harness-dsh,0.125\n";
    const { fetch, parse, stdout } = await run(
        [
            "--key",
            "sk_test_fixture",
            "usage",
            "--history",
            "--csv",
            "--days",
            "2",
            "--limit",
            "5",
        ],
        (url) =>
            url.pathname === "/account/usage"
                ? new Response(csv, {
                      status: 200,
                      headers: { "Content-Type": "text/csv" },
                  })
                : Response.json(
                      { error: `unexpected ${url.pathname}` },
                      { status: 500 },
                  ),
    );
    await parse;
    const usageUrl = new URL(String(fetch.mock.calls[0][0]));
    expect(usageUrl.searchParams.get("format")).toBe("csv");
    expect(usageUrl.searchParams.get("days")).toBe("2");
    expect(usageUrl.searchParams.get("limit")).toBe("5");
    expect(stdout()).toBe(csv);
});

it("filters daily rows client-side by --model without a models server param", async () => {
    const { fetch, parse, stdout } = await run(
        [
            "--key",
            "sk_test_fixture",
            "usage",
            "--daily",
            "--model",
            "flux",
            "--json",
        ],
        (url) =>
            url.pathname === "/account/usage/daily"
                ? Response.json({
                      usage: [
                          {
                              date: "2026-09-17",
                              api_key: "polli-harness-dsh",
                              model: "flux",
                              requests: 2,
                              cost_usd: 0.01,
                              meter_source: "pack",
                          },
                          {
                              date: "2026-09-17",
                              api_key: "polli-harness-dsh",
                              model: "openai",
                              requests: 1,
                              cost_usd: 0.02,
                              meter_source: "pack",
                          },
                      ],
                      count: 2,
                  })
                : Response.json(
                      { error: `unexpected ${url.pathname}` },
                      { status: 500 },
                  ),
    );
    await parse;
    const dailyUrl = new URL(String(fetch.mock.calls[0][0]));
    expect(dailyUrl.searchParams.has("models")).toBe(false);
    const rows = JSON.parse(stdout()) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ model: "flux", key: "polli-harness-dsh" });
});

it("rejects --daily --csv --model since the daily endpoint cannot filter server-side", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
        throw new Error("process.exit");
    }) as never);
    const { parse, stderr } = await run(
        [
            "--key",
            "sk_test_fixture",
            "usage",
            "--daily",
            "--csv",
            "--model",
            "flux",
        ],
        () => Response.json({ error: "unexpected" }, { status: 500 }),
    );
    await expect(parse).rejects.toThrow("process.exit");
    expect(exit).toHaveBeenCalledWith(1);
    expect(stderr()).toContain("does not support --model filtering");
});

it("rejects --days beyond the API maximum", async () => {
    vi.spyOn(process, "exit").mockImplementation((() => {
        throw new Error("process.exit");
    }) as never);
    const { parse, stderr } = await run(
        ["--key", "sk_test_fixture", "usage", "--history", "--days", "91"],
        () => Response.json({ error: "unexpected" }, { status: 500 }),
    );
    await expect(parse).rejects.toThrow("process.exit");
    expect(stderr()).toContain("--days must be 90 or less");
});

it("fails on an unknown key name with near matches instead of an empty table", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
        throw new Error("process.exit");
    }) as never);
    const { fetch, parse, stderr } = await run(
        [
            "--key",
            "sk_test_fixture",
            "usage",
            "--history",
            "--key",
            "polli-harness",
        ],
        (url) =>
            url.pathname === "/account/keys"
                ? Response.json({
                      data: [{ id: ID, name: "polli-harness-dsh" }],
                  })
                : Response.json(
                      { error: `unexpected ${url.pathname}` },
                      { status: 500 },
                  ),
    );
    await expect(parse).rejects.toThrow("process.exit");
    expect(exit).toHaveBeenCalledWith(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(stderr()).toContain('Unknown key name "polli-harness".');
    expect(stderr()).toContain("polli-harness-dsh");
});

it("still emits JSON for a trailing --json on keys list", async () => {
    const { parse, stdout } = await run(
        ["--key", "sk_test_fixture", "keys", "list", "--json"],
        (url) =>
            url.pathname === "/account/keys"
                ? Response.json({
                      data: [{ id: ID, name: "polli-harness-dsh" }],
                  })
                : Response.json(
                      { error: `unexpected ${url.pathname}` },
                      { status: 500 },
                  ),
    );
    await parse;
    const rows = JSON.parse(stdout()) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ id: ID, name: "polli-harness-dsh" });
});
