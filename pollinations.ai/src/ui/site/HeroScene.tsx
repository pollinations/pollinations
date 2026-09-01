import type { ReactNode } from "react";

/** Website-only painted hero backdrop; shared controls inside come from @pollinations/ui. */
export function HeroScene({
    scene,
    compactBottom = false,
    children,
}: {
    scene: string;
    compactBottom?: boolean;
    children: ReactNode;
}) {
    return (
        <section className="-mx-4 -mt-10 relative flex items-start sm:-mx-8 sm:-mt-16 md:-mx-18">
            <img
                src={scene}
                alt=""
                aria-hidden="true"
                width={2048}
                height={854}
                fetchPriority="high"
                className="hero-scene pointer-events-none absolute top-0 right-0 h-auto w-full select-none"
            />
            <div
                className={`relative flex w-full max-w-[70%] min-w-0 flex-col gap-6 px-4 pt-14 sm:gap-8 sm:px-8 sm:pt-16 md:px-18 lg:max-w-[58%] ${
                    compactBottom ? "pb-8" : "pb-14 sm:pb-16"
                }`}
            >
                {children}
            </div>
        </section>
    );
}
