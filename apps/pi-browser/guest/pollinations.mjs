// Pi extension that runs inside the WASIX sandbox.
//
// It registers the "pollinations" provider and delegates request building,
// streaming and tool-call parsing to Pi's own OpenAI Chat Completions
// implementation, the pattern Pi documents for custom providers. Only `fetch`
// is replaced: the sandbox has no network, so each request is written to a
// mailbox folder and the page performs it with the visitor's key.
//
//   guest  <id>.req      { url, method, body }
//   page   <id>.head     { status, contentType }
//   page   <id>.0, .1 …  response body chunks, as they arrive
//   page   <id>.end      { chunks, error }

import { randomUUID } from "node:crypto";
import {
    existsSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { openAICompletionsApi } from "@earendil-works/pi-ai/compat";

const DIR = "/workspace/.pi/bridge";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function take(path) {
    if (!existsSync(path)) return null;
    const data = readFileSync(path);
    rmSync(path);
    return data;
}

async function bridgeFetch(url, init = {}) {
    const file = `${DIR}/${randomUUID()}`;
    writeFileSync(
        `${file}.tmp`,
        JSON.stringify({
            url: String(url),
            method: init.method ?? "GET",
            body: init.body ?? null,
        }),
    );
    renameSync(`${file}.tmp`, `${file}.req`);

    let head = take(`${file}.head`);
    while (!head) {
        if (init.signal?.aborted) throw init.signal.reason;
        await sleep(20);
        head = take(`${file}.head`);
    }
    const { status, contentType } = JSON.parse(head);

    let next = 0;
    let end = null;
    const body = new ReadableStream({
        async pull(controller) {
            for (;;) {
                const chunk = take(`${file}.${next}`);
                if (chunk) {
                    next++;
                    controller.enqueue(new Uint8Array(chunk));
                    return;
                }
                end ??= JSON.parse(take(`${file}.end`) ?? "null");
                if (end && next >= end.chunks) {
                    if (end.error) controller.error(new Error(end.error));
                    else controller.close();
                    return;
                }
                await sleep(20);
            }
        },
    });
    return new Response(body, {
        status,
        headers: { "content-type": contentType ?? "application/json" },
    });
}

export default function (pi) {
    const config = JSON.parse(
        readFileSync("/workspace/.pi/pollinations.json", "utf8"),
    );
    const completions = openAICompletionsApi();
    pi.registerProvider("pollinations", {
        ...config,
        api: "pollinations-bridge",
        streamSimple: (model, context, options) =>
            completions.streamSimple(
                { ...model, api: "openai-completions" },
                context,
                {
                    ...options,
                    fetch: bridgeFetch,
                },
            ),
    });
}
