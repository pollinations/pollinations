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

export function fmtMoney(
    v: number | null | undefined,
    currency: string | null | undefined,
): string {
    if (v == null) return "-";
    const code = (currency || "").toUpperCase();
    if (code === "USD" || code === "EUR") {
        return v.toLocaleString("en-US", {
            style: "currency",
            currency: code,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }
    return `${v.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}${code ? ` ${code}` : ""}`;
}

export const sha8 = (sha: string): string => sha.slice(0, 8);

export const baseName = (path: string): string => path.split("/").pop() ?? path;

export function fmtPeriod(value: string | null | undefined): string {
    if (!value) return "-";
    const trimmed = value.trim();
    const match = trimmed.match(
        /^(\d{4}-\d{2})(?:-(\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?)?/,
    );
    if (!match) return trimmed;
    if (match[3]) return `${match[1]}-${match[2]} ${match[3]}`;
    if (match[2]) return `${match[1]}-${match[2]}`;
    return match[1];
}

/** Tinybird DateTime strings ("YYYY-MM-DD HH:MM:SS") are UTC. */
export function hoursSince(runAt: string, nowMs: number = Date.now()): number {
    const t = Date.parse(`${runAt.replace(" ", "T")}Z`);
    if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
    return (nowMs - t) / 3_600_000;
}
