import { cn } from "@pollinations/ui";
import wordmarkUrl from "@pollinations/ui/assets/logo-wordmark.svg";
import { Link } from "@tanstack/react-router";
import { NAV_ITEMS } from "./links.ts";
import { UserMenu } from "./UserMenu.tsx";
import { useHideOnScroll } from "./useHideOnScroll.ts";

export function Header() {
    const hidden = useHideOnScroll("app-scroll");
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
                        <Link
                            key={item.to}
                            to={item.to}
                            activeOptions={{ exact: item.exact }}
                            className="rounded-md px-2 py-1.5 font-body text-sm font-semibold text-theme-text-soft hover:text-theme-text-strong sm:px-3"
                            activeProps={{
                                className: "text-theme-text-strong",
                            }}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <UserMenu />
            </div>
        </header>
    );
}
