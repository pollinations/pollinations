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
): Promise<void> {
    if (rows.length === 0) return;

    const res = await fetch(
        `/api/events?name=${encodeURIComponent(datasource)}`,
        {
            method: "POST",
            headers: {
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
