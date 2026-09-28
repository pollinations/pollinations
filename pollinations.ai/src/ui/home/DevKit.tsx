import {
    AppIcon,
    BeakerIcon,
    BookIcon,
    CloudUploadIcon,
    ContentHeader,
    cn,
    ExternalLinkButton,
    GenApiIcon,
    Heading,
    type IconProps,
    McpIcon,
    RobotIcon,
    Surface,
    TerminalIcon,
    Text,
    WalletIcon,
} from "@pollinations/ui";
import type { ComponentType, ReactNode } from "react";
import { useArt } from "../../art";
import { describeModelKinds, usePlatformStats } from "../../data/publicStats";

type Feature = {
    title: string;
    /** Static copy, or copy built from the live catalog's model kinds. */
    body: string | ((modelKinds: string | null) => string);
    catalogCount?: "models" | "agents";
    linkLabel?: string;
    href?: string;
    icon: ComponentType<IconProps>;
};

const BUILD_FOUNDATIONS: Feature[] = [
    {
        title: "Official and community models",
        body: (modelKinds) =>
            `${modelKinds ? `${modelKinds}. ` : ""}OpenAI-compatible, with plain GET URLs for quick calls.`,
        catalogCount: "models",
        linkLabel: "Explore the API",
        href: "https://gen.pollinations.ai/docs",
        icon: GenApiIcon,
    },
    {
        title: "Ready-made agents",
        catalogCount: "agents",
        body: "Call an agent the way you call a model. Instructions and any tools come wired in; you pay for what it uses.",
        linkLabel: "Explore agents",
        href: "https://enter.pollinations.ai/models?category=agent",
        icon: RobotIcon,
    },
    {
        title: "Connect user wallets",
        body: "Users sign in with Pollinations and approve a Pollen budget. Their wallet, not yours, pays for what they use.",
        linkLabel: "Integration guide",
        href: "https://gen.pollinations.ai/docs#tag/connect-user-wallets",
        icon: WalletIcon,
    },
];

const BUILD_TOOLS: Feature[] = [
    {
        title: "Media storage",
        body: "Upload images, audio and video. Public links, kept 30 days and renewable.",
        linkLabel: "Media storage guide",
        href: "https://gen.pollinations.ai/docs#tag/media-storage",
        icon: CloudUploadIcon,
    },
    {
        title: "Pollinations CLI",
        body: "Generate from your terminal with polli. Manage keys, models and agents, and track usage and earnings.",
        linkLabel: "CLI guide",
        href: "https://gen.pollinations.ai/docs#tag/cli",
        icon: TerminalIcon,
    },
    {
        title: "Hosted MCP tools",
        body: "Web search, media editing, a private computer, and the GitHub, Gmail or Slack accounts users connect—for your agents and compatible MCP clients.",
        linkLabel: "Explore MCP servers",
        href: "https://enter.pollinations.ai/models?category=mcp",
        icon: McpIcon,
    },
];

const BUILD_FEATURES = [...BUILD_FOUNDATIONS, ...BUILD_TOOLS];

const PUBLISH_FEATURES: Feature[] = [
    {
        title: "List your app",
        body: "Submit it for review to join the Apps catalog. To earn, connect user wallets and turn on app earnings.",
        icon: AppIcon,
    },
    {
        title: "Publish a model",
        body: "Connect an endpoint you run and set your price. Earn Pollen when others call it.",
        icon: BeakerIcon,
    },
    {
        title: "Publish an agent",
        body: "Combine a model, instructions and hosted tools, or ship an agent.ts from GitHub. We run it; earnings are coming soon.",
        icon: RobotIcon,
    },
];

function FeatureCard({
    feature,
    count,
    modelKinds = null,
}: {
    feature: Feature;
    count?: number;
    modelKinds?: string | null;
}) {
    const Icon = feature.icon;
    const body =
        typeof feature.body === "function"
            ? feature.body(modelKinds)
            : feature.body;

    return (
        <Surface
            variant="card"
            className="flex h-full flex-col gap-5 p-5 sm:p-6"
        >
            <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-theme-bg-subtle text-theme-text-strong">
                    <Icon className="size-6" />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                    <Heading as="h3" size="card">
                        {feature.title}
                    </Heading>
                    {feature.catalogCount ? (
                        <Text
                            size="xs"
                            tone="muted"
                            className="min-h-4 tabular-nums"
                        >
                            {count === undefined
                                ? null
                                : `${count.toLocaleString()} ${feature.catalogCount}`}
                        </Text>
                    ) : null}
                </div>
            </div>

            <Text size="sm">{body}</Text>

            {feature.href && feature.linkLabel ? (
                <ExternalLinkButton
                    href={feature.href}
                    size="md"
                    intent="neutral"
                    icon={
                        feature.href.startsWith(
                            "https://gen.pollinations.ai/docs",
                        ) ? (
                            <BookIcon
                                aria-hidden="true"
                                className="size-4 shrink-0"
                            />
                        ) : undefined
                    }
                    className="max-w-full self-start whitespace-normal text-left"
                >
                    {feature.linkLabel}
                </ExternalLinkButton>
            ) : null}
        </Surface>
    );
}

function FeatureGroup({
    eyebrow,
    title,
    description,
    children,
}: {
    eyebrow: string;
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <section className="flex flex-col gap-5">
            <ContentHeader
                eyebrow={eyebrow}
                title={title}
                subtitle={description}
                className="px-1"
            />
            {children}
        </section>
    );
}

export function DevKit({ className }: { className?: string }) {
    const scene = useArt("home", "quests");
    const { data } = usePlatformStats();
    const modelKinds = data ? describeModelKinds(data.byCategory) : null;

    return (
        <section className={cn("flex flex-col gap-10", className)}>
            <FeatureGroup
                eyebrow="Build"
                title="Pick the pieces you need."
                description="Models and agents from us and the community, plus the tools and wallets around them."
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {BUILD_FEATURES.map((feature) => (
                        <FeatureCard
                            key={feature.title}
                            feature={feature}
                            count={
                                feature.catalogCount
                                    ? data?.[feature.catalogCount]
                                    : undefined
                            }
                            modelKinds={modelKinds}
                        />
                    ))}
                </div>
            </FeatureGroup>

            <Surface
                variant="card"
                className="relative flex flex-col gap-6 overflow-hidden p-5 sm:p-6 lg:min-h-72 lg:justify-center"
            >
                <div className="relative z-10 flex flex-col gap-6 lg:max-w-[48%]">
                    <ContentHeader
                        eyebrow="Quests"
                        title="Build something. Earn your next generation."
                        subtitle="Earn Quest Pollen by solving GitHub Quests, trying models, or building an app or agent. Many models need Paid Pollen."
                    />
                    <ExternalLinkButton
                        href="https://enter.pollinations.ai/quests"
                        size="lg"
                        intent="brand"
                        className="self-start whitespace-nowrap"
                    >
                        Explore Quests
                    </ExternalLinkButton>
                </div>
                <img
                    src={scene.src}
                    srcSet={scene.srcSet}
                    sizes="(min-width: 1240px) 550px, (min-width: 1024px) 50vw, 100vw"
                    alt=""
                    aria-hidden="true"
                    width={2048}
                    height={1024}
                    loading="lazy"
                    decoding="async"
                    className="first-call-scene pointer-events-none -mx-5 -mb-5 h-auto w-[calc(100%+2.5rem)] max-w-none select-none sm:-mx-6 sm:-mb-6 sm:w-[calc(100%+3rem)] lg:absolute lg:right-0 lg:bottom-0 lg:m-0 lg:h-full lg:w-1/2 lg:object-contain lg:object-bottom"
                />
            </Surface>

            <FeatureGroup
                eyebrow="Publish and earn"
                title="Publish where people already spend Pollen."
                description="You bring the model, agent or app; we handle sign-in, billing and discovery. Public models and agents need publisher access (alpha)."
            >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {PUBLISH_FEATURES.map((feature) => (
                        <FeatureCard key={feature.title} feature={feature} />
                    ))}
                </div>
                <ExternalLinkButton
                    href="https://enter.pollinations.ai"
                    size="lg"
                    intent="brand"
                    className="self-start whitespace-nowrap"
                >
                    Open dashboard
                </ExternalLinkButton>
            </FeatureGroup>
        </section>
    );
}
