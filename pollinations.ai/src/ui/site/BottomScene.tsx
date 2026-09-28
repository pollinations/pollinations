import { type ArtPage, useArt } from "../../art";

/**
 * Website-only closing panorama that grows a page card to its illustrated
 * edge. Phones show the whole panorama instead of a cropped middle.
 */
export function BottomScene({ page }: { page: ArtPage }) {
    const scene = useArt(page, "closing");

    return (
        <div
            aria-hidden="true"
            className="-mx-5 -mt-8 -mb-10 relative aspect-[12/5] shrink-0 overflow-hidden sm:-mx-8 sm:-mt-12 sm:-mb-16 sm:aspect-auto sm:h-[clamp(13rem,36vw,28rem)] md:-mx-18"
        >
            <img
                src={scene.src}
                srcSet={scene.srcSet}
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
