import { Button, ExternalLinkButton, Section, Surface } from "@pollinations/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
    CTA,
    HELLO_META,
    HERO,
    ROADMAP,
    STATS,
    TOOLBOX,
} from "../components/hello/copy.ts";
import { ToolboxCard } from "../components/hello/ToolboxCard.tsx";

export const Route = createFileRoute("/")({
    head: () => ({
        meta: [
            { title: HELLO_META.title },
            { name: "description", content: HELLO_META.description },
        ],
    }),
    component: HelloPage,
});

function HelloPage() {
    return (
        <div
            data-theme="teal"
            className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-10 sm:px-6"
        >
            {/* Hero */}
            <section className="flex flex-col gap-5">
                <h1 className="font-heading text-4xl leading-none text-theme-text-strong sm:text-5xl">
                    {HERO.title}
                </h1>
                <p className="max-w-2xl font-body text-lg text-theme-text-base">
                    {HERO.bodyPrefix}
                    <strong className="font-semibold text-theme-text-strong">
                        {HERO.bodyBold}
                    </strong>
                    {HERO.bodySuffix}
                </p>
                <div className="flex flex-wrap gap-3">
                    {HERO.ctas.map((c) => (
                        <ExternalLinkButton
                            key={c.label}
                            href={c.href}
                            theme={c.theme}
                        >
                            {c.label}
                        </ExternalLinkButton>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-theme-text-soft">
                    {STATS.map((s, i) => (
                        <span key={s.label} className="flex items-center gap-2">
                            {i > 0 && (
                                <span className="text-theme-text-muted">·</span>
                            )}
                            <strong className="font-subheading text-base text-theme-text-strong">
                                {s.value}
                            </strong>
                            {s.label}
                        </span>
                    ))}
                </div>
            </section>

            {/* Dev kit */}
            <Section title="Dev kit" theme="teal" framed>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    {TOOLBOX.map((item) => (
                        <ToolboxCard key={item.title} item={item} />
                    ))}
                </div>
            </Section>

            {/* Next */}
            <Section title="Next" theme="teal" framed>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {ROADMAP.map((r) => (
                        <Surface
                            key={r.title}
                            variant="card"
                            className="rounded-lg bg-white/80 p-4 transition-colors hover:bg-white/90"
                        >
                            <div className="flex items-center gap-2">
                                <span aria-hidden className="text-xl">
                                    {r.emoji}
                                </span>
                                <h3 className="font-subheading text-base text-theme-text-strong">
                                    {r.title}
                                </h3>
                            </div>
                            <p className="mt-1 text-sm text-theme-text-soft">
                                {r.description}
                            </p>
                        </Surface>
                    ))}
                </div>
            </Section>

            {/* CTA */}
            <section className="flex flex-col gap-4 border-t border-theme-border pt-8">
                <h2 className="font-subheading text-2xl text-theme-text-strong">
                    {CTA.title}
                </h2>
                <p className="max-w-2xl text-theme-text-base">{CTA.body}</p>
                <div className="flex flex-wrap gap-3">
                    <ExternalLinkButton href={CTA.registerHref} theme="green">
                        Register
                    </ExternalLinkButton>
                    <Button as={Link} to="/community" theme="blue">
                        Community
                    </Button>
                    <ExternalLinkButton href={CTA.docsHref} theme="violet">
                        Read the Docs
                    </ExternalLinkButton>
                </div>
            </section>
        </div>
    );
}
