import { ContentHeader, ExternalLinkButton, Surface } from "@pollinations/ui";
import { useArt } from "../../art";

/** How to earn Pollen before you have users of your own. */
export function QuestsCard() {
    const scene = useArt("home", "quests");

    return (
        <Surface
            variant="card"
            className="relative flex flex-col gap-6 overflow-hidden p-5 sm:p-6 lg:min-h-72 lg:justify-center"
        >
            <div className="relative z-10 flex flex-col gap-6 lg:max-w-[48%]">
                <ContentHeader
                    eyebrow="Quests"
                    title="Build something. Earn your next generation."
                    subtitle="Earn Quest Pollen by solving GitHub Quests, trying models, or building an app or agent. Many models need Paid Pollen."
                />
                <ExternalLinkButton
                    href="https://enter.pollinations.ai/quests"
                    size="lg"
                    intent="brand"
                    className="self-start whitespace-nowrap"
                >
                    Explore Quests
                </ExternalLinkButton>
            </div>
            <img
                src={scene.src}
                srcSet={scene.srcSet}
                sizes="(min-width: 1240px) 550px, (min-width: 1024px) 50vw, 100vw"
                alt=""
                aria-hidden="true"
                width={2048}
                height={1024}
                loading="lazy"
                decoding="async"
                className="first-call-scene pointer-events-none -mx-5 -mb-5 h-auto w-[calc(100%+2.5rem)] max-w-none select-none sm:-mx-6 sm:-mb-6 sm:w-[calc(100%+3rem)] lg:absolute lg:right-0 lg:bottom-0 lg:m-0 lg:h-full lg:w-1/2 lg:object-contain lg:object-bottom"
            />
        </Surface>
    );
}
