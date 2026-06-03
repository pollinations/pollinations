import { cn, NavItem } from "@pollinations/ui";
import wordmarkUrl from "@pollinations/ui/assets/logo-wordmark.svg";
import { AccountMenu } from "@pollinations/ui/compositions/account";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { ENTER_HREF, NAV_ITEMS } from "./links.ts";
import { useHideOnScroll } from "./useHideOnScroll.ts";

export function Header() {
    const hidden = useHideOnScroll("app-scroll");
    const matchRoute = useMatchRoute();
    return (
        <header
            className={cn(
                "sticky top-0 z-30 border-b border-theme-border bg-theme-bg-pale/90 backdrop-blur transition-transform duration-300",
                hidden && "-translate-y-full",
            )}
        >
            <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
                <Link
                    to="/"
                    aria-label="pollinations.ai home"
                    className="flex items-center"
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

                <nav className="flex items-center gap-1">
                    {NAV_ITEMS.map((item) => (
                        <NavItem
                            key={item.to}
                            as={Link}
                            to={item.to}
                            theme={item.theme}
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

                <AccountMenu dashboardHref={ENTER_HREF} theme="green" />
            </div>
        </header>
    );
}
