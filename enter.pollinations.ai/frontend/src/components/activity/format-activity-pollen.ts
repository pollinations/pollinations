import { formatPollen } from "@pollinations/ui/wallet";

const TINY_POLLEN_THRESHOLD = 0.0001;

/** "$" after a leading comparison or minus: "<0.0001" → "<$0.0001", "-0.02" → "-$0.02". */
export function withDollar(amount: string): string {
    return amount.replace(/^([<>]?-?)/, "$1$$");
}

/** The same amount read aloud: "less than $0.0001", "-$0.02". */
export function spokenDollars(amount: string): string {
    return withDollar(amount)
        .replace(/^</, "less than ")
        .replace(/^>/, "more than ");
}
const MIN_PRECISE_POLLEN_LABEL = "0.000000000001";

function trimFixed(value: number, decimals: number): string {
    return value
        .toFixed(decimals)
        .replace(/(\.\d*?[1-9])0+$/, "$1")
        .replace(/\.0+$/, "");
}

function decimalsForActivityPollen(abs: number): number {
    if (abs >= 0.01) return 4;
    if (abs >= TINY_POLLEN_THRESHOLD) return 6;
    if (abs >= 0.000001) return 8;
    if (abs >= 0.00000001) return 10;
    return 12;
}

export function formatActivityPollen(value: number): string {
    if (!Number.isFinite(value) || value === 0) return "0";
    const abs = Math.abs(value);
    if (abs >= 1) return formatPollen(value);

    const formatted = trimFixed(value, decimalsForActivityPollen(abs));
    if (formatted === "0" || formatted === "-0") {
        return value > 0
            ? `<${MIN_PRECISE_POLLEN_LABEL}`
            : `>-${MIN_PRECISE_POLLEN_LABEL}`;
    }
    return formatted;
}

/** Amounts in tables: the shared 5-digit rule, with "<0.0001" for crumbs. */
export function formatActivityPollenThreshold(value: number): string {
    if (!Number.isFinite(value) || value === 0) return "0";
    if (Math.abs(value) < TINY_POLLEN_THRESHOLD) {
        return value > 0 ? "<0.0001" : ">-0.0001";
    }
    return formatPollen(value);
}
