import { Button, Chip, Input, Surface, TabButton } from "@pollinations/ui";
import { ModalityChip, ModalityDot, ModalityTab } from "@pollinations/ui/gen";
import { PageIntro, SectionHeader } from "./reference-layout";

// --- Colors tab ------------------------------------------------------------
// A self-contained color story for the reduced theme. The accent tokens are
// shown alongside structural, modality, wallet, and intent colors. All class
// strings are literal (the app compiles Tailwind from source, so dynamic class
// names won't emit).

// [name, swatch fill class, canonical usage class]
const THEMED_TOKENS = [
    ["bg-pale", "bg-theme-bg-pale", "bg-theme-bg-pale"],
    ["bg-subtle", "bg-theme-bg-subtle", "bg-theme-bg-subtle"],
    ["bg-active", "bg-theme-bg-active", "bg-theme-bg-active"],
    ["bg-hover", "bg-theme-bg-hover", "bg-theme-bg-hover"],
    ["border", "bg-theme-border", "border-theme-border"],
    ["text-soft", "bg-theme-text-soft", "text-theme-text-soft"],
] as const;

const STRUCTURAL_TOKENS = [
    ["app-bg", "bg-app-bg", "bg-app-bg"],
    ["surface-opaque", "bg-surface-opaque", "bg-surface-opaque"],
    ["divider", "bg-divider", "border-divider"],
    ["text-strong", "bg-theme-text-strong", "text-theme-text-strong"],
    ["text-base", "bg-theme-text-base", "text-theme-text-base"],
    ["text-muted", "bg-theme-text-muted", "text-theme-text-muted"],
] as const;

// [name, pill classes (literal so Tailwind emits them)]
const INTENT_TOKENS = [
    ["danger", "bg-intent-danger-bg-light text-intent-danger-text"],
    ["success", "bg-intent-success-bg-light text-intent-success-text"],
    ["warning", "bg-intent-warning-bg-light text-intent-warning-text"],
    ["news", "bg-intent-news-bg-light text-intent-news-text"],
    ["alpha", "bg-intent-alpha-bg-light text-intent-alpha-text"],
] as const;

const MODALITIES = [
    "text",
    "image",
    "video",
    "audio",
    "realtime",
    "embedding",
] as const;

// [name, coin color var] — the wallet credit coins (from the wallet module).
const WALLET_SWATCHES = [
    ["pollen", "var(--polli-color-tier-soft)"],
    ["pollen+", "var(--polli-color-paid-soft)"],
] as const;

function Swatch({
    name,
    fill,
    usage,
}: {
    name: string;
    fill: string;
    usage: string;
}) {
    return (
        <div className="flex items-center gap-3 rounded-lg bg-surface-opaque p-2.5">
            <span
                className={`h-9 w-9 shrink-0 rounded-md border border-divider ${fill}`}
            />
            <span className="min-w-0">
                <span className="block text-sm font-semibold text-theme-text-strong">
                    {name}
                </span>
                <code className="block truncate text-xs text-theme-text-muted">
                    {usage}
                </code>
            </span>
        </div>
    );
}

export function ColorsPage() {
    return (
        <>
            <PageIntro>
                One app accent drives all chrome — set once via{" "}
                <code>--polli-hue</code> (currently hue 85, an amber). The
                multi-hue palette is reserved for dedicated roles: per-modality
                dots, the wallet coins, and the fixed status/label intents. Flip
                the light/dark toggle in the header to see each token adapt.
            </PageIntro>

            <section className="flex flex-col gap-4">
                <SectionHeader title="Accent">
                    The single app accent. Every themed token — bg-theme-*,
                    border-theme-border, text-theme-text-soft — resolves to it;
                    no per-page hue.
                </SectionHeader>
                <Surface variant="panel" className="flex flex-col gap-4">
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-2.5">
                        {THEMED_TOKENS.map(([name, fill, usage]) => (
                            <Swatch
                                key={name}
                                name={name}
                                fill={fill}
                                usage={usage}
                            />
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 border-t border-divider pt-4">
                        <Button size="sm">Button</Button>
                        <Chip size="sm">Chip</Chip>
                        <TabButton active onClick={() => undefined}>
                            Active tab
                        </TabButton>
                        <TabButton active={false} onClick={() => undefined}>
                            Tab
                        </TabButton>
                        <Input
                            className="w-40"
                            placeholder="Input"
                            aria-label="Accent input preview"
                        />
                    </div>
                </Surface>
            </section>

            <section className="flex flex-col gap-4">
                <SectionHeader title="Modality">
                    A fixed color per model modality — as a dot, a chip, or a
                    filter tab. Decoupled from the accent; identical wherever a
                    modality appears.
                </SectionHeader>
                <Surface variant="panel" className="flex flex-col gap-4">
                    <div className="flex flex-wrap gap-x-5 gap-y-3">
                        {MODALITIES.map((m) => (
                            <span
                                key={m}
                                className="inline-flex items-center gap-2 text-sm font-medium capitalize text-theme-text-base"
                            >
                                <ModalityDot modality={m} />
                                {m}
                            </span>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {MODALITIES.map((m) => (
                            <ModalityChip
                                key={m}
                                modality={m}
                                className="capitalize"
                            >
                                {m}
                            </ModalityChip>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {MODALITIES.map((m, i) => (
                            <ModalityTab
                                key={m}
                                active={i === 0}
                                onClick={() => undefined}
                                className="capitalize"
                            >
                                {m}
                            </ModalityTab>
                        ))}
                    </div>
                </Surface>
            </section>

            <section className="flex flex-col gap-4">
                <SectionHeader title="Wallet">
                    Two honey coins for the credit system — pollen and pollen+.
                </SectionHeader>
                <Surface variant="panel" className="flex flex-wrap gap-2.5">
                    {WALLET_SWATCHES.map(([name, color]) => (
                        <div
                            key={name}
                            className="flex items-center gap-3 rounded-lg bg-surface-opaque p-2.5"
                        >
                            <span
                                className="h-9 w-9 shrink-0 rounded-full border border-divider"
                                style={{ backgroundColor: color }}
                            />
                            <span className="text-sm font-semibold text-theme-text-strong">
                                {name}
                            </span>
                        </div>
                    ))}
                </Surface>
            </section>

            <section className="flex flex-col gap-4">
                <SectionHeader title="Structural">
                    Neutral, theme-independent surfaces and text — identical in
                    every theme; only light/dark changes them.
                </SectionHeader>
                <Surface
                    variant="panel"
                    className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-2.5"
                >
                    {STRUCTURAL_TOKENS.map(([name, fill, usage]) => (
                        <Swatch
                            key={name}
                            name={name}
                            fill={fill}
                            usage={usage}
                        />
                    ))}
                </Surface>
            </section>

            <section className="flex flex-col gap-4">
                <SectionHeader title="Status &amp; labels">
                    Intent colors, independent of the accent. Status
                    (danger/success/warning) is the traffic-light trio; labels
                    (news/alpha) are their own system.
                </SectionHeader>
                <Surface variant="panel" className="flex flex-wrap gap-2">
                    {INTENT_TOKENS.map(([name, pill]) => (
                        <span
                            key={name}
                            className={`rounded-full px-3 py-1 text-sm font-semibold capitalize ${pill}`}
                        >
                            {name}
                        </span>
                    ))}
                </Surface>
            </section>
        </>
    );
}
