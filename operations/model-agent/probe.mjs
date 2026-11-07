#!/usr/bin/env node
// Calls one model through gen and checks everything its /models entry
// advertises: streaming, tools, JSON, reasoning, vision, caching and aliases
// for text; sizes, resolutions, edits and cache for images. Every billable
// response must report x-usage-* units. Prints a markdown table for the PR and
// exits 1 when a check fails. Every call is a real, paid generation; the
// default base is local gen.
//
//   POLLINATIONS_TOKEN_LOCAL=sk_... node operations/model-agent/probe.mjs <model> [--base http://localhost:8788]

import { parseArgs } from "node:util";
import { USAGE_TYPE_HEADERS } from "../../shared/registry/usage-headers.ts";

const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { base: { type: "string", default: "http://localhost:8788" } },
});
const [requested] = positionals;
const token = process.env.POLLINATIONS_TOKEN_LOCAL;
if (!requested || !token) {
    console.error(
        "Usage: POLLINATIONS_TOKEN_LOCAL=sk_... node probe.mjs <model> [--base <gen url>]",
    );
    process.exit(2);
}
const base = values.base.replace(/\/$/, "");
const auth = { authorization: `Bearer ${token}` };
// gen caches identical requests; a fresh nonce makes every first call real.
const nonce = `probe ${Date.now()}`;

const catalog = await (await fetch(`${base}/models`, { headers: auth })).json();
const entry = catalog.find(
    (m) => m.name === requested || m.aliases?.includes(requested),
);
if (!entry) {
    console.error(`${requested} is not in ${base}/models`);
    process.exit(2);
}
const model = entry.name;

const results = [];
const check = async (name, fn) => {
    const start = Date.now();
    try {
        const note = await fn();
        results.push({ name, status: note?.warn ? "warn" : "pass", note });
    } catch (error) {
        results.push({ name, status: "FAIL", note: error.message });
    }
    results.at(-1).ms = Date.now() - start;
};
const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};
const expectOk = async (res) => {
    if (!res.ok)
        throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
    return res;
};

// gen bills reasoning tokens at the completion text rate (registry convertUsage).
const rateFor = (type) =>
    entry.pricing[
        type === "completionReasoningTokens" ? "completionTextTokens" : type
    ];
const billed = (res) => {
    const usage = Object.entries(USAGE_TYPE_HEADERS)
        .map(([type, header]) => [type, Number(res.headers.get(header) ?? 0)])
        .filter(([, amount]) => amount > 0);
    assert(usage.length, "no x-usage-* headers");
    // /models leaves out zero rates; "Missing conversion rate" in gen.log is
    // the check for a real gap.
    const price = usage.reduce(
        (sum, [type, n]) => sum + n * Number(rateFor(type) ?? 0),
        0,
    );
    return `${usage.map(([type, n]) => `${type}=${n}`).join(" ")} → ${price.toPrecision(3)} pollen`;
};

const chat = (body, name = model) =>
    fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ model: name, ...body }),
    });
const ask = (content, extra = {}) => ({
    messages: [
        { role: "system", content: `You are a terse test probe (${nonce}).` },
        { role: "user", content },
    ],
    ...extra,
});
// The first choice of a non-streamed answer, plus its billing note.
const reply = async (res) => {
    const body = await (await expectOk(res)).json();
    return { ...body.choices[0], usage: body.usage, bill: billed(res) };
};
const sse = async (res) => {
    const data = (await (await expectOk(res)).text())
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6).trim());
    assert(data.at(-1) === "[DONE]", "stream did not end with [DONE]");
    return data.slice(0, -1).map((chunk) => JSON.parse(chunk));
};

const weatherTool = {
    type: "function",
    function: {
        name: "get_weather",
        description: "Current weather for a city",
        parameters: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
        },
    },
};
const askWeather = ask(
    "What is the weather in Paris? Use the get_weather tool.",
    {
        tools: [weatherTool],
    },
);
const toolArgs = (name, args) => {
    assert(name === "get_weather", `called ${name ?? "no tool"}`);
    assert(/paris/i.test(JSON.parse(args).city), `arguments ${args}`);
    return args;
};

// A 64×64 solid red PNG: the vision answer must name the colour.
const redPng =
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAS0lEQVR42u3PQQkAAAgAsetfWiP4FgYrsKZeS0BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEDgsqnc8OJg6Ln3AAAAAElFTkSuQmCC";

const probeText = async () => {
    await check("non-streaming", async () => {
        const {
            message: msg,
            finish_reason,
            bill,
        } = await reply(await chat(ask("Reply with the single word pong.")));
        assert(
            /pong/i.test(msg.content ?? ""),
            `answered ${JSON.stringify(msg.content)}`,
        );
        assert(finish_reason === "stop", `finish_reason ${finish_reason}`);
        return bill;
    });

    await check("streaming", async () => {
        const chunks = await sse(
            await chat(
                ask("Reply with the single word pong.", {
                    stream: true,
                    stream_options: { include_usage: true },
                }),
            ),
        );
        const text = chunks
            .map((c) => c.choices?.[0]?.delta?.content ?? "")
            .join("");
        const usage = chunks.findLast((c) => c.usage)?.usage;
        assert(/pong/i.test(text), `streamed ${JSON.stringify(text)}`);
        assert(
            usage?.prompt_tokens > 0 && usage?.completion_tokens > 0,
            "no terminal usage chunk",
        );
        return `${chunks.length} chunks, usage ${usage.prompt_tokens}+${usage.completion_tokens}`;
    });

    await check("max_tokens 16", async () => {
        const res = await chat(ask("Count from 1 to 200.", { max_tokens: 16 }));
        if (res.status >= 400) {
            const body = (await res.text()).slice(0, 300);
            assert(res.status < 500, `${res.status} ${body}`);
            return { warn: `${res.status} ${body}` };
        }
        const { finish_reason, usage, bill } = await reply(res);
        const note = `finish_reason ${finish_reason}, ${usage.completion_tokens} completion tokens; ${bill}`;
        return finish_reason === "length" && usage.completion_tokens <= 16
            ? note
            : { warn: `limit not applied: ${note}` };
    });

    if (entry.tools) {
        await check("tool call", async () => {
            const { message: msg, bill } = await reply(await chat(askWeather));
            const [call] = msg.tool_calls ?? [];
            return `${toolArgs(call?.function?.name, call?.function?.arguments)}; ${bill}`;
        });

        await check("streaming tool call", async () => {
            const chunks = await sse(
                await chat({ ...askWeather, stream: true }),
            );
            const deltas = chunks.flatMap(
                (c) => c.choices?.[0]?.delta?.tool_calls ?? [],
            );
            return toolArgs(
                deltas.find((d) => d.function?.name)?.function.name,
                deltas.map((d) => d.function?.arguments ?? "").join(""),
            );
        });
    }

    if (entry.supported_parameters?.includes("response_format")) {
        await check("JSON mode", async () => {
            const { message: msg, bill } = await reply(
                await chat(
                    ask(
                        'Return the JSON object {"ok": true} and nothing else.',
                        {
                            response_format: { type: "json_object" },
                        },
                    ),
                ),
            );
            assert(
                JSON.parse(msg.content).ok === true,
                `returned ${msg.content}`,
            );
            return `${msg.content}; ${bill}`;
        });
    }

    if (entry.reasoning) {
        await check("reasoning", async () => {
            const res = await expectOk(
                await chat(
                    ask(
                        "Which is larger, 9.11 or 9.9? Think, then answer with the number.",
                    ),
                ),
            );
            const tokens = Number(
                res.headers.get(USAGE_TYPE_HEADERS.completionReasoningTokens) ??
                    0,
            );
            const note = billed(res);
            return tokens > 0
                ? note
                : { warn: `no reasoning tokens reported; ${note}` };
        });
    }

    if (entry.input_modalities.includes("image")) {
        await check("image input", async () => {
            const { message: msg, bill } = await reply(
                await chat({
                    messages: [
                        {
                            role: "user",
                            content: [
                                {
                                    type: "text",
                                    text: `What colour fills this image? One word. (${nonce})`,
                                },
                                {
                                    type: "image_url",
                                    image_url: {
                                        url: `data:image/png;base64,${redPng}`,
                                    },
                                },
                            ],
                        },
                    ],
                }),
            );
            assert(
                /red/i.test(msg.content ?? ""),
                `answered ${JSON.stringify(msg.content)}`,
            );
            return bill;
        });
    }

    if (entry.pricing.promptCachedTokens) {
        await check("prompt cache", async () => {
            const prefix = `${nonce}\n${"Pollinations generates text, images, audio and video. ".repeat(400)}`;
            const cached = async (question) => {
                const res = await expectOk(
                    await chat({
                        messages: [
                            { role: "system", content: prefix },
                            { role: "user", content: question },
                        ],
                        max_tokens: 64,
                    }),
                );
                return [
                    Number(
                        res.headers.get(
                            USAGE_TYPE_HEADERS.promptCachedTokens,
                        ) ?? 0,
                    ),
                    res,
                ];
            };
            await cached("Say one.");
            const [tokens, res] = await cached("Say two.");
            const note = billed(res);
            return tokens > 0
                ? note
                : { warn: `second call reported no cached tokens; ${note}` };
        });
    }

    for (const alias of entry.aliases ?? []) {
        await check(`alias ${alias}`, async () => {
            const { bill } = await reply(
                await chat(
                    ask("Reply with the single word pong.", { max_tokens: 64 }),
                    alias,
                ),
            );
            return bill;
        });
    }
};

// Width and height from a PNG, JPEG or WebP header.
const dimensions = (b) => {
    if (b.readUInt32BE(0) === 0x89504e47)
        return [b.readUInt32BE(16), b.readUInt32BE(20)];
    if (b.toString("ascii", 8, 12) === "WEBP") {
        const kind = b.toString("ascii", 12, 16);
        if (kind === "VP8X")
            return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
        if (kind === "VP8L") {
            const bits = b.readUInt32LE(21);
            return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
        }
        return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
        for (let i = 2; i + 9 < b.length; i += 2 + b.readUInt16BE(i + 2)) {
            const marker = b[i + 1];
            if (
                marker >= 0xc0 &&
                marker <= 0xcf &&
                ![0xc4, 0xc8, 0xcc].includes(marker)
            )
                return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
        }
    }
    throw new Error(`not a PNG, JPEG or WebP (${b.length} bytes)`);
};

const probeImage = async () => {
    const prompt = `a red bicycle leaning on a white wall (${nonce})`;
    const image = async (params) => {
        const query = new URLSearchParams({ model, seed: "42", ...params });
        const res = await fetch(
            `${base}/image/${encodeURIComponent(prompt)}?${query}`,
            { headers: auth },
        );
        return [
            res,
            res.ok
                ? dimensions(Buffer.from(await res.clone().arrayBuffer()))
                : null,
        ];
    };
    const generated = async (params) => {
        const [res, size] = await image(params);
        await expectOk(res);
        return [`${size.join("×")}, ${billed(res)}`, size, res];
    };

    await check("default size", async () => (await generated({}))[0]);

    await check("cache hit on repeat", async () => {
        const [res] = await image({});
        assert(
            res.headers.get("x-cache") === "HIT",
            `x-cache ${res.headers.get("x-cache")}`,
        );
        return "HIT";
    });

    for (const [width, height] of [
        [1024, 1024],
        [1280, 720],
        [720, 1280],
    ]) {
        await check(`${width}×${height}`, async () => {
            // Models snap to the sizes they support; the orientation must survive.
            const [note, [w, h]] = await generated({ width, height });
            assert(
                Math.sign(w - h) === Math.sign(width - height),
                `returned ${w}×${h}`,
            );
            return w === width && h === height
                ? note
                : { warn: `snapped to ${note}` };
        });
    }

    // "2k" sets the long side to about 2048 pixels, "720p" the short side to 720.
    for (const resolution of entry.resolutions ?? []) {
        await check(`resolution ${resolution}`, async () => {
            const [note, [w, h]] = await generated({ resolution });
            const n = Number.parseInt(resolution, 10);
            const [side, target] = resolution.endsWith("k")
                ? [Math.max(w, h), n * 1024]
                : [Math.min(w, h), n];
            assert(
                Math.abs(side / target - 1) <= 0.2,
                `${resolution} returned ${w}×${h}`,
            );
            return note;
        });
    }

    // gen's resolution enum (gen.pollinations.ai/src/image/params.ts).
    const unsupported = [
        "4k",
        "1k",
        "2k",
        "360p",
        "480p",
        "720p",
        "768p",
        "1080p",
    ].find((r) => !entry.resolutions?.includes(r));
    if (unsupported) {
        await check("unsupported resolution is 4xx", async () => {
            const [res] = await image({ resolution: unsupported });
            assert(
                res.status >= 400 && res.status < 500,
                `${unsupported} returned ${res.status}`,
            );
            return `${unsupported} → ${res.status}`;
        });
    }

    if (entry.input_modalities.includes("image")) {
        await check(
            "edit with reference image",
            async () =>
                (
                    await generated({
                        image: "https://pollinations.ai/icon-512.png",
                    })
                )[0],
        );
    }
};

if (entry.output_modalities.includes("image")) await probeImage();
else if (entry.category === "text") await probeText();
else {
    console.error(
        `${model} is ${entry.category}; this probe covers text and image. Test it by hand with change-and-test-matrix.md.`,
    );
    process.exit(2);
}

console.log(`**Probe:** \`${model}\` via ${base}\n`);
console.log("| Check | Result | Time | Detail |\n| --- | --- | --- | --- |");
for (const { name, status, ms, note } of results) {
    const detail = String(note?.warn ?? note ?? "")
        .replaceAll("|", "\\|")
        .replaceAll("\n", " ");
    console.log(
        `| ${name} | ${status} | ${(ms / 1000).toFixed(1)}s | ${detail} |`,
    );
}
process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
