import { Text } from "@pollinations/ui";
import type { ReactNode } from "react";

type DataNoteProps = {
    pipe: string;
    rows: number;
    children: ReactNode;
};

export function DataNote({ pipe, rows, children }: DataNoteProps) {
    return (
        <Text size="sm" tone="soft" className="leading-relaxed">
            <span className="font-mono text-theme-text-strong">{pipe}</span>
            <span className="mx-1.5">·</span>
            <span>{rows} rows</span>
            <span className="mx-1.5">·</span>
            {children}
        </Text>
    );
}
