import { ContentHeader } from "@pollinations/ui";

const UPCOMING = [
    {
        title: "Agent micropayments",
        body: "Let agents purchase models, tools, and other agents’ services autonomously.",
    },
    {
        title: "Permanent media hosting",
        body: "Keep generated images, audio, and video available with paid storage and delivery.",
    },
    {
        title: "Developer cashouts",
        body: "Turn earnings from apps, agents, and community models into real payouts.",
    },
    {
        title: "App hosting",
        body: "Deploy Pollinations-powered apps with domains, logs, usage, and billing.",
    },
];

export function OnTheWay() {
    return (
        <section className="flex flex-col gap-6">
            <ContentHeader
                eyebrow="On the way"
                title={`${UPCOMING.length} things we’re building.`}
            />
            {/* Dashed and unlifted on purpose: nothing here is clickable yet. */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4">
                {UPCOMING.map((item) => (
                    <div
                        key={item.title}
                        className="flex flex-col gap-2 rounded-2xl border border-theme-border border-dashed bg-theme-bg-pale p-5"
                    >
                        <h3 className="font-body text-lg font-semibold text-theme-text-strong">
                            {item.title}
                        </h3>
                        <p className="text-sm leading-relaxed text-theme-text-base">
                            {item.body}
                        </p>
                    </div>
                ))}
            </div>
        </section>
    );
}
