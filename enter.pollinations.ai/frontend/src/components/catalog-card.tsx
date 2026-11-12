import { CopyField, Surface } from "@pollinations/ui";
import type { FC, ReactNode } from "react";

// Where a card goes from stacked to two columns: a short main part (a
// template's size) fits beside the price from half a screen; a description
// needs a wide screen. Side by side, the left column holds what it is and the
// note, the right column the price box with the copy box under it and the
// action. Stacked, the column wrappers dissolve and `order` sets the sequence.
// Full class names, so Tailwind finds them.
const SPLIT = {
    half: {
        card: "@lg:grid @lg:grid-cols-[minmax(0,1fr)_var(--catalog-price-width)] @lg:items-start @lg:gap-x-6",
        column: "@lg:flex @lg:min-w-0 @lg:flex-col @lg:gap-3",
        // The left column runs the card's height; the note sits at its
        // bottom, level with the copy box (h-10).
        stretch: "@lg:self-stretch",
        bottom: "@lg:mt-auto @lg:flex @lg:min-h-10 @lg:items-center",
        // One line beside the description; the full value shows on hover.
        oneLine: "@lg:[&>span:first-child]:truncate",
    },
    wide: {
        card: "@2xl:grid @2xl:grid-cols-[minmax(0,1fr)_var(--catalog-price-width)] @2xl:items-start @2xl:gap-x-6",
        column: "@2xl:flex @2xl:min-w-0 @2xl:flex-col @2xl:gap-3",
        stretch: "@2xl:self-stretch",
        bottom: "@2xl:mt-auto @2xl:flex @2xl:min-h-10 @2xl:items-center",
        oneLine: "@2xl:[&>span:first-child]:truncate",
    },
};

/**
 * One card of a catalog list (models, MCP servers, sandbox templates). On a
 * wide screen: the logo and what it is, then a note (who published it) on the
 * left; on the right, `--catalog-price-width` wide (set on the list), the
 * price box, the command or ID to copy under it, and the action. On phones:
 * what it is, the price, the copy box, the action, the note. The list needs
 * `@container`.
 */
export const CatalogCard: FC<{
    /** Shown at the start of the title line, 1.75rem; none starts the title
     * at the edge. */
    logo: ReactNode;
    /** The title line: the name and its tags. */
    title: ReactNode;
    /** What it is, under the title line. */
    children?: ReactNode;
    price: ReactNode;
    copy?: { value: string; label: string };
    /** A quiet line at the bottom left (who published it). */
    note?: ReactNode;
    action?: ReactNode;
    split?: keyof typeof SPLIT;
}> = ({ logo, title, children, price, copy, note, action, split = "half" }) => (
    <Surface className={`flex flex-col gap-3 ${SPLIT[split].card}`}>
        <div
            className={`contents ${SPLIT[split].column} ${SPLIT[split].stretch}`}
        >
            {/* The logo opens the title line; the rest starts at the edge. */}
            <div className="order-1 flex min-w-0 flex-col gap-1">
                <div className="flex min-w-0 items-center gap-2">
                    {logo && (
                        <span className="flex h-7 w-7 shrink-0 [&>*]:h-full [&>*]:w-full">
                            {logo}
                        </span>
                    )}
                    <div className="min-w-0 flex-1">{title}</div>
                </div>
                {children}
            </div>
            {note && (
                <div className={`order-5 min-w-0 ${SPLIT[split].bottom}`}>
                    {note}
                </div>
            )}
        </div>
        <div className={`contents ${SPLIT[split].column}`}>
            {/* The price and how to call it, two boxes of one width. */}
            <div className="order-2 min-w-0 rounded-lg border border-divider px-3 py-2">
                {price}
            </div>
            {copy && (
                <div className="order-3 min-w-0" title={copy.value}>
                    <CopyField
                        label={copy.label}
                        value={copy.value}
                        className={SPLIT[split].oneLine}
                    />
                </div>
            )}
            {action && <div className="order-4">{action}</div>}
        </div>
    </Surface>
);
