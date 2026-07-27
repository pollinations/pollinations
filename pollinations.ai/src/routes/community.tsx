import { createFileRoute } from "@tanstack/react-router";
import { Hero, PageHeader } from "../ui/site/kit";

export const Route = createFileRoute("/community")({
    component: CommunityPage,
});

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
