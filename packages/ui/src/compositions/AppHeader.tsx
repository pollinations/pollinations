import type { CSSProperties, ReactNode, RefObject } from "react";
import { useEffect, useState } from "react";
import logoWordmarkUrl from "../assets/logo-wordmark.svg";
import { cn } from "../lib/cn.ts";

type ScrollTargetRef = RefObject<HTMLElement | null>;

export type AppHeaderProps = {
    children?: ReactNode;
    navLabel: string;
    autoHide?: boolean;
    scrollTargetRef?: ScrollTargetRef;
    brandHref?: string;
    brandLabel?: string;
    className?: string;
    innerClassName?: string;
    navClassName?: string;
};

const brandWordmarkMaskUrl = `url('${logoWordmarkUrl}')`;

const brandWordmarkMask: CSSProperties = {
    WebkitMaskImage: brandWordmarkMaskUrl,
    WebkitMaskPosition: "center",
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
    maskImage: brandWordmarkMaskUrl,
    maskPosition: "center",
    maskRepeat: "no-repeat",
    maskSize: "contain",
};

function scrollTopFor(target: HTMLElement | Window) {
    return target === window
        ? window.scrollY
        : (target as HTMLElement).scrollTop;
}

export function AppHeader({
    children,
    navLabel,
    autoHide = false,
    scrollTargetRef,
    brandHref = "https://pollinations.ai",
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
                "polli:sticky polli:top-0 polli:z-30 polli:border-b polli:border-theme-border polli:bg-surface-white polli:py-4 polli:backdrop-blur",
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
                <a
                    href={brandHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="polli:inline-flex polli:shrink-0 polli:items-center polli:text-theme-text-strong"
                    aria-label={brandLabel}
                >
                    <span className="polli:sr-only">{brandLabel}</span>
                    <span
                        aria-hidden="true"
                        className="polli:block polli:h-7 polli:w-[220px] polli:max-w-full polli:bg-current"
                        style={brandWordmarkMask}
                    />
                </a>
                {children ? (
                    <nav
                        aria-label={navLabel}
                        className={cn(
                            "polli:flex polli:min-w-0 polli:flex-wrap polli:gap-2",
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
