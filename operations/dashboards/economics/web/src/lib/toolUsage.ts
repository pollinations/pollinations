import { MCP_SERVERS } from "../../../../../../shared/registry/mcp";
import { SANDBOX_PROVIDERS } from "../../../../../../shared/registry/sandbox";
import type { Data, OpPollenRow } from "../types";
import { canonicalVendor } from "./tb";

// Gen records receipt-billed MCP calls under the server id and sandbox leases
// under "sandbox". Downstream MCP wrappers have no additional billed usage.
export function isToolUsage(row: Pick<OpPollenRow, "vendor" | "model">) {
    const vendor = canonicalVendor(row.vendor);
    return (
        (row.model === "sandbox" && Object.hasOwn(SANDBOX_PROVIDERS, vendor)) ||
        MCP_SERVERS.some(
            (server) =>
                server.billing === "usage_receipt" &&
                server.id === row.model &&
                server.provider === vendor,
        )
    );
}

export function toolUsageRows(data: Data, month: string) {
    return (data.opPollen ?? [])
        .filter((row) => row.month === month && isToolUsage(row))
        .map((row) => ({
            vendor: canonicalVendor(row.vendor),
            service:
                row.model === "sandbox"
                    ? "Sandboxes"
                    : (MCP_SERVERS.find((server) => server.id === row.model)
                          ?.name ?? row.model),
            paidPollenUsd: row.price_paid,
            questPollenUsd: row.price_quests,
            retainedPaidUsd: row.price_paid - row.byop_paid - row.model_paid,
            requests: row.requests_paid + row.requests_quests,
        }));
}
