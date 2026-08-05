const MODEL_HEALTH_URL = "https://gen.pollinations.ai/v1/models/status";

export async function fetchModelStats(
    minutes = 60,
): Promise<Record<string, unknown>[]> {
    const url = `${MODEL_HEALTH_URL}?minutes=${minutes}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Model status API error: ${res.status}`);
    const { data } = (await res.json()) as { data: Record<string, unknown>[] };
    return data;
}
