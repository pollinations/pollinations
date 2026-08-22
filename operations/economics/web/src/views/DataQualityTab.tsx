import { MonthlyLedgerAuditPanel } from "../components/MonthlyLedgerAuditPanel";
import { ProviderRegistryPanel } from "../components/ProviderRegistryPanel";
import type { MonthFilterValue, ValueFilter } from "../lib/months";
import type { Data } from "../types";

export function DataQualityTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: MonthFilterValue;
    vendor?: ValueFilter;
}) {
    return (
        <div className="flex flex-col gap-8">
            <MonthlyLedgerAuditPanel
                data={data}
                month={month}
                vendor={vendor}
            />
            <ProviderRegistryPanel data={data} month={month} vendor={vendor} />
        </div>
    );
}
