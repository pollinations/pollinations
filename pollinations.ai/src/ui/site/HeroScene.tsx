import { cn } from "@pollinations/ui";
import type { ReactNode } from "react";
import { type ArtPage, useArt } from "../../art";
import { HERO_IMAGE_SIZES } from "../../art-config";

export const postHeroSpacingClassName = "-mt-5 sm:-mt-8";

/**
 * Website-only painted hero backdrop; shared controls inside come from
 * @pollinations/ui. From `sm` up the scene sits behind the copy; on phones it
 * is a banner above the copy, cropped to its right side where the cast stands.
 *
 * `wide` is Home's longer headline: the copy column widens and the art
 * narrows from `md`, so the flying bee clears the H1 instead of sitting on it.
 */
export function HeroScene({
    page,
    compactBottom = false,
    wide = false,
    children,
}: {
    page: ArtPage;
    compactBottom?: boolean;
    wide?: boolean;
    children: ReactNode;
}) {
    const scene = useArt(page, "hero");

    return (
        <section className="-mx-5 -mt-10 relative flex flex-col sm:-mx-8 sm:-mt-16 sm:flex-row sm:items-start md:-mx-18">
            <img
                src={scene.src}
                srcSet={scene.srcSet}
                sizes={HERO_IMAGE_SIZES}
                alt=""
                aria-hidden="true"
                width={2048}
                height={854}
                fetchPriority="high"
                className={cn(
                    "hero-scene pointer-events-none aspect-[3/2] w-full select-none object-cover object-right sm:absolute sm:top-0 sm:right-0 sm:aspect-auto sm:h-auto",
                    wide && "md:w-[66%] lg:w-[76%]",
                )}
            />
            <div
                className={cn(
                    "relative flex w-full max-w-none min-w-0 flex-col gap-6 px-5 sm:max-w-[70%] sm:gap-8 sm:px-8 sm:pt-16 md:px-18 lg:max-w-[58%]",
                    compactBottom ? "pb-8" : "pb-14 sm:pb-16",
                    wide && "sm:max-w-[90%] sm:pt-20 lg:max-w-[72%]",
                )}
            >
                {children}
            </div>
        </section>
    );
}
