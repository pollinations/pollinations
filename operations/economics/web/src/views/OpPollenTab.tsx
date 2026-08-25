import {
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { Fragment, useMemo, useState } from "react";
import {
    DataTable,
    GROUP_BORDER,
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
} from "../components/DataTable";
import { fmtNumber } from "../lib/format";
import {
    type MonthFilterValue,
    matchesMonth,
    matchesValue,
    type ValueFilter,
    WINDOW_START,
} from "../lib/months";
import type { Data, OpPollenRow } from "../types";

function PayoutValue({ label, value }: { label: string; value: number }) {
    return (
        <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-theme-text-soft">
                {label}
            </dt>
            <dd className="text-sm text-theme-text-strong">
                {fmtNumber(value)}
            </dd>
        </div>
    );
}

export function OpPollenTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: MonthFilterValue;
    vendor?: ValueFilter;
}) {
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const baseRows = useMemo(
        () =>
            (data.opPollen ?? []).filter(
                (row) =>
                    row.month >= WINDOW_START &&
                    matchesMonth(row.month, month) &&
                    matchesValue(row.vendor, vendor),
            ),
        [data.opPollen, month, vendor],
    );
    const sortColumns = useMemo<SortColumn<OpPollenRow>[]>(
        () => [
            { key: "month", value: (row) => row.month },
            { key: "vendor", value: (row) => row.vendor },
            { key: "model", value: (row) => row.model },
            { key: "price_paid", value: (row) => row.price_paid },
            { key: "price_quests", value: (row) => row.price_quests },
            { key: "cost_paid", value: (row) => row.cost_paid },
            { key: "cost_quests", value: (row) => row.cost_quests },
            { key: "requests_paid", value: (row) => row.requests_paid },
            { key: "requests_quests", value: (row) => row.requests_quests },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "month",
        direction: "desc",
    });

    const toggle = (key: string) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    return (
        <TableScroller>
            <DataTable>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell rowSpan={2} {...headerProps("vendor")}>
                            Vendor
                        </TableHeaderCell>
                        <TableHeaderCell rowSpan={2} {...headerProps("model")}>
                            Model
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={2}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Pollen used
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={2}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Metered cost
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={2}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Requests
                        </TableHeaderCell>
                        <TableHeaderCell rowSpan={2}>Payouts</TableHeaderCell>
                    </TableRow>
                    <TableRow>
                        <TableHeaderCell
                            align="right"
                            className={GROUP_BORDER}
                            {...headerProps("price_paid")}
                        >
                            <HeaderHint hint="Pollen consumed from paid balances before ecosystem shares.">
                                Paid
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("price_quests")}
                        >
                            <HeaderHint hint="Pollen consumed from Quest balances. This is usage, never fiat revenue.">
                                Quest
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            className={GROUP_BORDER}
                            {...headerProps("cost_paid")}
                        >
                            Paid
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("cost_quests")}
                        >
                            Quest
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            className={GROUP_BORDER}
                            {...headerProps("requests_paid")}
                        >
                            Paid
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("requests_quests")}
                        >
                            Quest
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows.map((row) => {
                        const key = [
                            row.month,
                            row.vendor,
                            row.model,
                            row.currency,
                        ].join("|");
                        const isExpanded = expanded.has(key);
                        return (
                            <Fragment key={key}>
                                <TableRow>
                                    <TableCell>{row.vendor}</TableCell>
                                    <TableCell>{row.model}</TableCell>
                                    <TableCell
                                        align="right"
                                        className={GROUP_BORDER}
                                    >
                                        {fmtNumber(row.price_paid)}
                                    </TableCell>
                                    <TableCell align="right">
                                        {fmtNumber(row.price_quests)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={GROUP_BORDER}
                                    >
                                        {fmtNumber(row.cost_paid)}
                                    </TableCell>
                                    <TableCell align="right">
                                        {fmtNumber(row.cost_quests)}
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        className={GROUP_BORDER}
                                    >
                                        {fmtNumber(row.requests_paid)}
                                    </TableCell>
                                    <TableCell align="right">
                                        {fmtNumber(row.requests_quests)}
                                    </TableCell>
                                    <TableCell>
                                        <button
                                            type="button"
                                            onClick={() => toggle(key)}
                                            className="font-medium text-theme-text underline underline-offset-4 hover:text-theme-text-soft"
                                            aria-expanded={isExpanded}
                                        >
                                            {isExpanded ? "Hide" : "Show"}
                                        </button>
                                    </TableCell>
                                </TableRow>
                                {isExpanded ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={9}
                                            className="bg-theme-bg-active/40"
                                        >
                                            <dl className="grid gap-4 p-2 sm:grid-cols-3 lg:grid-cols-5">
                                                <PayoutValue
                                                    label="BYOP · Paid"
                                                    value={row.byop_paid}
                                                />
                                                <PayoutValue
                                                    label="BYOP · Quest"
                                                    value={row.byop_quests}
                                                />
                                                <PayoutValue
                                                    label="Model reward · Paid"
                                                    value={row.model_paid}
                                                />
                                                <PayoutValue
                                                    label="Model reward · Quest"
                                                    value={row.model_quests}
                                                />
                                                <div>
                                                    <dt className="text-xs font-medium uppercase tracking-wide text-theme-text-soft">
                                                        Currency
                                                    </dt>
                                                    <dd className="text-sm text-theme-text-strong">
                                                        {row.currency}
                                                    </dd>
                                                </div>
                                            </dl>
                                        </TableCell>
                                    </TableRow>
                                ) : null}
                            </Fragment>
                        );
                    })}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}
