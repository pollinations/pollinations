import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/community")({
    component: CommunityPage,
});

function CommunityPage() {
    return (
        <div className="px-8 pt-4 pb-16 md:px-18">
            <p className="font-pixel text-sm tracking-widest text-theme-text-soft uppercase">
                Open source, open roadmap
            </p>
            <h1 className="mt-3 font-heading text-5xl text-theme-text-strong">
                Contribute
            </h1>
            <p className="mt-4 max-w-xl text-lg text-theme-text-base">
                Builders shape the platform directly. Share what you need, meet
                the people using it, and help build what comes next.
            </p>
        </div>
    );
}
