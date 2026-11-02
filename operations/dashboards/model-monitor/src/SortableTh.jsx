import { TableHeaderCell } from "@pollinations/ui";

/** A header cell that sorts its table; shared by every monitor table. */
export default function SortableTh({
    label,
    sortKey,
    currentSort,
    onSort,
    align = "left",
}) {
    const isActive = currentSort.key === sortKey;

    return (
        <TableHeaderCell
            align={align}
            active={isActive}
            sortDirection={
                isActive ? (currentSort.asc ? "asc" : "desc") : undefined
            }
            onSort={() => onSort(sortKey)}
        >
            {label}
        </TableHeaderCell>
    );
}
