import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_tes...oped";
const EXPECTED_TOOLS = ["holidays_for_country", "holidays_for_year"];
const CURRENT_YEAR = new Date().getUTCFullYear();

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "holidays-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://holidays-mcp.pollinations.ai"),
        {
            fetch: localFetch,
            requestInit: {
                headers: { Authorization: `Bearer ${token}` },
            },
        },
    );
    await client.connect(transport);
    return client;
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://holidays-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://holidays-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="holidays-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://holidays-mcp.pollinations.ai/mcp"),
    );
    assert.equal(oldEndpoint.status, 404);
});

test("serves current and 2025 Streamable HTTP without sessions", async () => {
    const modern = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    assert.equal(modern.getProtocolEra(), "modern");
    const modernTools = (await modern.listTools()).tools;
    assert.deepEqual(
        modernTools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
    await modern.close();

    const legacy = await connectClient();
    assert.equal(legacy.getProtocolEra(), "legacy");
    assert.deepEqual(
        (await legacy.listTools()).tools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
    await legacy.close();
});

test("rejects JSON-RPC batches", async () => {
    const response = await worker.fetch(
        new Request("https://holidays-mcp.pollinations.ai", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify([
                { jsonrpc: "2.0", id: 1, method: "tools/list" },
            ]),
        }),
    );
    assert.equal(response.status, 400);
});

// Deliberately unsorted to prove the worker sorts by date.
const DE_2026 = [
    {
        date: "2026-10-03",
        localName: "Tag der Deutschen Einheit",
        name: "German Unity Day",
        countryCode: "DE",
        fixed: true,
        global: true,
        counties: null,
        launchYear: 1990,
        types: ["Public"],
    },
    {
        date: "2026-01-01",
        localName: "Neujahr",
        name: "New Year's Day",
        countryCode: "DE",
        fixed: true,
        global: true,
        counties: null,
        launchYear: 1967,
        types: ["Public"],
    },
];

test("holidays_for_year maps and sorts without forwarding caller credentials", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        const url = new URL(String(input));
        assert.equal(url.origin, "https://date.nager.at");
        assert.equal(url.pathname, "/api/v3/PublicHolidays/2026/DE");
        assert.equal(
            new Headers(init.headers).get("authorization"),
            null,
            "caller credentials must not reach Nager.Date",
        );
        assert.equal(
            new Headers(init.headers).get("accept"),
            "application/json",
        );
        return Response.json(DE_2026);
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "holidays_for_year",
        arguments: { country_code: "DE", year: 2026 },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.country_code, "DE");
    assert.equal(report.year, 2026);
    assert.equal(report.count, 2);
    assert.deepEqual(
        report.holidays.map(({ date }) => date),
        ["2026-01-01", "2026-10-03"],
    );
    assert.equal(report.holidays[0].name, "New Year's Day");
    assert.equal(report.holidays[0].local_name, "Neujahr");
    assert.equal(report.holidays[0].global, true);
    assert.equal(report.holidays[0].fixed, true);
    assert.deepEqual(report.holidays[0].types, ["Public"]);
});

test("holidays_for_year reports an empty upstream list as a tool error", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, "/api/v3/PublicHolidays/2026/IN");
        return Response.json([]);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "holidays_for_year",
        arguments: { country_code: "IN", year: 2026 },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /No holidays found for IN in 2026/);
});

test("holidays_for_country with an explicit year queries just that year", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        const url = new URL(String(input));
        assert.equal(url.origin, "https://date.nager.at");
        assert.equal(url.pathname, "/api/v3/PublicHolidays/2030/GB");
        assert.equal(
            new Headers(init.headers).get("authorization"),
            null,
            "caller credentials must not reach Nager.Date",
        );
        return Response.json([
            {
                date: "2030-01-01",
                localName: "New Year's Day",
                name: "New Year's Day",
                countryCode: "GB",
                fixed: true,
                global: true,
                counties: null,
                launchYear: null,
                types: ["Public"],
            },
        ]);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "holidays_for_country",
        arguments: { country_code: "GB", year: 2030 },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    const report = JSON.parse(result.content[0].text);
    assert.deepEqual(report.years, [2030]);
    assert.equal(report.count, 1);
    assert.equal(report.holidays[0].date, "2030-01-01");
});

test("holidays_for_country merges the current and next year and dedupes by date", async (t) => {
    const holiday = (date) => ({
        date,
        localName: "Neujahr",
        name: "New Year's Day",
        countryCode: "GB",
        fixed: true,
        global: true,
        counties: null,
        launchYear: null,
        types: ["Public"],
    });
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input) => {
        calls++;
        const url = new URL(String(input));
        if (url.pathname === `/api/v3/PublicHolidays/${CURRENT_YEAR}/GB`) {
            return Response.json([
                holiday(`${CURRENT_YEAR}-01-01`),
                holiday(`${CURRENT_YEAR}-12-25`),
            ]);
        }
        assert.equal(
            url.pathname,
            `/api/v3/PublicHolidays/${CURRENT_YEAR + 1}/GB`,
        );
        return Response.json([
            holiday(`${CURRENT_YEAR}-01-01`),
            holiday(`${CURRENT_YEAR + 1}-01-01`),
        ]);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "holidays_for_country",
        arguments: { country_code: "GB" },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 2);
    const report = JSON.parse(result.content[0].text);
    assert.deepEqual(report.years, [CURRENT_YEAR, CURRENT_YEAR + 1]);
    assert.equal(report.count, 3);
    assert.deepEqual(
        report.holidays.map(({ date }) => date),
        [
            `${CURRENT_YEAR}-01-01`,
            `${CURRENT_YEAR}-12-25`,
            `${CURRENT_YEAR + 1}-01-01`,
        ],
    );
});

test("maps API error bodies into tool errors", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json(
            {
                type: "https://tools.ietf.org/html/rfc9110#section-15.5.5",
                title: "Not Found",
                status: 404,
                detail: "Country code not found.",
            },
            { status: 404 },
        ),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "holidays_for_year",
        arguments: { country_code: "ZZ", year: 2026 },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Country code not found/);
});

test("network failures become tool errors, not crashes", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
        throw new TypeError("fetch failed");
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const [name, args] of [
        ["holidays_for_year", { country_code: "DE", year: 2026 }],
        ["holidays_for_country", { country_code: "GB" }],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true);
    }
});

test("rejects invalid arguments before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for invalid arguments");
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    for (const [name, args] of [
        ["holidays_for_year", {}],
        ["holidays_for_year", { country_code: "D", year: 2026 }],
        ["holidays_for_year", { country_code: "DEU", year: 2026 }],
        ["holidays_for_year", { country_code: "DE" }],
        ["holidays_for_year", { country_code: "DE", year: 1969 }],
        ["holidays_for_year", { country_code: "DE", year: 2101 }],
        ["holidays_for_year", { country_code: "DE", year: 2026.5 }],
        ["holidays_for_year", { country_code: "DE", year: "2026" }],
        ["holidays_for_country", {}],
        ["holidays_for_country", { country_code: "D" }],
        ["holidays_for_country", { country_code: "GB", year: 1969 }],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});
