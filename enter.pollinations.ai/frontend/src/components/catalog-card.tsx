import { Surface } from "@pollinations/ui";
import type { FC, ReactNode } from "react";
import { CopyValue } from "./models/copy-value.tsx";

// Where a card goes from stacked to side by side: a short main part (a
// template's size) fits beside the price from half a screen; a description
// needs a wide screen. Side by side it is one grid: the logo and its bar, what
// it is (with the value to copy right under it), a 1.5rem gap and the price
// box share the first row, so the bar runs as tall as that row; the action
// follows under the price. Stacked, the logo and a short bar open the title
// line, and the rest starts at the card's edge. Full class names, so Tailwind
// finds them.
const SPLIT = {
    half: {
        card: "@lg:grid @lg:grid-cols-[auto_minmax(0,1fr)_1.5rem_var(--catalog-price-width)] @lg:gap-x-0",
        head: "@lg:contents",
        logo: "@lg:flex @lg:col-start-1 @lg:row-start-1 @lg:pr-2.5",
        bar: "@lg:h-auto @lg:min-h-10",
        text: "@lg:col-start-2 @lg:row-start-1 @lg:flex @lg:min-w-0 @lg:flex-col @lg:gap-1 @lg:self-start",
        price: "@lg:col-start-4 @lg:row-start-1 @lg:self-start",
        action: "@lg:col-start-4 @lg:row-start-2",
    },
    wide: {
        card: "@2xl:grid @2xl:grid-cols-[auto_minmax(0,1fr)_1.5rem_var(--catalog-price-width)] @2xl:gap-x-0",
        head: "@2xl:contents",
        logo: "@2xl:flex @2xl:col-start-1 @2xl:row-start-1 @2xl:pr-2.5",
        bar: "@2xl:h-auto @2xl:min-h-10",
        text: "@2xl:col-start-2 @2xl:row-start-1 @2xl:flex @2xl:min-w-0 @2xl:flex-col @2xl:gap-1 @2xl:self-start",
        price: "@2xl:col-start-4 @2xl:row-start-1 @2xl:self-start",
        action: "@2xl:col-start-4 @2xl:row-start-2",
    },
};

/**
 * One card of a catalog list (models, MCP servers, sandbox templates). On a
 * wide screen: the logo at the top left with a bar as tall as the price box,
 * what it is, the command or ID to copy (with its health) and a note (who
 * published it) under it; on the right, `--catalog-price-width` wide (set on
 * the list), the price box and the action. Stacked: the logo and the title on
 * one line, then what it is, the value to copy and the note, the price and the
 * action. The list needs `@container`.
 */
export const CatalogCard: FC<{
    /** Without one (a model with no brand logo), side by side the text keeps
     * its place; stacked the title starts at the edge. */
    logo: ReactNode;
    /** The title line: the name and its tags. */
    title: ReactNode;
    /** What it is, under the title line. */
    children?: ReactNode;
    price: ReactNode;
    copy?: { value: string; label: string };
    /** Beside the value to copy: whether it works right now. */
    status?: ReactNode;
    /** A quiet last line under the value to copy (who published it). */
    note?: ReactNode;
    action?: ReactNode;
    split?: keyof typeof SPLIT;
}> = ({
    logo,
    title,
    children,
    price,
    copy,
    status,
    note,
    action,
    split = "half",
}) => {
    const at = SPLIT[split];
    return (
        <Surface className={`flex flex-col gap-3 ${at.card}`}>
            {/* Stacked: a grid of the logo and the title, the rest across
                both columns. Side by side it dissolves into the card's grid. */}
            <div
                className={`order-1 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-2.5 ${at.head}`}
            >
                <div
                    className={`${logo ? "flex" : "hidden"} gap-2.5 ${at.logo}`}
                >
                    <span className="flex h-8 w-8 shrink-0 [&>*]:h-full [&>*]:w-full">
                        {logo}
                    </span>
                    {/* Stacked, as tall as the logo; side by side, down the
                        row, as tall as the price box. */}
                    <span
                        aria-hidden="true"
                        className={`h-8 w-px shrink-0 bg-divider ${logo ? "" : "invisible"} ${at.bar}`}
                    />
                </div>
                <div className={`contents ${at.text}`}>
                    <div className={`min-w-0 ${logo ? "" : "col-span-full"}`}>
                        {title}
                    </div>
                    <div className="col-span-full flex min-w-0 flex-col gap-1">
                        {children}
                        {/* How to call it: the value and a copy icon, no box;
                            long values end in "…" and still copy in full. */}
                        {copy && (
                            <div className="mt-2 flex min-w-0 items-center gap-2">
                                <div className="flex min-w-0">
                                    <CopyValue
                                        label={copy.label}
                                        value={copy.value}
                                        showCopyIcon
                                        bright
                                    />
                                </div>
                                {status}
                            </div>
                        )}
                        {note && <div className="min-w-0">{note}</div>}
                    </div>
                </div>
            </div>
            <div
                className={`order-2 min-w-0 rounded-lg border border-divider px-3 py-2 ${at.price}`}
            >
                {price}
            </div>
            {action && <div className={`order-4 ${at.action}`}>{action}</div>}
        </Surface>
    );
};
