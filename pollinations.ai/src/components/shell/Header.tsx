import {
    ColorModeToggle,
    cn,
    ExternalLinkButton,
    NavItem,
} from "@pollinations/ui";
import wordmarkUrl from "@pollinations/ui/assets/logo-wordmark.svg";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { ENTER_HREF, NAV_ITEMS } from "./links.ts";
import { useHideOnScroll } from "./useHideOnScroll.ts";

export function Header() {
    const hidden = useHideOnScroll("app-scroll");
    const matchRoute = useMatchRoute();
    return (
        <header
            className={cn(
                "sticky top-0 z-30 border-b border-divider bg-app-bg transition-transform duration-300",
                hidden && "-translate-y-full",
            )}
        >
            <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 sm:h-14 sm:flex-nowrap sm:px-6 sm:py-0">
                <Link
                    to="/"
                    aria-label="pollinations.ai home"
                    className="order-1 flex items-center"
                >
                    <span
                        className="block h-5 w-44 bg-current text-theme-text-strong"
                        style={{
                            maskImage: `url(${wordmarkUrl})`,
                            WebkitMaskImage: `url(${wordmarkUrl})`,
                            maskRepeat: "no-repeat",
                            WebkitMaskRepeat: "no-repeat",
                            maskSize: "contain",
                            WebkitMaskSize: "contain",
                            maskPosition: "left center",
                            WebkitMaskPosition: "left center",
                        }}
                    />
                </Link>

                <nav className="order-3 -mx-1 flex w-full min-w-0 items-center gap-1 overflow-x-auto px-1 pb-1 sm:order-2 sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0 sm:pb-0">
                    {NAV_ITEMS.map((item) => (
                        <NavItem
                            key={item.to}
                            as={Link}
                            to={item.to}
                            active={Boolean(
                                matchRoute({
                                    to: item.to,
                                    fuzzy: !item.exact,
                                }),
                            )}
                        >
                            {item.label}
                        </NavItem>
                    ))}
                </nav>

                <div className="order-2 flex shrink-0 items-center gap-2 sm:order-3">
                    <ExternalLinkButton href={ENTER_HREF}>
                        Dashboard
                    </ExternalLinkButton>
                    <ColorModeToggle />
                </div>
            </div>
        </header>
    );
}
