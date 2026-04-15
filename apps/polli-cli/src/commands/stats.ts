// Public read-only Tinybird token, scoped to the model_health_v2 pipe.
// Same token is embedded in enter.pollinations.ai/src/utils/model-stats.ts.
const TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8";

export async function fetchModelStats(
    minutes = 60,
): Promise<Record<string, unknown>[]> {
    const url = `https://api.europe-west2.gcp.tinybird.co/v0/pipes/model_health_v2.json?token=${TOKEN}&minutes=${minutes}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Tinybird API error: ${res.status}`);
    const { data } = (await res.json()) as { data: Record<string, unknown>[] };
    return data;
}
