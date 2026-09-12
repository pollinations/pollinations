import { cn, useColorMode } from "@pollinations/ui";
import type { ReactNode } from "react";

export const postHeroSpacingClassName = "-mt-5 sm:-mt-8";

/** Website-only painted hero backdrop; shared controls inside come from @pollinations/ui. */
export function HeroScene({
    scene,
    nightScene,
    compactBottom = false,
    contentClassName,
    children,
}: {
    scene: string;
    nightScene: string;
    compactBottom?: boolean;
    contentClassName?: string;
    children: ReactNode;
}) {
    const { isDark } = useColorMode();
    const activeScene = isDark ? nightScene : scene;
    const compactScene = activeScene.replace(/\.webp$/, "-1024.webp");

    return (
        <section className="-mx-4 -mt-10 relative flex items-start sm:-mx-8 sm:-mt-16 md:-mx-18">
            <img
                src={activeScene}
                srcSet={`${compactScene} 1024w, ${activeScene} 2048w`}
                sizes="(max-width: 1440px) 100vw, 1440px"
                alt=""
                aria-hidden="true"
                width={2048}
                height={854}
                fetchPriority="high"
                className="hero-scene pointer-events-none absolute top-0 right-0 h-auto w-full select-none"
            />
            <div
                className={cn(
                    "relative flex w-full max-w-none min-w-0 flex-col gap-6 px-4 pt-14 sm:max-w-[70%] sm:gap-8 sm:px-8 sm:pt-16 md:px-18 lg:max-w-[58%]",
                    compactBottom ? "pb-8" : "pb-14 sm:pb-16",
                    contentClassName,
                )}
            >
                {children}
            </div>
        </section>
    );
}
