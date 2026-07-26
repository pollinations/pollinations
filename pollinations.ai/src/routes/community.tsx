import polliBee from "@pollinations/ui/brand/polli/polli.png";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../ui/site/PageHeader";

export const Route = createFileRoute("/community")({
    component: CommunityPage,
});

function CommunityPage() {
    return (
        <div>
            <div className="flex flex-wrap items-center gap-12">
                <div className="min-w-0 flex-1">
                    <PageHeader
                        eyebrow="Open source, open roadmap"
                        title="Build it with us."
                        subtitle="Share what you need, meet the people already using it, and help decide what comes next."
                    />
                </div>
                <img
                    src={polliBee}
                    alt=""
                    aria-hidden="true"
                    width={220}
                    height={220}
                    className="mx-auto w-40 shrink-0 lg:w-[220px]"
                />
            </div>
        </div>
    );
}
