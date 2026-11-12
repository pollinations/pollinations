import { CopyField, Surface } from "@pollinations/ui";
import type { FC, ReactNode } from "react";

// Where a card goes from stacked to two columns: a short main part (a
// template's size) fits beside the price from half a screen; a description
// needs a wide screen. Side by side, the left column holds what it is, the
// command or ID to copy and the note, from the title's edge (logo 2rem, the
// gaps and the divider); the right column holds the price and the action.
// Stacked, the column wrappers dissolve and `order` sets the sequence.
// Full class names, so Tailwind finds them.
const SPLIT = {
    half: {
        card: "@lg:grid @lg:grid-cols-[minmax(0,1fr)_var(--catalog-price-width)] @lg:items-start @lg:gap-x-6",
        column: "@lg:flex @lg:min-w-0 @lg:flex-col @lg:gap-3",
        indent: "@lg:pl-[3.3125rem]",
        // One line on a wide screen; the full value shows on hover.
        oneLine: "@lg:[&>span:first-child]:truncate",
    },
    wide: {
        card: "@2xl:grid @2xl:grid-cols-[minmax(0,1fr)_var(--catalog-price-width)] @2xl:items-start @2xl:gap-x-6",
        column: "@2xl:flex @2xl:min-w-0 @2xl:flex-col @2xl:gap-3",
        indent: "@2xl:pl-[3.3125rem]",
        oneLine: "@2xl:[&>span:first-child]:truncate",
    },
};

/**
 * One card of a catalog list (models, MCP servers, sandbox templates). On a
 * wide screen: the logo and what it is, the command or ID to copy and a note
 * (who published it) on the left; the price box and the action on the right,
 * `--catalog-price-width` wide (set on the list). On phones: what it is, the
 * price, the copy box, the note, the action. The list needs `@container`.
 */
export const CatalogCard: FC<{
    /** Without one (a model with no brand logo), the text keeps its place. */
    logo: ReactNode;
    children: ReactNode;
    price: ReactNode;
    copy?: { value: string; label: string };
    /** Beside the copy box: whether what you copy works right now. */
    status?: ReactNode;
    /** A quiet line at the bottom left (who published it). */
    note?: ReactNode;
    action?: ReactNode;
    split?: keyof typeof SPLIT;
}> = ({
    logo,
    children,
    price,
    copy,
    status,
    note,
    action,
    split = "half",
}) => (
    <Surface className={`flex flex-col gap-3 ${SPLIT[split].card}`}>
        <div className={`contents ${SPLIT[split].column}`}>
            {/* The logo lines up with the title, however many lines follow. */}
            <div className="order-1 flex min-w-0 items-start gap-2.5">
                {logo ?? <span aria-hidden="true" className="w-8 shrink-0" />}
                <span
                    aria-hidden="true"
                    className={`h-10 w-px shrink-0 bg-divider ${logo ? "" : "invisible"}`}
                />
                <div className="min-w-0 flex-1">{children}</div>
            </div>
            {copy && (
                <div
                    className={`order-3 flex min-w-0 max-w-full items-center gap-2 ${SPLIT[split].indent}`}
                >
                    {/* Only as wide as the value needs, never past the column. */}
                    <div
                        className="w-fit min-w-0 max-w-full"
                        title={copy.value}
                    >
                        <CopyField
                            label={copy.label}
                            value={copy.value}
                            className={SPLIT[split].oneLine}
                        />
                    </div>
                    {status}
                </div>
            )}
            {note && (
                <div className={`order-4 min-w-0 ${SPLIT[split].indent}`}>
                    {note}
                </div>
            )}
        </div>
        <div className={`contents ${SPLIT[split].column}`}>
            {/* Bordered like the copy box, so the price reads as one
                object and its lines end inside it. */}
            <div className="order-2 min-w-0 rounded-lg border border-divider px-3 py-2">
                {price}
            </div>
            {action && <div className="order-5">{action}</div>}
        </div>
    </Surface>
);
