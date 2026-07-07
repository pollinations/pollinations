import { useMemo } from "react";
import { EconTable, visibleEconRows } from "../components/EconTable";
import { economics, globalNetRatio } from "../lib/insights";
import type { Data } from "../types";

export function ModelsTab({
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
    const rows = useMemo(
        () => visibleEconRows(economics(data, month, "model"), vendor),
        [data, month, vendor],
    );

    return <EconTable netRatio={netRatio} rows={rows} showModel />;
}
