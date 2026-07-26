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
                title="Contribute"
                subtitle="Builders shape the platform directly. Share what you need, meet the people using it, and help build what comes next."
            />
        </div>
    );
}
