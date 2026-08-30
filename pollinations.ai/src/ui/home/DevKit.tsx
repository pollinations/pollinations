import {
    AppIcon,
    BeakerIcon,
    Chip,
    CloudUploadIcon,
    ExternalLinkButton,
    GenApiIcon,
    Heading,
    type IconProps,
    LogInIcon,
    McpIcon,
    RobotIcon,
    SproutIcon,
    Surface,
    TerminalIcon,
    Text,
    WalletIcon,
} from "@pollinations/ui";
import type { ComponentType, ReactNode } from "react";
import { usePlatformStats } from "../../data/publicStats";

type Feature = {
    label: string;
    title: string;
    body: string | ((modelCount: number | null) => string);
    linkLabel: string;
    href: string;
    icon: ComponentType<IconProps>;
    emphasized?: boolean;
};

const BUILD_FOUNDATIONS: Feature[] = [
    {
        label: "API",
        title: "One API, every model",
        body: (modelCount) =>
            `Build text, image, video, audio and multimodal features through one OpenAI-compatible API${modelCount ? ` across ${modelCount} models` : ""}.`,
        linkLabel: "Explore the API",
        href: "https://gen.pollinations.ai/docs",
        icon: GenApiIcon,
    },
    {
        label: "Wallet",
        title: "Connect user wallets",
        body: "Let users bring their own Pollen, choose a budget, expiry and access, and pay for their own usage. You avoid payment infrastructure and can earn from every connected call.",
        linkLabel: "Connect a wallet",
        href: "https://gen.pollinations.ai/docs#tag/connect-user-wallets",
        icon: WalletIcon,
        emphasized: true,
    },
    {
        label: "OAuth 2.1",
        title: "Pollinations Login",
        body: "Add Pollinations Login to your app. Users connect their account and approve profile and usage access through a standard OAuth flow.",
        linkLabel: "Add Pollinations Login",
        href: "https://gen.pollinations.ai/docs#tag/connect-user-wallets",
        icon: LogInIcon,
    },
];

const BUILD_TOOLS: Feature[] = [
    {
        label: "Media",
        title: "Media hosting",
        body: "Upload generated images, audio and video and receive reusable URLs for apps, agents and workflows.",
        linkLabel: "Store media",
        href: "https://gen.pollinations.ai/docs#tag/media-storage",
        icon: CloudUploadIcon,
    },
    {
        label: "Terminal",
        title: "Pollinations CLI",
        body: "Generate every modality, inspect models and manage access, published models and agents from the shell.",
        linkLabel: "Use the CLI",
        href: "https://gen.pollinations.ai/docs#tag/cli",
        icon: TerminalIcon,
    },
    {
        label: "AI tools",
        title: "Pollinations MCP",
        body: "Bring generation, media, model discovery and account tools into Codex, Claude, Cursor and any MCP-capable product.",
        linkLabel: "Connect the MCP",
        href: "https://gen.pollinations.ai/docs#tag/mcp-server",
        icon: McpIcon,
    },
];

const PUBLISH_FEATURES: Feature[] = [
    {
        label: "Apps",
        title: "Publish an app",
        body: "Join the app directory, reach the Pollinations community and earn from connected usage.",
        linkLabel: "Publish an app",
        href: "https://github.com/pollinations/pollinations/issues/new?template=APP-SUBMISSION.yml",
        icon: AppIcon,
    },
    {
        label: "Models",
        title: "Publish a model",
        body: "Connect your endpoint privately, or publish it in the catalog with your own price and earn from usage.",
        linkLabel: "Publish a model",
        href: "https://gen.pollinations.ai/docs#tag/publish-a-model",
        icon: BeakerIcon,
    },
    {
        label: "Agents",
        title: "Publish an agent",
        body: "Combine instructions, a base model and Pollinations tools into a reusable model without hosting an agent server.",
        linkLabel: "Publish an agent",
        href: "https://gen.pollinations.ai/docs#tag/publish-an-agent",
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
            variant={feature.emphasized ? "card-themed" : "card"}
            className="flex h-full flex-col gap-5 p-5 sm:p-6"
        >
            <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-theme-bg-subtle text-theme-text-strong">
                    <Icon className="size-6" />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                    <Chip size="sm" intent="neutral" className="self-start">
                        {feature.label}
                    </Chip>
                    <Heading as="h3" size="card" className="whitespace-nowrap">
                        {feature.title}
                    </Heading>
                </div>
            </div>

            <Text size="sm" className="flex-1">
                {body}
            </Text>

            <ExternalLinkButton
                href={feature.href}
                size="sm"
                appearance="raised"
                className="self-start whitespace-nowrap"
            >
                {feature.linkLabel}
            </ExternalLinkButton>
        </Surface>
    );
}

function FeatureGroup({
    title,
    description,
    children,
}: {
    title: string;
    description: string;
    children: ReactNode;
}) {
    const titleId = `${title.toLowerCase().replace(/\s+/g, "-")}-title`;

    return (
        <section className="flex flex-col gap-4" aria-labelledby={titleId}>
            <header className="px-1">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                    <Heading
                        as="h2"
                        size="section"
                        id={titleId}
                        className="shrink-0"
                    >
                        {title}
                    </Heading>
                    <Text size="sm" tone="muted">
                        {description}
                    </Text>
                </div>
            </header>
            {children}
        </section>
    );
}

export function DevKit() {
    const { data } = usePlatformStats();
    const modelCount = data?.models ?? null;

    return (
        <section className="flex flex-col gap-10">
            <FeatureGroup
                title="Start free"
                description="Earn Pollen through Quests, then make your first API call."
            >
                <Surface
                    variant="panel"
                    className="grid items-center gap-6 sm:grid-cols-[auto_1fr] lg:grid-cols-[auto_1fr_auto]"
                >
                    <div className="flex size-12 items-center justify-center rounded-xl bg-theme-bg-active text-theme-text-strong">
                        <SproutIcon className="size-7" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <Heading as="h3" size="card">
                            Win Pollen with Quests
                        </Heading>
                        <Text size="sm">
                            Contribute to Pollinations, earn free Pollen, and
                            spend it across every model from your own API key.
                        </Text>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-1 lg:justify-end">
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
                            Get an API key
                        </ExternalLinkButton>
                    </div>
                </Surface>
            </FeatureGroup>

            <FeatureGroup
                title="Build"
                description="The foundations and tools for production AI apps."
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {BUILD_FOUNDATIONS.map((feature) => (
                        <FeatureCard
                            key={feature.label}
                            feature={feature}
                            modelCount={modelCount}
                        />
                    ))}
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {BUILD_TOOLS.map((feature) => (
                        <FeatureCard
                            key={feature.label}
                            feature={feature}
                            modelCount={modelCount}
                        />
                    ))}
                </div>
            </FeatureGroup>

            <FeatureGroup
                title="Publish and earn"
                description="Turn apps, models and agents into products people can discover and use."
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {PUBLISH_FEATURES.map((feature) => (
                        <FeatureCard
                            key={feature.label}
                            feature={feature}
                            modelCount={modelCount}
                        />
                    ))}
                </div>
            </FeatureGroup>
        </section>
    );
}
