import { Table } from "@pollinations/ui";
import type { ReactNode } from "react";

export function TableScroller({ children }: { children: ReactNode }) {
    return <div className="w-full max-w-full overflow-x-auto">{children}</div>;
}

export function DataTable({ children }: { children: ReactNode }) {
    return (
        <Table className="w-full min-w-max whitespace-nowrap">{children}</Table>
    );
}
