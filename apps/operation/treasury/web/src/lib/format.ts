export function fmtUsd(v: number | null | undefined): string {
    if (v == null) return "-";
    return v.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
    });
}

export function fmtUsd2(v: number | null | undefined): string {
    if (v == null) return "-";
    return v.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export const sha8 = (sha: string): string => sha.slice(0, 8);

export const baseName = (path: string): string => path.split("/").pop() ?? path;

/** Tinybird DateTime strings ("YYYY-MM-DD HH:MM:SS") are UTC. */
export function hoursSince(runAt: string, nowMs: number = Date.now()): number {
    const t = Date.parse(`${runAt.replace(" ", "T")}Z`);
    if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
    return (nowMs - t) / 3_600_000;
}
