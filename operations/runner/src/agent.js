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
    // What the agent read through its tools: the only URLs it may cite.
    const fetched = output
        .filter((item) => item.type === "function_call")
        .flatMap((item) => {
            try {
                const args = JSON.parse(item.arguments);
                return args.urls ?? [args.url];
            } catch {
                return [];
            }
        })
        .filter(Boolean);
    const text =
        body.output_text ??
        output
            .filter((item) => item.type === "message")
            .flatMap((item) => item.content ?? [])
            .map((part) => part.text ?? "")
            .join("");
    return { text, fetched, usage: body.usage };
}
