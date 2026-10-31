import { Link, type LinkProps } from "@tanstack/react-router";
import type { FC } from "react";

export type TitleSwitchView = {
    label: string;
    /** Name every search param, with `undefined` for a default view's. */
    link: LinkProps;
};

/**
 * A page heading made of the page's views, e.g. "News / FAQ": the current
 * view reads as the title, the others are links that switch to them.
 */
export const TitleSwitch: FC<{
    views: readonly TitleSwitchView[];
    active: string;
}> = ({ views, active }) => (
    <span className="inline-flex flex-wrap items-baseline gap-x-3">
        {views.map(({ label, link }, index) => (
            <span key={label} className="inline-flex items-baseline gap-x-3">
                {label === active ? (
                    <span aria-current="true">{label}</span>
                ) : (
                    <Link
                        {...link}
                        // Some views share a path, so only an exact search
                        // match counts as the current page.
                        activeOptions={{ exact: true, explicitUndefined: true }}
                        className="text-theme-text-muted transition-colors hover:text-theme-text-strong"
                    >
                        {label}
                    </Link>
                )}
                {/* After the word, so a wrapped heading ends a line with it. */}
                {index < views.length - 1 && (
                    <span aria-hidden="true" className="text-theme-text-muted">
                        /
                    </span>
                )}
            </span>
        ))}
    </span>
);
