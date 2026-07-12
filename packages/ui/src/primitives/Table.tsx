import type { ComponentPropsWithoutRef, FC, ReactNode } from "react";
import { cn } from "../lib/cn.ts";

type Align = "left" | "center" | "right";
type RowIntent = "default" | "warning" | "danger";
type SortDirection = "asc" | "desc";

const alignClasses: Record<Align, string> = {
    left: "polli:text-left",
    center: "polli:text-center",
    right: "polli:text-right",
};

const rowIntentClasses: Record<RowIntent, string> = {
    default: "",
    warning: "polli:bg-intent-warning-bg-light/65",
    danger: "polli:bg-intent-danger-bg-light/65",
};

export type TableProps = ComponentPropsWithoutRef<"table">;

export const Table: FC<TableProps> = ({ className, ...rest }) => (
    <table
        {...rest}
        className={cn(
            "polli:w-full polli:border-collapse polli:text-sm",
            className,
        )}
    />
);

export type TableHeadProps = ComponentPropsWithoutRef<"thead">;

export const TableHead: FC<TableHeadProps> = ({ className, ...rest }) => (
    <thead
        {...rest}
        className={cn(
            "polli:bg-transparent polli:text-micro polli:text-theme-text-muted",
            className,
        )}
    />
);

export type TableBodyProps = ComponentPropsWithoutRef<"tbody">;

export const TableBody: FC<TableBodyProps> = ({ className, ...rest }) => (
    <tbody
        {...rest}
        className={cn("polli:divide-y polli:divide-theme-border/65", className)}
    />
);

export type TableRowProps = ComponentPropsWithoutRef<"tr"> & {
    intent?: RowIntent;
};

export const TableRow: FC<TableRowProps> = ({
    intent = "default",
    className,
    ...rest
}) => (
    <tr
        {...rest}
        className={cn(
            "polli:transition-colors polli:hover:bg-theme-bg-subtle",
            rowIntentClasses[intent],
            className,
        )}
    />
);

export type TableHeaderCellProps = Omit<
    ComponentPropsWithoutRef<"th">,
    "children"
> & {
    align?: Align;
    active?: boolean;
    sortDirection?: SortDirection;
    onSort?: () => void;
    children: ReactNode;
};

export const TableHeaderCell: FC<TableHeaderCellProps> = ({
    align = "left",
    active = false,
    sortDirection,
    onSort,
    className,
    children,
    ...rest
}) => {
    const content = (
        <>
            <span>{children}</span>
            {active && sortDirection && (
                <span aria-hidden="true">
                    {sortDirection === "asc" ? "^" : "v"}
                </span>
            )}
        </>
    );

    const classes = cn(
        "polli:px-3 polli:py-2 polli:font-bold polli:uppercase polli:tracking-wide",
        alignClasses[align],
        active && "polli:text-theme-text-strong",
        onSort &&
            "polli:cursor-pointer polli:select-none polli:hover:text-theme-text-strong",
        className,
    );

    if (!onSort) {
        return (
            <th {...rest} className={classes}>
                {content}
            </th>
        );
    }

    return (
        <th {...rest} className={classes}>
            <button
                type="button"
                onClick={onSort}
                className={cn(
                    "polli-control polli:inline-flex polli:w-full polli:items-center polli:gap-1 polli:bg-transparent polli:p-0 polli:font-bold polli:text-inherit",
                    align === "right" && "polli:justify-end",
                    align === "center" && "polli:justify-center",
                )}
            >
                {content}
            </button>
        </th>
    );
};

export type TableCellProps = ComponentPropsWithoutRef<"td"> & {
    align?: Align;
    numeric?: boolean;
    muted?: boolean;
};

export const TableCell: FC<TableCellProps> = ({
    align = "left",
    numeric = false,
    muted = false,
    className,
    ...rest
}) => (
    <td
        {...rest}
        className={cn(
            "polli:px-3 polli:py-2 polli:align-middle",
            alignClasses[align],
            numeric && "polli:tabular-nums",
            muted && "polli:text-theme-text-muted",
            className,
        )}
    />
);
