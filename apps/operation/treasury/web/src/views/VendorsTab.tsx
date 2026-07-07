import { Text } from "@pollinations/ui";
import { useMemo } from "react";
import { EconTable, visibleEconRows } from "../components/EconTable";
import { economics, globalNetRatio } from "../lib/insights";
import type { Data } from "../types";

export function VendorsTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: string;
    vendor?: string;
}) {
    const netRatio = useMemo(
        () => globalNetRatio(data.revenueMonthly),
        [data.revenueMonthly],
    );
    const econRows = useMemo(
        () => visibleEconRows(economics(data, month, "vendor"), vendor),
        [data, month, vendor],
    );

    return (
        <div className="flex flex-col gap-2">
            <Text size="micro" tone="soft">
                vendor economics — the models table rolled up per vendor
            </Text>
            <EconTable netRatio={netRatio} rows={econRows} showFlags />
        </div>
    );
}
