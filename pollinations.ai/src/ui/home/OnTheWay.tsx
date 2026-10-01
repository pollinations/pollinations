import { ContentHeader } from "@pollinations/ui";

const UPCOMING = [
    {
        title: "Agent micropayments",
        body: "Let agents pay for external services and other agents’ work—not just the models and tools they already use.",
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
    {
        title: "Flexible markups",
        body: "Choose the markup on app and agent usage. App earnings currently use a fixed 25% markup.",
    },
];

export function OnTheWay() {
    return (
        <section className="flex flex-col gap-6">
            <ContentHeader
                eyebrow="On the way"
                title="What we’re building next."
            />
            {/* Dashed and unlifted on purpose: nothing here is clickable yet.
                At most three per row; cards in a shorter last row grow to
                share its width (five items read as 3 + 2). */}
            <div className="flex flex-wrap gap-4">
                {UPCOMING.map((item) => (
                    <div
                        key={item.title}
                        className="flex grow basis-full flex-col gap-2 rounded-2xl border border-theme-border border-dashed bg-theme-bg-pale p-5 sm:basis-[calc(50%-0.5rem)] lg:basis-[calc(33.333%-0.667rem)]"
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
