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
import { usePlatformStats } from "../../data/publicStats";

type Feature = {
    title: string;
    body: string;
    catalogCount?: "models" | "agents";
    linkLabel?: string;
    href?: string;
    icon: ComponentType<IconProps>;
};

const BUILD_FOUNDATIONS: Feature[] = [
    {
        title: "One API, every model",
        body: "Add text, image, video, audio and multimodal features through one OpenAI-compatible API.",
        catalogCount: "models",
        linkLabel: "Explore the API",
        href: "https://gen.pollinations.ai/docs",
        icon: GenApiIcon,
    },
    {
        title: "Ready-made agents",
        catalogCount: "agents",
        body: "Call ready-made agents through the same API. Their instructions, models and tools are already connected.",
        linkLabel: "Explore agents",
        href: "https://enter.pollinations.ai/models?category=agent",
        icon: RobotIcon,
    },
    {
        title: "Connect user wallets",
        body: "Let users approve access and a Pollen budget through OAuth 2.1. Their wallet pays for usage in your app.",
        linkLabel: "Integration guide",
        href: "https://gen.pollinations.ai/docs#tag/connect-user-wallets",
        icon: WalletIcon,
    },
];

const BUILD_TOOLS: Feature[] = [
    {
        title: "Media storage",
        body: "Upload images, audio and video for use in apps and workflows. Links are public, with a renewable 30-day storage period.",
        linkLabel: "Media storage guide",
        href: "https://gen.pollinations.ai/docs#tag/media-storage",
        icon: CloudUploadIcon,
    },
    {
        title: "Pollinations CLI",
        body: "Generate text, images, audio and video, transcribe audio, and manage keys, models and agents from your terminal.",
        linkLabel: "CLI guide",
        href: "https://gen.pollinations.ai/docs#tag/cli",
        icon: TerminalIcon,
    },
    {
        title: "MCP tools",
        body: "Give agents tools for generation, search, media processing and connected apps. Use them from clients that support Streamable HTTP.",
        linkLabel: "Explore MCP servers",
        href: "https://enter.pollinations.ai/models?category=mcp",
        icon: McpIcon,
    },
];

const BUILD_FEATURES = [...BUILD_FOUNDATIONS, ...BUILD_TOOLS];

const PUBLISH_FEATURES: Feature[] = [
    {
        title: "List your app",
        body: "Add your app to the catalog for discovery. Connect user wallets and enable app earnings to earn Pollen from their usage.",
        icon: AppIcon,
    },
    {
        title: "Publish a model",
        body: "Publish your model with your own pricing and earn Pollen when other people use it.",
        icon: BeakerIcon,
    },
    {
        title: "Publish an agent",
        body: "Share a prompt or code agent that runs on the user’s Pollen. Agent earnings are coming soon.",
        icon: RobotIcon,
    },
];

function FeatureCard({ feature, count }: { feature: Feature; count?: number }) {
    const Icon = feature.icon;

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

            <Text size="sm">{feature.body}</Text>

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

    return (
        <section className={cn("flex flex-col gap-10", className)}>
            <FeatureGroup
                eyebrow="Build"
                title="Tools for production AI apps"
                description="Build with models and agents, connect user wallets, and add tools through one platform."
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
                        />
                    ))}
                </div>
            </FeatureGroup>

            <Surface
                variant="card"
                className="flex flex-col gap-6 overflow-hidden p-5 sm:p-6"
            >
                <ContentHeader
                    eyebrow="Quests"
                    title="Build something. Earn your next generation."
                    subtitle="Complete Quests to earn Pollen for AI usage. Some models require Paid Pollen."
                />
                <ExternalLinkButton
                    href="https://enter.pollinations.ai/quests"
                    size="md"
                    intent="brand"
                    className="self-start whitespace-nowrap"
                >
                    Explore Quests
                </ExternalLinkButton>
                <img
                    src={scene.src}
                    srcSet={scene.srcSet}
                    sizes="(max-width: 1240px) 100vw, 1100px"
                    alt=""
                    aria-hidden="true"
                    width={2048}
                    height={1024}
                    loading="lazy"
                    decoding="async"
                    className="first-call-scene pointer-events-none -mx-5 -mb-5 h-auto w-[calc(100%+2.5rem)] max-w-none select-none sm:-mx-6 sm:-mb-6 sm:w-[calc(100%+3rem)]"
                />
            </Surface>

            <FeatureGroup
                eyebrow="Publish and earn"
                title="Bring what you build to the ecosystem"
                description="Share your apps, models and agents with people ready to use them."
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
