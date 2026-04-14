const URL =
    "https://api.europe-west2.gcp.tinybird.co/v0/pipes/model_health_60m.json?token=p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8";

export async function fetchModelStats(): Promise<Record<string, unknown>[]> {
    const res = await fetch(URL, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Tinybird API error: ${res.status}`);
    const { data } = (await res.json()) as { data: Record<string, unknown>[] };
    return data;
}
