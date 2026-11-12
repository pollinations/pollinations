import { CopyField, Surface } from "@pollinations/ui";
import type { FC, ReactNode } from "react";

// Where a card goes from stacked to two columns: a short main part (a
// template's size) fits beside the price from half a screen; a description
// needs a wide screen. Side by side, the text starts at the price box's top,
// and the copy row starts at the title's edge (logo 2rem, the gaps and the
// divider) and lets the action wrap under it before the copy box breaks.
// Full class names, so Tailwind finds them.
const SPLIT = {
    half: {
        top: "@lg:grid-cols-[minmax(0,1fr)_var(--catalog-price-width)] @lg:items-start @lg:gap-x-6",
        bottom: "@lg:flex-row @lg:flex-wrap @lg:items-center @lg:gap-6 @lg:pl-[3.3125rem]",
        action: "@lg:ml-auto",
    },
    wide: {
        top: "@2xl:grid-cols-[minmax(0,1fr)_var(--catalog-price-width)] @2xl:items-start @2xl:gap-x-6",
        bottom: "@2xl:flex-row @2xl:flex-wrap @2xl:items-center @2xl:gap-6 @2xl:pl-[3.3125rem]",
        action: "@2xl:ml-auto",
    },
};

/**
 * One card of a catalog list (sandbox templates, MCP servers): the logo and
 * what it is beside the price, then the command or URL to copy and the
 * action. The price box is `--catalog-price-width` wide (set on the list),
 * so on a wide screen the action's slot starts at the box's edge; in
 * between it sits flush right to leave the copy box room. Stacked on phones.
 * The list needs `@container`.
 */
export const CatalogCard: FC<{
    /** Without one (a model with no brand logo), the text keeps its place. */
    logo: ReactNode;
    children: ReactNode;
    price: ReactNode;
    /** A quiet line under the price box (who published it). */
    priceNote?: ReactNode;
    copy?: { value: string; label: string };
    /** Beside the copy box: whether what you copy works right now. */
    status?: ReactNode;
    action?: ReactNode;
    split?: keyof typeof SPLIT;
}> = ({
    logo,
    children,
    price,
    priceNote,
    copy,
    status,
    action,
    split = "half",
}) => (
    <Surface className="flex flex-col gap-3">
        <div className={`grid gap-3 ${SPLIT[split].top}`}>
            {/* The logo lines up with the title, however many lines follow. */}
            <div className="flex min-w-0 items-start gap-2.5">
                {logo ?? <span aria-hidden="true" className="w-8 shrink-0" />}
                <span
                    aria-hidden="true"
                    className={`h-10 w-px shrink-0 bg-divider ${logo ? "" : "invisible"}`}
                />
                <div className="min-w-0 flex-1">{children}</div>
            </div>
            {/* Bordered like the copy box, so the price reads as one
                object and its lines end inside it. */}
            <div className="flex min-w-0 flex-col gap-2">
                <div className="min-w-0 rounded-lg border border-divider px-3 py-2">
                    {price}
                </div>
                {/* In from the box's edge, level with the icons inside. */}
                {priceNote && <div className="min-w-0 px-3">{priceNote}</div>}
            </div>
        </div>
        {(copy || action) && (
            <div
                className={`flex flex-col items-start gap-3 ${SPLIT[split].bottom}`}
            >
                {/* Only as wide as the command needs. */}
                {copy && (
                    <div className="flex min-w-0 max-w-full items-center gap-2">
                        <div className="w-fit min-w-0 max-w-full">
                            <CopyField label={copy.label} value={copy.value} />
                        </div>
                        {status}
                    </div>
                )}
                {action && (
                    <div
                        className={`shrink-0 ${SPLIT[split].action} @2xl:w-[var(--catalog-price-width)]`}
                    >
                        {action}
                    </div>
                )}
            </div>
        )}
    </Surface>
);
