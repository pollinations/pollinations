export const SCORE_THRESHOLDS = {
    block: 70,
    review: 40,
} as const;

export function parseScoreCsvResponse(
    content: string,
    keyToIndex: Map<string, number>,
    chunkLength: number,
    headerKeys: string[] = ["github"],
): Array<{ score: number; signals: string[] }> {
    const results: Array<{ score: number; signals: string[] } | null> =
        Array.from({ length: chunkLength }, () => null);

    for (const line of content.split("\n")) {
        if (
            !line.trim() ||
            headerKeys.some((headerKey) => line.startsWith(`${headerKey},`)) ||
            !line.includes(",")
        ) {
            continue;
        }

        const parts = line.split(",");
        if (parts.length < 2) continue;

        const key = parts[0]?.trim();
        const score = Number.parseInt(parts[1], 10);
        const reason = parts[2]?.trim() || "";
        const idx = key ? keyToIndex.get(key) : undefined;
        if (idx === undefined || Number.isNaN(score)) continue;

        results[idx] = {
            score: Math.min(100, Math.max(0, score)),
            signals:
                reason === "ok" || reason === ""
                    ? []
                    : reason.split("+").filter((signal) => signal.trim()),
        };
    }

    if (results.some((result) => result === null)) {
        throw new Error(
            "LLM response omitted one or more users from the chunk",
        );
    }

    return results as Array<{ score: number; signals: string[] }>;
}

export function parseLLMResponse(
    content: string,
    githubToIndex: Map<string, number>,
    chunkLength: number,
): Array<{ score: number; signals: string[] }> {
    return parseScoreCsvResponse(content, githubToIndex, chunkLength, [
        "github",
    ]);
}
