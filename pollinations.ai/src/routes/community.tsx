import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../ui/site/PageHeader";

export const Route = createFileRoute("/community")({
    component: CommunityPage,
});

function CommunityPage() {
    return (
        <div>
            <PageHeader
                eyebrow="Open source, open roadmap"
                title="Build it with us."
                subtitle="Share what you need, meet the people already using it, and help decide what comes next."
            />
        </div>
    );
}
