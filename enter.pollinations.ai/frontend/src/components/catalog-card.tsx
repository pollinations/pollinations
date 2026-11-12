import { CopyField, Surface } from "@pollinations/ui";
import type { FC, ReactNode } from "react";

/**
 * One card of a catalog list (models, MCP servers, sandbox templates): the
 * logo and a short bar open the title line, then what it is and the command
 * or ID to copy, with what to do with it beside; the rest starts at the
 * card's edge. Stacked, the price follows; from a 38rem list, it sits on the
 * right behind a vertical line, `--catalog-price-width` wide (set on the
 * list), where the title and its tags still fit beside it (about 13rem). The
 * list needs `@container`.
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
    /** An id stays on one line beside the price (it still copies whole); a
     * command `wrap`s between its words rather than lose its end. */
    copy?: { value: string; label: string; wrap?: boolean };
    /** Beside the value to copy: whether it works, how to try or start it. */
    status?: ReactNode;
}> = ({ logo, title, children, price, copy, status }) => (
    <Surface className="flex flex-col gap-3 @min-[38rem]:grid @min-[38rem]:grid-cols-[minmax(0,1fr)_var(--catalog-price-width)] @min-[38rem]:gap-x-6">
        <div className="flex min-w-0 flex-col gap-2.5 @min-[38rem]:col-start-1 @min-[38rem]:row-start-1 @min-[38rem]:self-start">
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
            {/* How to call it: the small copy pill, the size of the labels
                and buttons beside it. */}
            {copy && (
                <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                    <div className="w-fit min-w-0 max-w-full">
                        <CopyField
                            label={copy.label}
                            value={copy.value}
                            size="sm"
                            className={
                                copy.wrap
                                    ? undefined
                                    : "@min-[38rem]:[&>span:first-child]:truncate"
                            }
                        />
                    </div>
                    {/* Beside the pill when it fits, under it otherwise. */}
                    {status && (
                        <div className="flex min-h-5 items-center gap-2">
                            {status}
                        </div>
                    )}
                </div>
            )}
        </div>
        {/* No box: a line on its left beside the text, none stacked. */}
        <div className="min-w-0 @min-[38rem]:col-start-2 @min-[38rem]:row-start-1 @min-[38rem]:self-start @min-[38rem]:border-l @min-[38rem]:border-divider @min-[38rem]:pl-4">
            {price}
        </div>
    </Surface>
);
