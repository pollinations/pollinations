import { TB_HOST } from "../config";

type EventsResponse = {
    successful_rows?: number;
    quarantined_rows?: number;
};

export function buildNdjson(rows: object[]): string {
    return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

export async function appendRows(
    datasource: string,
    rows: object[],
    token: string,
): Promise<void> {
    if (rows.length === 0) return;

    const res = await fetch(
        `${TB_HOST}/v0/events?name=${encodeURIComponent(datasource)}`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/x-ndjson",
            },
            body: buildNdjson(rows),
        },
    );

    if (!res.ok) {
        throw new Error(`${datasource}: HTTP ${res.status}`);
    }

    const body = (await res.json()) as EventsResponse;
    if ((body.quarantined_rows ?? 0) > 0) {
        throw new Error(
            `${datasource}: ${body.quarantined_rows} quarantined rows`,
        );
    }
}
