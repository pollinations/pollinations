import { cn, useColorMode } from "@pollinations/ui";
import type { ComponentPropsWithoutRef } from "react";

type BottomSceneProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
    dayScene: string;
    nightScene: string;
};

/** Website-only closing panorama that grows a page card to its illustrated edge. */
export function BottomScene({
    dayScene,
    nightScene,
    className,
    ...props
}: BottomSceneProps) {
    const { isDark } = useColorMode();
    const activeScene = isDark ? nightScene : dayScene;
    const compactScene = activeScene.replace(/\.webp$/, "-1024.webp");

    return (
        <div
            aria-hidden="true"
            className={cn(
                "-mx-4 -mt-8 -mb-10 relative h-[clamp(13rem,36vw,28rem)] shrink-0 overflow-hidden sm:-mx-8 sm:-mt-12 sm:-mb-16 md:-mx-18",
                className,
            )}
            {...props}
        >
            <img
                src={activeScene}
                srcSet={`${compactScene} 1024w, ${activeScene} 2048w`}
                sizes="(max-width: 1440px) 100vw, 1440px"
                alt=""
                width={2048}
                height={854}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                className="bottom-scene pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-center"
            />
        </div>
    );
}
