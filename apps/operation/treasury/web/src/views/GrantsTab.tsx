import {
    Chip,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useMemo } from "react";
import {
    DataTable,
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { allocateGrants, type GrantStatus } from "../lib/insights";
import type { Data, GrantRow } from "../types";

// Sentinel from the grants datasource: 1970-01-01 = no expiry.
const NO_EXPIRY = "1970-01-01";

// Grants have a start/expiry, not a month — the month filter does not apply.
export function visibleGrantRows({
    grantRows,
    vendor,
}: {
    grantRows: GrantRow[];
    vendor: string;
}) {
    return grantRows.filter((row) => vendor === "all" || row.vendor === vendor);
}

// Raw-tab status label: active = not expired and capacity remains. "used"
// and "expired" come from the same allocation the Credits lens runs — the
// only frontend join on this tab (grants × provider credit burn).
export function grantStatusLabel(
    status: GrantStatus | undefined,
): "active" | "used" | "expired" | "–" {
    if (!status) return "–";
    if (status.active) return "active";
    if (status.expires != null && status.finishedDate === status.expires) {
        return "expired";
    }
    return "used";
}

function StatusCell({ status }: { status: GrantStatus | undefined }) {
    const label = grantStatusLabel(status);
    if (label === "active") {
        return (
            <Chip data-theme="neutral" intent="neutral" size="sm">
                active
            </Chip>
        );
    }
    return <span className="text-theme-text-soft">{label}</span>;
}

export function GrantsTab({
    data,
    vendor = "all",
}: {
    data: Data;
    vendor?: string;
}) {
    const now = useMemo(() => new Date(), []);
    const statusByGrant = useMemo(() => {
        const { grants } = allocateGrants(data, now);
        return new Map(
            grants.map((grant) => [`${grant.vendor}|${grant.label}`, grant]),
        );
    }, [data, now]);
    const baseRows = useMemo(
        () => visibleGrantRows({ grantRows: data.grants, vendor }),
        [data.grants, vendor],
    );
    const sortColumns = useMemo<SortColumn<GrantRow>[]>(
        () => [
            { key: "vendor", value: (row) => row.vendor },
            { key: "label", value: (row) => row.label },
            { key: "granted", value: (row) => row.granted },
            { key: "currency", value: (row) => row.currency },
            { key: "start", value: (row) => row.start_date },
            {
                key: "expires",
                value: (row) => (row.expires === NO_EXPIRY ? "" : row.expires),
            },
            {
                key: "status",
                value: (row) =>
                    grantStatusLabel(
                        statusByGrant.get(`${row.vendor}|${row.label}`),
                    ),
            },
        ],
        [statusByGrant],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "vendor",
        direction: "asc",
    });
    return (
        <TableScroller>
            <DataTable>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell {...headerProps("vendor")}>
                            vendor
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("label")}>
                            label
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("granted")}>
                            granted
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("currency")}>
                            currency
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("start")}>
                            start
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("expires")}>
                            expires
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("status")}>
                            <HeaderHint hint="active = not expired and credit remains · used = capacity fully burned · expired = the window closed. Derived by allocating witnessed credit burn to each grant's active window (the Credits lens math).">
                                status
                            </HeaderHint>
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(
                        rows,
                        (row) => `${row.vendor}|${row.label}`,
                    ).map(({ key, row }) => (
                        <TableRow key={key}>
                            <TableCell>{row.vendor}</TableCell>
                            <TableCell>{row.label || "–"}</TableCell>
                            <TableCell>{row.granted}</TableCell>
                            <TableCell>{row.currency}</TableCell>
                            <TableCell>{row.start_date}</TableCell>
                            <TableCell>
                                {row.expires === NO_EXPIRY ? "–" : row.expires}
                            </TableCell>
                            <TableCell>
                                <StatusCell
                                    status={statusByGrant.get(
                                        `${row.vendor}|${row.label}`,
                                    )}
                                />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}
