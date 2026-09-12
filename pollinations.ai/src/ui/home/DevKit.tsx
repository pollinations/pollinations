import {
    AppIcon,
    BeakerIcon,
    CloudUploadIcon,
    ContentHeader,
    cn,
    ExternalLinkButton,
    GenApiIcon,
    Heading,
    type IconProps,
    McpIcon,
    RobotIcon,
    SproutIcon,
    Surface,
    TerminalIcon,
    Text,
    useColorMode,
    WalletIcon,
} from "@pollinations/ui";
import type { ComponentType, ReactNode } from "react";
import { usePlatformStats } from "../../data/publicStats";

type Feature = {
    title: string;
    body: string | ((modelCount: number | null) => string);
    linkLabel?: string;
    href?: string;
    icon: ComponentType<IconProps>;
};

const BUILD_FOUNDATIONS: Feature[] = [
    {
        title: "One API, every model",
        body: (modelCount) => {
            const threshold = modelCount
                ? Math.floor((modelCount - 1) / 50) * 50
                : 0;
            const catalogSize =
                modelCount === null
                    ? "hundreds of models"
                    : threshold > 0
                      ? `more than ${threshold.toLocaleString()} models`
                      : `${modelCount.toLocaleString()} models`;

            return `Build text, image, video, audio and multimodal features through one OpenAI-compatible API across ${catalogSize}.`;
        },
        linkLabel: "Explore the API",
        href: "https://gen.pollinations.ai/docs",
        icon: GenApiIcon,
    },
    {
        title: "Ready-made agents",
        body: "Use agents that already combine instructions, models and tools through the same OpenAI-compatible API.",
        linkLabel: "Explore agents",
        href: "https://enter.pollinations.ai/models?scope=community&category=agent",
        icon: RobotIcon,
    },
    {
        title: "Connect Pollinations accounts",
        body: "Let users connect securely through OAuth 2.1, approve access and a spending budget, and pay with their own Pollen—without you building account or payment infrastructure.",
        linkLabel: "Connect an account",
        href: "https://gen.pollinations.ai/docs#tag/connect-user-wallets",
        icon: WalletIcon,
    },
];

const BUILD_TOOLS: Feature[] = [
    {
        title: "Media hosting",
        body: "Upload generated images, audio and video and receive reusable URLs for apps, agents and workflows.",
        linkLabel: "Store media",
        href: "https://gen.pollinations.ai/docs#tag/media-storage",
        icon: CloudUploadIcon,
    },
    {
        title: "Pollinations CLI",
        body: "Generate every modality, inspect models and manage access, published models and agents from the shell.",
        linkLabel: "Use the CLI",
        href: "https://gen.pollinations.ai/docs#tag/cli",
        icon: TerminalIcon,
    },
    {
        title: "MCP connectors",
        body: "Connect generation, media processing and web search tools to agents—or use them from any MCP-compatible product.",
        linkLabel: "Explore MCPs",
        href: "https://enter.pollinations.ai/models?category=mcp",
        icon: McpIcon,
    },
];

const BUILD_FEATURES = [...BUILD_FOUNDATIONS, ...BUILD_TOOLS];

const PUBLISH_FEATURES: Feature[] = [
    {
        title: "Publish an app",
        body: "Add your app to the Pollinations catalog, reach new users, and earn from connected usage.",
        icon: AppIcon,
    },
    {
        title: "Publish a model",
        body: "Add your model to the community catalog, set its price, and earn whenever builders use it.",
        icon: BeakerIcon,
    },
    {
        title: "Publish an agent",
        body: "Combine a system prompt, base model, and MCP tools into an agent people can discover and use—and earn whenever it runs.",
        icon: RobotIcon,
    },
];

function FeatureCard({
    feature,
    modelCount,
}: {
    feature: Feature;
    modelCount: number | null;
}) {
    const Icon = feature.icon;
    const body =
        typeof feature.body === "function"
            ? feature.body(modelCount)
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
                <Heading as="h3" size="card">
                    {feature.title}
                </Heading>
            </div>

            <Text size="sm">{body}</Text>

            {feature.href && feature.linkLabel ? (
                <ExternalLinkButton
                    href={feature.href}
                    size="sm"
                    appearance="raised"
                    className="self-start whitespace-nowrap"
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
    const { isDark } = useColorMode();
    const scene = `/tool-scenes/earn-pollen-magic-${isDark ? "night" : "day"}`;
    const { data } = usePlatformStats();
    const modelCount = data?.models ?? null;

    return (
        <section className={cn("flex flex-col gap-10", className)}>
            <Surface
                variant="card"
                className="flex flex-col gap-6 overflow-hidden p-5 sm:p-6"
            >
                <ContentHeader
                    eyebrow="Start free"
                    title="Make your first API call"
                />
                <div className="grid items-end gap-6 lg:grid-cols-[1fr_auto]">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-theme-bg-active text-theme-text-strong">
                                <SproutIcon className="size-6" />
                            </div>
                            <Heading as="h3" size="card">
                                Earn Pollen with Quests
                            </Heading>
                        </div>
                        <Text size="sm">
                            Complete a Quest—a small contribution to the
                            project—and spend the Pollen on any model with your
                            own secret key.
                        </Text>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                        <ExternalLinkButton
                            href="https://enter.pollinations.ai/quests"
                            size="sm"
                            appearance="raised"
                            className="whitespace-nowrap"
                        >
                            Browse Quests
                        </ExternalLinkButton>
                        <ExternalLinkButton
                            href="https://enter.pollinations.ai/keys"
                            size="sm"
                            appearance="raised"
                            className="whitespace-nowrap"
                        >
                            Create a secret key
                        </ExternalLinkButton>
                    </div>
                </div>
                <img
                    src={`${scene}.webp`}
                    srcSet={`${scene}-1024.webp 1024w, ${scene}.webp 2048w`}
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
                eyebrow="Build"
                title="Tools for production AI apps"
                description="Build with models and agents, connect users, and add tools without managing the infrastructure."
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {BUILD_FEATURES.map((feature) => (
                        <FeatureCard
                            key={feature.title}
                            feature={feature}
                            modelCount={modelCount}
                        />
                    ))}
                </div>
            </FeatureGroup>

            <FeatureGroup
                eyebrow="Publish and earn"
                title="Bring what you build to the ecosystem"
                description="Publish apps, models and agents for people to discover, use and build on."
            >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {PUBLISH_FEATURES.map((feature) => (
                        <FeatureCard
                            key={feature.title}
                            feature={feature}
                            modelCount={modelCount}
                        />
                    ))}
                </div>
                <ExternalLinkButton
                    href="https://enter.pollinations.ai"
                    size="lg"
                    appearance="raised"
                    className="self-start whitespace-nowrap"
                >
                    Start publishing
                </ExternalLinkButton>
            </FeatureGroup>
        </section>
    );
}
