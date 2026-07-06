import type { StagedChange } from "./staging";

export const queuedMeterKey = (month: string, provider: string) =>
    `meter_monthly:${month}:${provider}`;

function stringValue(value: unknown) {
    return typeof value === "string" ? value : "";
}

export function queuedKeysForChange(change: StagedChange): string[] {
    const row = change.row;

    if (change.datasource === "meter_monthly") {
        const month = stringValue(row.month);
        const provider = stringValue(row.provider);
        return month && provider ? [queuedMeterKey(month, provider)] : [];
    }

    return [];
}
