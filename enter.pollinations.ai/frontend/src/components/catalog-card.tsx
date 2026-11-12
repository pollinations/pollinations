import { CopyField, Surface } from "@pollinations/ui";
import type { FC, ReactNode } from "react";

// The logo and a short bar always open the title line; the rest starts at the
// card's edge. Stacked, the price follows the copy box; side by side, it sits
// on the right behind a vertical line, with the action under it. A short main
// part (a template's size) goes side by side from 32rem, a description from
// 38rem, where the title and its tags still fit beside the price (about
// 13rem). Full class names, so Tailwind finds them.
const SPLIT = {
    half: {
        card: "@lg:grid @lg:grid-cols-[minmax(0,1fr)_var(--catalog-price-width)] @lg:gap-x-6",
        head: "@lg:col-start-1 @lg:row-start-1 @lg:self-start",
        price: "@lg:col-start-2 @lg:row-start-1 @lg:self-start @lg:border-l @lg:border-divider @lg:pl-4",
        // One line beside the price; the full value still copies.
        oneLine: "@lg:[&>span:first-child]:truncate",
        action: "@lg:col-start-2 @lg:row-start-2 @lg:pl-4",
    },
    wide: {
        card: "@min-[38rem]:grid @min-[38rem]:grid-cols-[minmax(0,1fr)_var(--catalog-price-width)] @min-[38rem]:gap-x-6",
        head: "@min-[38rem]:col-start-1 @min-[38rem]:row-start-1 @min-[38rem]:self-start",
        price: "@min-[38rem]:col-start-2 @min-[38rem]:row-start-1 @min-[38rem]:self-start @min-[38rem]:border-l @min-[38rem]:border-divider @min-[38rem]:pl-4",
        oneLine: "@min-[38rem]:[&>span:first-child]:truncate",
        action: "@min-[38rem]:col-start-2 @min-[38rem]:row-start-2 @min-[38rem]:pl-4",
    },
};

/**
 * One card of a catalog list (models, MCP servers, sandbox templates): the
 * logo and the title, what it is and the command or ID to copy (with its
 * health); the price, `--catalog-price-width` wide (set on the list), beside
 * it or under it, and the action under the price. The list needs
 * `@container`.
 */
export const CatalogCard: FC<{
    /** Without one (a model with no brand logo), the title starts at the
     * edge. */
    logo: ReactNode;
    /** Beside the logo: the name and its tags, and who published it. */
    title: ReactNode;
    /** What it is, under the title line. */
    children?: ReactNode;
    price: ReactNode;
    copy?: { value: string; label: string };
    /** Beside the value to copy: whether it works right now. */
    status?: ReactNode;
    action?: ReactNode;
    split?: keyof typeof SPLIT;
}> = ({
    logo,
    title,
    children,
    price,
    copy,
    status,
    action,
    split = "half",
}) => {
    const at = SPLIT[split];
    return (
        <Surface className={`flex flex-col gap-3 ${at.card}`}>
            <div className={`flex min-w-0 flex-col gap-2.5 ${at.head}`}>
                <div className="flex min-w-0 items-center gap-2.5">
                    {logo && (
                        <>
                            <span className="flex h-8 w-8 shrink-0 [&>*]:h-full [&>*]:w-full">
                                {logo}
                            </span>
                            <span
                                aria-hidden="true"
                                className="h-8 w-px shrink-0 bg-divider"
                            />
                        </>
                    )}
                    <div className="min-w-0 flex-1">{title}</div>
                </div>
                <div className="flex min-w-0 flex-col gap-1">{children}</div>
                {/* How to call it, in the copy box used everywhere; stacked,
                    it is the edge between what it is and the price. */}
                {copy && (
                    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                        <div className="w-fit min-w-0 max-w-full">
                            <CopyField
                                label={copy.label}
                                value={copy.value}
                                className={at.oneLine}
                            />
                        </div>
                        {/* Beside the box when it fits, under it otherwise:
                            whether it works, and where to try it. */}
                        {status && (
                            <div className="flex min-h-5 items-center gap-2">
                                {status}
                            </div>
                        )}
                    </div>
                )}
            </div>
            {/* No box: a line on its left beside the text, none stacked. */}
            <div className={`min-w-0 ${at.price}`}>{price}</div>
            {action && <div className={at.action}>{action}</div>}
        </Surface>
    );
};
