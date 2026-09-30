import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const key = process.env.POLLINATIONS_API_KEY;
if (!key)
    throw new Error(
        "Set POLLINATIONS_API_KEY in the environment; never commit it.",
    );
const model = "community/ale-rls/jev-context-trimmer";
// Illustrative archives: the harness does not execute billing commands or fetch weather.
const outputs = [
    {
        id: "billing_test",
        content:
            "npm test billing\r\nFAIL test_charge: expected balance 12, got 11\ninvoice rounding: 1.5 rounded down to 1\n  retained whitespace  \n",
    },
    {
        id: "paris_forecast",
        content:
            "Paris forecast, 2026-09-30: rain, 17°C, wind 12 km/h.\nOutdoor picnic advice: bring a raincoat and use covered seating.\n",
    },
];
const cases = [
    {
        name: "billing",
        task: "Which billing test failed and what numeric mismatch did it report?",
        expected: ["billing_test"],
    },
    {
        name: "weather",
        task: "Describe the Paris forecast and suggest a precaution for an outdoor picnic.",
        expected: ["paris_forecast"],
    },
    {
        name: "unrelated",
        task: "Using the available evidence, identify the author and publication year of the novel The Left Hand of Darkness.",
        expected: [],
    },
];
const results = [];
await mkdir("live-results", { recursive: true });
for (const item of cases) {
    const request = {
        model,
        stream: false,
        store: false,
        // Distinct metadata avoids reusing a cached whole-agent response on repeated evidence runs.
        metadata: { evidence_run: `${Date.now()}-${item.name}` },
        input: JSON.stringify({ task: item.task, outputs }),
    };
    const response = await fetch("https://gen.pollinations.ai/v1/responses", {
        method: "POST",
        headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
        },
        body: JSON.stringify(request),
    });
    if (!response.ok)
        throw new Error(
            `${item.name}: HTTP ${response.status}; no retry performed.`,
        );
    const body = await response.json();
    const text = body.output
        ?.flatMap((entry) => entry.content ?? [])
        .filter((part) => part.type === "output_text")
        .map((part) => part.text)
        .join("\n");
    const result = JSON.parse(text);
    const record = {
        date: new Date().toISOString(),
        case: item.name,
        request,
        response: body,
        result,
    };
    await writeFile(
        `live-results/${item.name}.json`,
        `${JSON.stringify(record, null, 2)}\n`,
    );
    // Verify actual selection and preservation independently from the answer model's prose.
    assert.deepEqual(
        result.retained_outputs.map((output) => output.id),
        item.expected,
    );
    for (const output of result.retained_outputs)
        assert.deepEqual(
            output,
            outputs.find((original) => original.id === output.id),
        );
    results.push({
        case: item.name,
        decisions: result.decisions,
        context_characters: result.context_characters,
        usage: body.usage,
        jev: result.jev,
        answer_model: result.answer_model,
    });
    console.log(
        `${item.name}: kept ${item.expected.join(", ") || "none"}; removed ${result.context_characters.removed} characters`,
    );
}
await writeFile(
    "live-results/summary.json",
    `${JSON.stringify(results, null, 2)}\n`,
);
