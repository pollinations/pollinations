import { readJsonWithRetries } from "./retries.mjs";

function timestamp(value, rawUtc = false) {
    if (typeof value !== "string") throw new Error("Invalid billing timestamp");
    const text =
        rawUtc && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
            ? `${value.replace(" ", "T")}Z`
            : value;
    const match = text.match(
        /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/,
    );
    const parsed = Date.parse(text);
    if (
        !match ||
        !Number.isFinite(parsed) ||
        new Date(`${match[1]}Z`).toISOString().slice(0, 19) !== match[1]
    ) {
        throw new Error("Invalid billing timestamp");
    }
    return parsed;
}

export async function readBilledUsage(
    key,
    startedAt,
    endedAt = new Date().toISOString(),
    fetch = globalThis.fetch,
) {
    const now = Date.now(),
        start = timestamp(startedAt),
        end = timestamp(endedAt);
    if (
        typeof key !== "string" ||
        !key ||
        start > end ||
        end > now ||
        start < now - 7 * 86400000
    ) {
        throw new Error("Invalid billing window or credential");
    }
    // Usage timestamps have second precision; include both partial boundary seconds.
    const lower = Math.floor(start / 1000) * 1000;
    let before = Math.ceil(end / 1000) * 1000,
        beforeId;
    let pollen = 0,
        requests = 0;
    const seen = new Set();
    for (let page = 0; page < 20; page++) {
        const url = new URL("https://gen.pollinations.ai/account/key/usage");
        url.searchParams.set("limit", "1000");
        url.searchParams.set("days", "7");
        url.searchParams.set("before", new Date(before).toISOString());
        if (beforeId !== undefined)
            url.searchParams.set("before_event_id", beforeId);
        let data;
        try {
            data = await readJsonWithRetries(
                url,
                {
                    headers: { Authorization: `Bearer ${key}` },
                    signal: AbortSignal.timeout(30000),
                    redirect: "error",
                },
                fetch,
            );
        } catch {
            throw new Error("Billing usage request failed");
        }
        if (
            !Array.isArray(data?.usage) ||
            data.usage.length > 1000 ||
            data.count !== data.usage.length
        ) {
            throw new Error("Invalid billing usage response");
        }
        let previousTime = before,
            previousId = beforeId;
        for (const row of data.usage) {
            const time = timestamp(row?.timestamp, true),
                id = row?.cursor_event_id;
            if (
                typeof id !== "string" ||
                !id ||
                seen.has(id) ||
                typeof row.cost_usd !== "number" ||
                !Number.isFinite(row.cost_usd) ||
                row.cost_usd < 0 ||
                time > previousTime ||
                (time === previousTime &&
                    (previousId === undefined || id >= previousId))
            ) {
                throw new Error("Invalid billing usage row or cursor");
            }
            seen.add(id);
            previousTime = time;
            previousId = id;
            if (time >= lower) {
                pollen += row.cost_usd;
                requests++;
                if (!Number.isFinite(pollen))
                    throw new Error("Invalid billing usage total");
            }
        }
        if (data.usage.length < 1000 || previousTime < lower) {
            return {
                observedAt: new Date().toISOString(),
                through: new Date(end).toISOString(),
                requests,
                pollen,
            };
        }
        before = previousTime;
        beforeId = previousId;
    }
    throw new Error("Billing usage pagination limit reached");
}
