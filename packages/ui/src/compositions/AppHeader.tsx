import type { ReactNode, RefObject } from "react";
import { useEffect, useState } from "react";
import { cn } from "../lib/cn.ts";
import { BrandMark } from "../primitives/BrandMark.tsx";
import { AppBrand } from "./AppBrand.tsx";

type ScrollTargetRef = RefObject<HTMLElement | null>;

export type AppHeaderProps = {
    children?: ReactNode;
    navLabel: string;
    /** Shows the lotus + this name instead of the pollinations.ai wordmark. */
    appName?: string;
    autoHide?: boolean;
    scrollTargetRef?: ScrollTargetRef;
    brandHref?: string;
    brandLabel?: string;
    className?: string;
    innerClassName?: string;
    navClassName?: string;
};

function scrollTopFor(target: HTMLElement | Window) {
    return target === window
        ? window.scrollY
        : (target as HTMLElement).scrollTop;
}

export function AppHeader({
    children,
    navLabel,
    appName,
    autoHide = false,
    scrollTargetRef,
    brandHref,
    brandLabel = "Pollinations",
    className,
    innerClassName,
    navClassName,
}: AppHeaderProps) {
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        if (!autoHide || typeof window === "undefined") {
            setHidden(false);
            return;
        }

        const target = scrollTargetRef?.current ?? window;
        let lastScrollTop = scrollTopFor(target);
        let frameId = 0;

        const handleScroll = () => {
            if (frameId) return;

            frameId = window.requestAnimationFrame(() => {
                frameId = 0;
                const nextScrollTop = scrollTopFor(target);
                const delta = nextScrollTop - lastScrollTop;

                if (nextScrollTop < 16) {
                    setHidden(false);
                } else if (delta > 8) {
                    setHidden(true);
                } else if (delta < -8) {
                    setHidden(false);
                }

                lastScrollTop = nextScrollTop;
            });
        };

        target.addEventListener("scroll", handleScroll, { passive: true });

        return () => {
            if (frameId) window.cancelAnimationFrame(frameId);
            target.removeEventListener("scroll", handleScroll);
        };
    }, [autoHide, scrollTargetRef]);

    return (
        <header
            className={cn(
                "polli:sticky polli:top-0 polli:z-30 polli:bg-app-bg polli:py-4",
                "polli:transition-transform polli:duration-200 polli:ease-out",
                autoHide && "polli:will-change-transform",
                hidden ? "polli:-translate-y-full" : "polli:translate-y-0",
                className,
            )}
            onFocusCapture={() => setHidden(false)}
        >
            <div
                className={cn(
                    "polli:mx-auto polli:flex polli:w-full polli:max-w-5xl polli:flex-col polli:gap-4 polli:px-4 polli:sm:flex-row polli:sm:items-center polli:sm:justify-between polli:sm:px-6",
                    innerClassName,
                )}
            >
                {appName ? (
                    <AppBrand appName={appName} href={brandHref} />
                ) : (
                    <a
                        href={brandHref ?? "https://pollinations.ai"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="polli:inline-flex polli:shrink-0 polli:items-center polli:text-theme-text-strong"
                    >
                        <span className="polli:sr-only">{brandLabel}</span>
                        <BrandMark
                            variant="lockup"
                            className="polli:h-7 polli:w-[220px] polli:max-w-full"
                        />
                    </a>
                )}
                {children ? (
                    <nav
                        aria-label={navLabel}
                        className={cn(
                            "polli:flex polli:min-w-0 polli:flex-wrap polli:items-center polli:gap-2",
                            navClassName,
                        )}
                    >
                        {children}
                    </nav>
                ) : null}
            </div>
        </header>
    );
}
