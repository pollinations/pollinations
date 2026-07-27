import { createFileRoute } from "@tanstack/react-router";
import { Hero, PageHeader } from "../ui/site/kit";

export const Route = createFileRoute("/community")({
    component: CommunityPage,
});

/**
 * Still a stub. The mockup puts a PixelRule under the hero, but it divides
 * nothing until the sections below it exist — add it back with them.
 */
function CommunityPage() {
    return (
        <Hero>
            <PageHeader
                eyebrow="Open source, open roadmap"
                title="Build it with us."
                subtitle="Share what you need, meet the people already using it, and help decide what comes next."
            />
        </Hero>
    );
}
