import { PollinationsLogo } from "../../primitives/PollinationsLogo.tsx";
import type { ThemeName } from "../../theme.ts";
import { AccountMenu } from "../account/AccountMenu.tsx";
import { HeaderFrame } from "./HeaderFrame.tsx";

export type AppHeaderProps = {
    dashboardHref: string;
    homeHref?: string;
    theme?: ThemeName;
    width?: "5xl" | "6xl";
    hiddenWhenEmbedded?: boolean;
    embedQueryParam?: string;
    className?: string;
    innerClassName?: string;
};

function isEmbeddedContext(embedQueryParam: string): boolean {
    if (typeof window === "undefined") return false;
    const search = new URLSearchParams(window.location.search);
    if (search.get(embedQueryParam) === "1") return true;
    try {
        return window.self !== window.top;
    } catch {
        return true;
    }
}

export function AppHeader({
    dashboardHref,
    homeHref = "https://pollinations.ai",
    theme,
    width,
    hiddenWhenEmbedded = false,
    embedQueryParam = "embed",
    className,
    innerClassName,
}: AppHeaderProps) {
    if (hiddenWhenEmbedded && isEmbeddedContext(embedQueryParam)) {
        return null;
    }

    return (
        <HeaderFrame
            theme={theme}
            width={width}
            className={className}
            innerClassName={innerClassName}
            left={
                <a
                    href={homeHref}
                    aria-label="pollinations.ai home"
                    className="polli:flex polli:min-w-0 polli:items-center"
                >
                    <PollinationsLogo />
                </a>
            }
            right={<AccountMenu dashboardHref={dashboardHref} />}
        />
    );
}
