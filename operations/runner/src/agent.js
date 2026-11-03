// Calls a hosted Pollinations agent. The route's rulebook goes in as the
// system message on every call, so the repo stays the one source of truth.
export async function askAgent({ model, rulebook, context, image, key }) {
    const res = await fetch("https://gen.pollinations.ai/v1/responses", {
        method: "POST",
        headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            model,
            input: [
                { role: "system", content: rulebook },
                {
                    role: "user",
                    content: [
                        { type: "input_text", text: JSON.stringify(context) },
                        ...(image
                            ? [{ type: "input_image", image_url: image }]
                            : []),
                    ],
                },
            ],
        }),
        signal: AbortSignal.timeout(240_000),
    });
    const body = await res.json();
    if (!res.ok)
        throw new Error(`agent -> ${res.status} ${body.error?.message ?? ""}`);
    const output = body.output ?? [];
    const text =
        body.output_text ??
        output
            .filter((item) => item.type === "message")
            .flatMap((item) => item.content ?? [])
            .map((part) => part.text ?? "")
            .join("");
    return { text, fetched: readUrls(output), usage: body.usage };
}

// The URLs the agent actually read: asked for in a fetch call AND listed as a
// page in that call's successful result. exa lists each page it read as a
// "# <title>" line followed by "URL: <url>"; an error result, a failed fetch or
// a URL that only shares a prefix counts for nothing.
const bare = (url) => url.replace(/\/$/, "");

function returnedPages(output) {
    const pages = new Set();
    for (const part of [output].flat()) {
        let result;
        try {
            result = JSON.parse(typeof part === "string" ? part : part?.text);
        } catch {
            continue;
        }
        if (result?.isError) continue;
        for (const { text } of result?.content ?? []) {
            const lines = String(text ?? "").split("\n");
            lines.forEach((line, i) => {
                const url = line.match(/^URL: (\S+)$/)?.[1];
                if (url && lines[i - 1]?.startsWith("# ")) pages.add(bare(url));
            });
        }
    }
    return pages;
}

export function readUrls(output) {
    const results = new Map(
        output
            .filter((item) => item.type === "function_call_output")
            .map((item) => [item.call_id, returnedPages(item.output)]),
    );
    return output
        .filter((item) => item.type === "function_call")
        .flatMap((item) => {
            const pages = results.get(item.call_id);
            if (!pages) return [];
            let args;
            try {
                args = JSON.parse(item.arguments);
            } catch {
                return [];
            }
            return [args.urls ?? args.url]
                .flat()
                .filter(
                    (url) => typeof url === "string" && pages.has(bare(url)),
                );
        });
}
