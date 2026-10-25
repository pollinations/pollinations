import { Link, type LinkProps } from "@tanstack/react-router";
import type { FC } from "react";

export type TitleSwitchView = {
    label: string;
    active: boolean;
    /** Name every search param, with `undefined` for a default view's. */
    link: LinkProps;
};

/**
 * A page heading made of the page's views, e.g. "News / FAQ": the current
 * view reads as the title, the other is a link that switches to it.
 */
export const TitleSwitch: FC<{ views: readonly TitleSwitchView[] }> = ({
    views,
}) => (
    <span className="inline-flex flex-wrap items-baseline gap-x-3">
        {views.map(({ label, active, link }, index) => (
            <span key={label} className="inline-flex items-baseline gap-x-3">
                {index > 0 && (
                    <span aria-hidden="true" className="text-theme-text-muted">
                        /
                    </span>
                )}
                {active ? (
                    <span aria-current="true">{label}</span>
                ) : (
                    <Link
                        {...link}
                        // The views share a path, so only an exact search
                        // match counts as the current page.
                        activeOptions={{ exact: true, explicitUndefined: true }}
                        className="text-theme-text-muted transition-colors hover:text-theme-text-strong"
                    >
                        {label}
                    </Link>
                )}
            </span>
        ))}
    </span>
);
