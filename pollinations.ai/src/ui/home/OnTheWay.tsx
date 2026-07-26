const UPCOMING = [
    {
        title: "Pollinations Login",
        // The OAuth and device flows shipped 2026-07-03 (#12165); only the
        // drop-in React components are still alpha. Saying "coming soon"
        // would understate what's already live.
        body: "OAuth and device flow are live today. The drop-in React components are alpha.",
    },
    {
        title: "App Hosting",
        body: "Push your app to our infra. No deploy setup, no separate bill.",
    },
    {
        title: "BYOA — Bring Your Own Agent",
        body: "Publish an agent others can call. Earns like a model.",
    },
    {
        title: "Ads SDK",
        body: "Optional ad slots. Earnings go to your wallet.",
    },
];

export function OnTheWay() {
    return (
        <section className="flex flex-col gap-6 px-8 pb-16 md:px-18">
            <div className="flex flex-col gap-2.5">
                <p className="font-pixel text-sm tracking-widest text-theme-text-soft uppercase">
                    Next
                </p>
                <h2 className="font-heading text-4xl text-theme-text-strong">
                    On the way
                </h2>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4">
                {UPCOMING.map((item) => (
                    <div
                        key={item.title}
                        className="flex flex-col gap-2 rounded-2xl border border-theme-border border-dashed bg-theme-bg-pale p-5"
                    >
                        <h3 className="font-subheading text-lg text-theme-text-strong">
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
