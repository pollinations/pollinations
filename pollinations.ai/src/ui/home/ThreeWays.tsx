import { Chip, Surface } from "@pollinations/ui";
import { CodeBlock, HOVER_LIFT } from "../site/mockup";
import { SectionHeader } from "../site/PageHeader";

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

            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-5">
                {WAYS.map((way) => (
                    <Surface
                        key={way.chip}
                        variant="card"
                        className={`flex flex-col gap-3 p-7 ${HOVER_LIFT}`}
                    >
                        <div className="flex flex-wrap items-center gap-2">
                            {/* All three chips share one treatment — the section
                                headline says these are equal options, so none
                                of them gets to shout. */}
                            <Chip
                                size="sm"
                                className="bg-theme-bg-subtle font-pixel text-theme-text-soft uppercase"
                            >
                                {way.chip}
                            </Chip>
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
                        <CodeBlock filename={way.filename}>
                            {way.code}
                        </CodeBlock>
                        <p className="mt-auto pt-2 text-xs text-theme-text-muted">
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
                    </Surface>
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-3.5 rounded-2xl bg-theme-bg-subtle px-5 py-4">
                <span className="font-pixel text-xs tracking-wider text-theme-text-soft uppercase">
                    Stackable
                </span>
                <p className="text-sm text-theme-text-base">
                    A BYOP app calling a community model pays out twice — an app
                    reward to the developer and a model reward to the owner,
                    from the same request.
                </p>
            </div>
        </section>
    );
}
