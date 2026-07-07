import { Surface, Table, Tooltip } from "@pollinations/ui";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

type SortDirection = "asc" | "desc";
type SortValue = boolean | number | string | null | undefined;

export type SortColumn<Row> = {
    key: string;
    value: (row: Row) => SortValue;
};

type SortState = {
    key: string;
    direction: SortDirection;
};

export type InitialSort = SortState;

export function TableScroller({ children }: { children: ReactNode }) {
    return (
        <section className="w-full max-w-full">
            <Surface className="overflow-hidden p-0">
                <div className="overflow-x-auto">{children}</div>
            </Surface>
        </section>
    );
}

export function DataTable({ children }: { children: ReactNode }) {
    return <Table className="min-w-full">{children}</Table>;
}

// Column-header label with a how-is-this-computed hover. Only calculated
// columns get one — identity columns stay bare.
export function HeaderHint({
    children,
    hint,
}: {
    children: ReactNode;
    hint: string;
}) {
    return (
        <Tooltip
            triggerAs="span"
            content={<span className="block max-w-72">{hint}</span>}
        >
            <span className="underline decoration-dotted decoration-theme-border underline-offset-2">
                {children}
            </span>
        </Tooltip>
    );
}

function normalizeSortValue(value: SortValue) {
    if (value === "" || value == null) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    return value;
}

function compareSortValues(
    left: SortValue,
    right: SortValue,
    direction: SortDirection,
) {
    const a = normalizeSortValue(left);
    const b = normalizeSortValue(right);

    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    const multiplier = direction === "asc" ? 1 : -1;
    if (typeof a === "number" && typeof b === "number") {
        return (a - b) * multiplier;
    }

    return (
        String(a).localeCompare(String(b), undefined, {
            numeric: true,
            sensitivity: "base",
        }) * multiplier
    );
}

export function sortRows<Row>(
    rows: readonly Row[],
    column: SortColumn<Row>,
    direction: SortDirection,
) {
    return rows
        .map((row, index) => ({ index, row }))
        .sort((left, right) => {
            const compared = compareSortValues(
                column.value(left.row),
                column.value(right.row),
                direction,
            );

            return compared || left.index - right.index;
        })
        .map(({ row }) => row);
}

export function withUniqueRowKeys<Row>(
    rows: readonly Row[],
    keyForRow: (row: Row) => string,
) {
    const counts = new Map<string, number>();
    return rows.map((row) => {
        const baseKey = keyForRow(row);
        const count = counts.get(baseKey) ?? 0;
        counts.set(baseKey, count + 1);
        return {
            key: count === 0 ? baseKey : `${baseKey}#${count + 1}`,
            row,
        };
    });
}

export function useSortableRows<Row>(
    rows: readonly Row[],
    columns: readonly SortColumn<Row>[],
    initialSort: InitialSort | null = null,
) {
    const [sort, setSort] = useState<SortState | null>(initialSort);
    const columnByKey = useMemo(
        () => new Map(columns.map((column) => [column.key, column])),
        [columns],
    );
    const sortedRows = useMemo(() => {
        if (!sort) return rows;
        const column = columnByKey.get(sort.key);
        if (!column) return rows;
        return sortRows(rows, column, sort.direction);
    }, [columnByKey, rows, sort]);

    return {
        rows: sortedRows,
        headerProps(key: string) {
            const active = sort?.key === key;
            const sortDirection = active ? sort.direction : undefined;

            return {
                active,
                sortDirection,
                "aria-sort": active
                    ? sortDirection === "asc"
                        ? "ascending"
                        : "descending"
                    : "none",
                onSort: () =>
                    setSort((current) =>
                        current?.key === key
                            ? {
                                  key,
                                  direction:
                                      current.direction === "asc"
                                          ? "desc"
                                          : "asc",
                              }
                            : { key, direction: "asc" },
                    ),
            } as const;
        },
    };
}
