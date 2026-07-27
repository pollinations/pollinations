import { Card, PixelBadge, SectionHeader, Terminal } from "../site/kit";

type Way = {
    chip: string;
    chipTitle: string;
    heading: string;
    body: string;
    filename: string;
    code: string;
    payer: string;
    earns?: string;
};

const WAYS: Way[] = [
    {
        chip: "Direct API",
        chipTitle: "",
        heading: "You buy Pollen, you call the models",
        body: "Your key, your product. Get free Pollen from Quests to prototype, top up when you go live.",
        filename: "direct-api.sh",
        code: `$ curl gen.pollinations.ai/v1/chat/completions \\
  -H "Authorization: Bearer sk_..." \\
  -d '{"model":"openai","messages":[…]}'`,
        payer: "you",
    },
    {
        chip: "BYOP",
        chipTitle: "Bring Your Own Pollen",
        heading: "Your users pay, you earn a reward",
        body: "Add Pollinations sign-in. Users spend their own balance — paid or earned from Quests — and 20% of it is yours.",
        filename: "byop.sh",
        code: `$ open "enter.pollinations.ai/authorize?client_id=pk_..."
# user approves → your app receives sk_...
$ curl gen.pollinations.ai/v1/chat/completions \\
  -H "Authorization: Bearer sk_..."`,
        payer: "your user",
        earns: "app reward",
    },
    {
        chip: "BYOM",
        chipTitle: "Bring Your Own Model",
        heading: "Your model, served to everyone",
        body: "Apply to publish a community model as owner/model and keep 75% of every call.",
        filename: "byom.sh",
        code: `$ curl gen.pollinations.ai/v1/chat/completions \\
  -H "Authorization: Bearer sk_..." \\
  -d '{"model":"owner/community-model", …}'`,
        payer: "the caller",
        earns: "model reward",
    },
];

export function ThreeWays() {
    return (
        <section className="flex flex-col gap-7">
            <SectionHeader
                eyebrow="The three ways"
                title="Same API. Your choice who pays."
                subtitle="Every flow hits the same generation endpoints — what changes is the key you send and the model you name."
            />

            {/* Full-width rows, not a 3-up grid. Three terminals crammed
                into third-width cards is what forced 11.5px type and a
                horizontal scrollbar — at ~60% of the row each one reads like
                a terminal instead of a postage stamp. Rows also break the
                grid-after-grid rhythm the reviews kept flagging, and they
                keep the three ways equal, which tabs would not. */}
            <div className="flex flex-col gap-5">
                {WAYS.map((way) => (
                    <Card
                        key={way.chip}
                        className="gap-6 p-7 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-center"
                    >
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-wrap items-baseline gap-2">
                                <PixelBadge>{way.chip}</PixelBadge>
                                {way.chipTitle && (
                                    <span className="text-sm text-theme-text-muted">
                                        {way.chipTitle}
                                    </span>
                                )}
                            </div>
                            <h3 className="font-subheading text-xl text-theme-text-strong">
                                {way.heading}
                            </h3>
                            <p className="text-sm leading-relaxed text-theme-text-base">
                                {way.body}
                            </p>
                            <p className="pt-1 text-xs text-theme-text-muted">
                                Who pays:{" "}
                                <strong className="text-theme-text-strong">
                                    {way.payer}
                                </strong>
                                {way.earns && (
                                    <>
                                        {" · "}You earn:{" "}
                                        <strong className="text-theme-text-soft">
                                            {way.earns}
                                        </strong>
                                    </>
                                )}
                            </p>
                        </div>
                        <Terminal filename={way.filename} code={way.code} />
                    </Card>
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-3.5 rounded-2xl bg-theme-bg-subtle px-5 py-4">
                <PixelBadge>Stackable</PixelBadge>
                <p className="text-sm text-theme-text-base">
                    A BYOP app calling a community model pays out twice — an app
                    reward to the developer and a model reward to the owner,
                    from the same request.
                </p>
            </div>
        </section>
    );
}
