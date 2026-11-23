// Run with a dedicated staging wallet/key (account:usage) and three billable image models:
// node staging-replay.js MODEL_1 MODEL_2 MODEL_3
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

const endpoint = new URL(
    "https://staging.gen.pollinations.ai/mcp/pollinations-code",
);
const models = process.argv.slice(2);
assert.ok(
    models.length === 3 && new Set(models).size === 3,
    "Pass three distinct canonical image model names",
);
assert.ok(
    process.env.POLLINATIONS_TOKEN,
    "Set POLLINATIONS_TOKEN to a staging key",
);
const headers = { authorization: `Bearer ${process.env.POLLINATIONS_TOKEN}` };
const runId = process.env.PROBE_ID || randomUUID();
const delay = Number(process.env.INTERRUPT_AFTER_MS || 4000);
assert.ok(
    Number.isSafeInteger(delay) && delay > 0,
    "INTERRUPT_AFTER_MS must be a positive integer",
);
const prompt = `A watercolor sunflower in a blue vase. Staging replay ${runId}`;
const code = `async () => {
    const models = ${JSON.stringify(models)};
    const available = await pollinations.listModels({type: 'image'});
    if (!models.every(name => available.some(model => model.name === name))) throw new Error('Selected model missing from the image catalog');
    return Promise.all(models.map(async model => {
        const image = await pollinations.generateImage({model, prompt: ${JSON.stringify(prompt)}, seed: 42});
        return {model, url: image.data[0].url};
    }));
}`;

const client = new Client({
    name: "pollinations-staging-replay",
    version: "1",
});
let disconnect;
const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: { headers },
    fetch: (input, init) => {
        if (!disconnect) return fetch(input, init);
        const signals = [disconnect.signal];
        if (init?.signal) signals.push(init.signal);
        return fetch(input, { ...init, signal: AbortSignal.any(signals) });
    },
});
async function images() {
    const result = await client.callTool(
        { name: "code", arguments: { code } },
        { timeout: 300000, signal: disconnect?.signal },
    );
    assert.ok(
        !result.isError,
        "Image-comparison script returned an MCP tool error",
    );
    const rows = JSON.parse(result.content[0].text);
    assert.deepEqual(
        rows.map((row) => row.model),
        models,
    );
    assert.equal(new Set(rows.map((row) => row.url)).size, 3);
    return rows;
}

async function account(path) {
    const response = await fetch(new URL(`/account/${path}`, endpoint), {
        headers,
        redirect: "error",
    });
    assert.ok(
        response.ok,
        `Account ${path.split("?")[0]} returned HTTP ${response.status}`,
    );
    return response.json();
}

const usagePath = "key/usage?days=1&limit=100";
async function wallet() {
    const { accountBalance } = await account("balance");
    assert.ok(
        Number.isFinite(accountBalance?.total),
        "The staging key needs account:usage to verify the wallet debit",
    );
    return accountBalance.total;
}

async function checkCharges(before, previousIds, since) {
    const deadline = Date.now() + 180_000;
    for (;;) {
        const [{ usage }, after] = await Promise.all([
            account(usagePath),
            wallet(),
        ]);
        const rows = usage.filter(
            (row) =>
                row.timestamp.replace("T", " ") >= since &&
                !previousIds.has(row.cursor_event_id),
        );
        assert.ok(
            rows.length <= 3,
            "Unexpected additional billed activity in the run window",
        );
        const unique = new Set(rows.map((row) => row.cursor_event_id));
        assert.equal(unique.size, rows.length, "Duplicate billed event IDs");
        assert.ok(
            rows.every(
                (row) =>
                    row.cursor_event_id &&
                    models.includes(row.model) &&
                    row.type === "generate.image" &&
                    row.cost_usd > 0,
            ),
            "Unexpected charge on the staging key",
        );
        if (rows.length === 3) {
            assert.equal(
                new Set(rows.map((row) => row.model)).size,
                3,
                "Expected one billed event per model",
            );
            const cost = rows.reduce((sum, row) => sum + row.cost_usd, 0);
            if (Math.abs(before - after - cost) < 1e-8)
                return rows
                    .map(
                        ({
                            model,
                            cost_usd,
                            cursor_event_id,
                            timestamp,
                            response_time_ms,
                        }) => ({
                            model,
                            costUsd: cost_usd,
                            eventId: cursor_event_id,
                            startedAt: timestamp,
                            durationMs: response_time_ms,
                        }),
                    )
                    .sort((a, b) => a.model.localeCompare(b.model));
        }
        assert.ok(
            Date.now() < deadline,
            "Timed out reconciling one billed event per model with the staging wallet debit. Check for concurrent wallet activity.",
        );
        await wait(3000);
    }
}

try {
    await client.connect(transport);
    assert.deepEqual(
        (await client.listTools()).tools.map((tool) => tool.name),
        ["code"],
    );
    const [{ usage }, before] = await Promise.all([
        account(usagePath),
        wallet(),
    ]);
    const previousIds = new Set(usage.map((row) => row.cursor_event_id));
    const startedAt = new Date().toISOString();
    const since = startedAt.slice(0, 19).replace("T", " ");
    console.log(
        JSON.stringify({ runId, models, startedAt, interruptAfterMs: delay }),
    );
    disconnect = new AbortController();
    const reason = new DOMException(
        "Staging replay disconnected",
        "AbortError",
    );
    const timer = setTimeout(() => disconnect.abort(reason), delay);
    try {
        await assert.rejects(
            images(),
            (error) =>
                disconnect.signal.aborted &&
                error.message.includes(reason.message),
        );
    } finally {
        clearTimeout(timer);
    }
    disconnect = undefined;
    const rejoinedAt = new Date();
    console.log(JSON.stringify({ runId, rejoinedAt }));
    const recovered = await images();
    const charges = await checkCharges(before, previousIds, since);
    // Tinybird reports start_time at second precision. The generation must
    // straddle the retry even at the edges of that one-second uncertainty.
    assert.ok(
        charges.some((event) => {
            const start = Date.parse(`${event.startedAt.replace(" ", "T")}Z`);
            return (
                start + 1000 <= rejoinedAt.getTime() &&
                start + event.durationMs >= rejoinedAt.getTime()
            );
        }),
        "No billed generation demonstrably spanned the interruption; adjust INTERRUPT_AFTER_MS for a fresh run",
    );
    const cached = await images();
    assert.deepEqual(cached, recovered);
    for (const { url } of cached) {
        const response = await fetch(url, { method: "HEAD" });
        assert.ok(
            response.ok &&
                response.headers.get("content-type")?.startsWith("image/"),
            `Image HEAD failed (${response.status})`,
        );
    }
    // Give replayed events time to reach the usage materialization before checking again.
    await wait(15_000);
    assert.deepEqual(await checkCharges(before, previousIds, since), charges);
    console.log(
        JSON.stringify({
            runId,
            completedAt: new Date().toISOString(),
            images: cached,
            charges,
        }),
    );
} catch (error) {
    // SDK errors can include the server's full response body. Log only the failure code.
    console.error(
        error instanceof assert.AssertionError
            ? error.message.replaceAll(
                  process.env.POLLINATIONS_TOKEN,
                  "[redacted]",
              )
            : `Staging replay failed (${error.code || error.name})`,
    );
    process.exitCode = 1;
} finally {
    await client.close();
}
