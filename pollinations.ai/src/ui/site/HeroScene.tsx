import { cn } from "@pollinations/ui";
import type { ReactNode } from "react";
import { useArt } from "../../art";

export const postHeroSpacingClassName = "-mt-5 sm:-mt-8";

/**
 * Website-only painted hero backdrop; shared controls inside come from
 * @pollinations/ui. From `sm` up the scene sits behind the copy; on phones it
 * is a banner above the copy, cropped to its right side where the cast stands.
 */
export function HeroScene({
    page,
    compactBottom = false,
    contentClassName,
    children,
}: {
    page: "home" | "play" | "apps" | "community";
    compactBottom?: boolean;
    contentClassName?: string;
    children: ReactNode;
}) {
    const scene = useArt(page, "hero");

    return (
        <section className="-mx-4 -mt-10 relative flex flex-col sm:-mx-8 sm:-mt-16 sm:flex-row sm:items-start md:-mx-18">
            <img
                src={scene.src}
                srcSet={scene.srcSet}
                sizes="(max-width: 1440px) 100vw, 1440px"
                alt=""
                aria-hidden="true"
                width={2048}
                height={854}
                fetchPriority="high"
                className="hero-scene pointer-events-none aspect-[3/2] w-full select-none object-cover object-right sm:absolute sm:top-0 sm:right-0 sm:aspect-auto sm:h-auto"
            />
            <div
                className={cn(
                    "relative flex w-full max-w-none min-w-0 flex-col gap-6 px-4 sm:max-w-[70%] sm:gap-8 sm:px-8 sm:pt-16 md:px-18 lg:max-w-[58%]",
                    compactBottom ? "pb-8" : "pb-14 sm:pb-16",
                    contentClassName,
                )}
            >
                {children}
            </div>
        </section>
    );
}
