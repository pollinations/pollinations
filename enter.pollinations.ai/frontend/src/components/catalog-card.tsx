import { CopyField, Surface } from "@pollinations/ui";
import type { FC, ReactNode } from "react";

// Where a card goes from stacked to two columns: a short main part (a
// template's size) fits beside the price from half a screen; a description
// needs a wide screen. Full class names, so Tailwind finds them.
const SPLIT = {
    half: {
        top: "@lg:grid-cols-[minmax(0,1fr)_var(--catalog-price-width)] @lg:items-center @lg:gap-x-6",
        bottom: "@lg:flex-row @lg:items-center @lg:gap-6",
        action: "@lg:ml-auto",
    },
    wide: {
        top: "@2xl:grid-cols-[minmax(0,1fr)_var(--catalog-price-width)] @2xl:items-center @2xl:gap-x-6",
        bottom: "@2xl:flex-row @2xl:items-center @2xl:gap-6",
        action: "@2xl:ml-auto",
    },
};

/**
 * One card of a catalog list (sandbox templates, MCP servers): the logo and
 * what it is beside the price, then the command or URL to copy and the
 * action. The price slot is `--catalog-price-width` wide (set on the list),
 * so on a wide screen the action's slot starts at the price's icons; in
 * between it sits flush right to leave the copy box room. Stacked on phones.
 * The list needs `@container`.
 */
export const CatalogCard: FC<{
    logo: ReactNode;
    children: ReactNode;
    price: ReactNode;
    copy?: { value: string; label: string };
    action?: ReactNode;
    split?: keyof typeof SPLIT;
}> = ({ logo, children, price, copy, action, split = "half" }) => (
    <Surface className="flex flex-col gap-3">
        <div className={`grid gap-3 ${SPLIT[split].top}`}>
            <div className="flex min-w-0 items-center gap-2.5">
                {logo}
                <span
                    aria-hidden="true"
                    className="h-10 w-px shrink-0 bg-divider"
                />
                <div className="min-w-0 flex-1">{children}</div>
            </div>
            <div className="min-w-0">{price}</div>
        </div>
        {(copy || action) && (
            <div
                className={`flex flex-col items-start gap-3 ${SPLIT[split].bottom}`}
            >
                {/* Only as wide as the command needs. */}
                {copy && (
                    <div className="w-fit min-w-0 max-w-full">
                        <CopyField label={copy.label} value={copy.value} />
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
