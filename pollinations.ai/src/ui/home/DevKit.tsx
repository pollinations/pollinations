import type { ModelCategory } from "@pollinations/sdk";
import {
    AppIcon,
    AudioIcon,
    BeakerIcon,
    BookIcon,
    ChatIcon,
    CloudUploadIcon,
    ContentHeader,
    cn,
    ExternalLinkButton,
    Heading,
    type IconProps,
    IconTile,
    ImageIcon,
    LinkCard,
    LockIcon,
    McpIcon,
    RobotIcon,
    SearchIcon,
    SproutIcon,
    Surface,
    TerminalIcon,
    Text,
    VideoIcon,
    WalletIcon,
} from "@pollinations/ui";
import { modalityBgVar, modalityTextColor } from "@pollinations/ui/gen";
import { PaidChip } from "@pollinations/ui/wallet";
import type { ComponentType, ReactNode } from "react";
import { LINKS } from "../../copy/content/socialLinks";
import { useMcpServers, usePlatformStats } from "../../data/publicStats";

type Feature = {
    title: string;
    /** Short copy; wrap the phrase worth skimming in <Em>. */
    body: ReactNode;
    /** A line under the title: a live catalog count, or a fixed note. */
    catalogCount?: "agents";
    note?: string;
    /** Pills shown between the header and the body. */
    chips?: string[];
    links: { label: string; href: string }[];
    icon: ComponentType<IconProps>;
    /** Live detail shown between the header and the body. */
    detail?: ComponentType;
};

/** The phrase a skimming reader should catch in a card's copy. */
function Em({ children }: { children: ReactNode }) {
    return (
        <Text as="strong" size="sm" tone="strong" weight="semibold">
            {children}
        </Text>
    );
}

// Agents and tools lead, after the Models section, mirroring the headline's
// models, agents, tools.
const BUILD_FEATURES: Feature[] = [
    {
        title: "Agents",
        catalogCount: "agents",
        chips: ["Prompt + tools", "Code (agent.ts)", "Your own server"],
        body: (
            <>
                <Em>Call an agent like a model</Em>, or build your own. We host
                prompt and code agents. <Em>Sandboxes</Em> for long-running
                agents are coming soon.
            </>
        ),
        links: [
            {
                label: "Explore agents",
                href: "https://enter.pollinations.ai/models?category=agent",
            },
        ],
        icon: RobotIcon,
    },
    {
        title: "Hosted MCP tools",
        body: (
            <>
                <Em>A private computer, web search and connected apps</Em> like
                Gmail. Use them in your agents or any MCP client.
            </>
        ),
        links: [
            {
                label: "Explore MCP servers",
                href: "https://enter.pollinations.ai/models?category=mcp",
            },
        ],
        icon: McpIcon,
        detail: McpServers,
    },
    {
        title: "Pollinations CLI",
        note: "For humans, AI agents and everything in between",
        chips: ["npx @pollinations/cli"],
        body: (
            <>
                <Em>Start with one of these tasks</Em>, then explore keys,
                models, usage and earnings.
            </>
        ),
        links: [
            {
                label: "Connect OpenCode",
                href: "https://github.com/pollinations/pollinations/blob/main/packages/polli-cli/TASKS.md#connect-opencode",
            },
            {
                label: "Generate an image",
                href: "https://github.com/pollinations/pollinations/blob/main/packages/polli-cli/TASKS.md#generate-an-image-from-the-terminal",
            },
        ],
        icon: TerminalIcon,
    },
    {
        title: "Users pay",
        body: (
            <>
                Your users sign in with Pollinations and set a spending limit.{" "}
                <Em>They pay for their own usage.</Em>
            </>
        ),
        links: [
            {
                label: "Integration guide",
                href: "https://gen.pollinations.ai/docs#tag/connect-user-wallets",
            },
        ],
        icon: WalletIcon,
    },
    {
        title: "Media storage",
        body: (
            <>
                <Em>Upload images, audio and video</Em> to get a link for model
                calls. Generated files get one too.
            </>
        ),
        links: [
            {
                label: "Media storage guide",
                href: "https://gen.pollinations.ai/docs#tag/media-storage",
            },
        ],
        icon: CloudUploadIcon,
    },
    {
        title: "Safety checks",
        chips: ["Privacy", "Secrets", "NSFW", "Prompt attacks"],
        body: (
            <>
                <Em>Remove personal data and keys</Em>, or{" "}
                <Em>block unsafe prompts</Em>, before they reach the model. Turn
                checks on per request.
            </>
        ),
        links: [
            {
                label: "Safety guide",
                href: "https://gen.pollinations.ai/docs#tag/safety",
            },
        ],
        icon: LockIcon,
    },
];

/** Most-used kind first; counts and names come from the live catalog. */
const MODEL_KINDS: {
    label: string;
    icon: ComponentType<IconProps>;
    /** Catalog categories; the first one is the enter filter and the color. */
    categories: ModelCategory[];
}[] = [
    { label: "Image", icon: ImageIcon, categories: ["image"] },
    { label: "Text", icon: ChatIcon, categories: ["text"] },
    { label: "Audio", icon: AudioIcon, categories: ["audio", "realtime"] },
    { label: "Video & 3D", icon: VideoIcon, categories: ["video", "3d"] },
    { label: "Embeddings", icon: SearchIcon, categories: ["embedding"] },
];

const PUBLISH_FEATURES: Feature[] = [
    {
        title: "List your app",
        body: (
            <>
                Submit it for review to join the Apps catalog, then{" "}
                <Em>turn on earnings</Em>.
            </>
        ),
        links: [{ label: "Submit your app", href: LINKS.githubSubmitApp }],
        icon: AppIcon,
    },
    {
        title: "Publish a model",
        body: (
            <>
                Connect your endpoint and <Em>set your price</Em>. Each call
                adds Pollen to your balance.
            </>
        ),
        links: [
            {
                label: "Add a model",
                href: "https://enter.pollinations.ai/my-models",
            },
        ],
        icon: BeakerIcon,
    },
    {
        title: "Publish an agent",
        body: (
            <>
                Add your agent to the catalog so <Em>anyone can call it</Em>.
            </>
        ),
        links: [
            {
                label: "Create an agent",
                href: "https://enter.pollinations.ai/my-models",
            },
        ],
        icon: RobotIcon,
    },
];

function FeatureCard({
    feature,
    countLabel,
}: {
    feature: Feature;
    countLabel?: string;
}) {
    const Detail = feature.detail;

    return (
        <Surface
            variant="card"
            className="flex h-full flex-col gap-5 p-5 sm:p-6"
        >
            <div className="flex items-center gap-3">
                <IconTile icon={feature.icon} />
                <div className="flex min-w-0 flex-col gap-1">
                    <Heading as="h3" size="card">
                        {feature.title}
                    </Heading>
                    {feature.catalogCount || feature.note ? (
                        <Text
                            size="xs"
                            tone="muted"
                            className="min-h-4 tabular-nums"
                        >
                            {countLabel ?? feature.note}
                        </Text>
                    ) : null}
                </div>
            </div>

            {feature.chips ? <ChipList names={feature.chips} /> : null}
            {Detail ? <Detail /> : null}

            <Text size="sm">{feature.body}</Text>

            <div className="mt-auto flex flex-wrap gap-2">
                {feature.links.map((link) => (
                    <ExternalLinkButton
                        key={link.href}
                        href={link.href}
                        size="md"
                        intent="neutral"
                        icon={
                            link.href.startsWith(
                                "https://gen.pollinations.ai/docs",
                            ) ? (
                                <BookIcon
                                    aria-hidden="true"
                                    className="size-4 shrink-0"
                                />
                            ) : undefined
                        }
                        className="max-w-full whitespace-normal text-left"
                    >
                        {link.label}
                    </ExternalLinkButton>
                ))}
            </div>
        </Surface>
    );
}

/**
 * The models section: one card per official kind, then one for the
 * community, each linking to the matching filter on enter. Laid out like the
 * wallet's balance cards, tinted with the modality colors and the wallet's
 * gold. Counts and the two newest models are live.
 */
function Models() {
    const { data: stats } = usePlatformStats();
    const cards = [
        ...MODEL_KINDS.map(({ label, icon, categories }) => ({
            label,
            icon,
            href: `https://enter.pollinations.ai/models?category=${categories[0]}`,
            count: stats
                ? categories.reduce(
                      (sum, category) => sum + (stats.kinds[category] ?? 0),
                      0,
                  )
                : null,
            names: categories.flatMap(
                (category) => stats?.newest[category] ?? [],
            ),
            color: modalityTextColor(categories[0]),
            background: modalityBgVar(categories[0]),
        })),
        {
            label: "Community",
            icon: SproutIcon,
            href: "https://enter.pollinations.ai/models?q=source:community",
            count: stats?.community ?? null,
            names: stats?.newest.community ?? [],
            // The wallet's Paid card colors: the brand gold, softened.
            color: "var(--polli-color-paid-deep)",
            background: "var(--polli-color-paid-pale)",
        },
    ];

    return (
        <FeatureGroup
            title="Models"
            description="From official providers and the community. Add yours too."
        >
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {cards.map(
                    ({
                        label,
                        icon: Icon,
                        href,
                        count,
                        names,
                        color,
                        background,
                    }) => (
                        <li key={label}>
                            <LinkCard
                                href={href}
                                surfaceClassName="gap-0 p-3.5 sm:p-5"
                                tint={background}
                            >
                                <span
                                    className="flex items-center gap-2"
                                    style={{ color }}
                                >
                                    <Icon
                                        aria-hidden="true"
                                        className="size-3.5 shrink-0"
                                    />
                                    <span className="font-bold text-sm uppercase tracking-wide">
                                        {label}
                                    </span>
                                </span>
                                <span
                                    className="mt-1 min-h-9 font-heading text-4xl leading-none tabular-nums sm:min-h-12 sm:text-5xl"
                                    style={{ color }}
                                >
                                    {count}
                                </span>
                                <Text size="sm" tone="muted" className="mt-1.5">
                                    {names.length > 0 ? (
                                        <>
                                            <span
                                                className="font-semibold"
                                                style={{ color }}
                                            >
                                                Latest:
                                            </span>{" "}
                                            {names.slice(0, 2).join(" · ")}
                                        </>
                                    ) : null}
                                </Text>
                            </LinkCard>
                        </li>
                    ),
                )}
            </ul>
            <ExternalLinkButton
                href="https://gen.pollinations.ai/docs"
                size="md"
                intent="neutral"
                icon={
                    <BookIcon aria-hidden="true" className="size-4 shrink-0" />
                }
                className="self-start"
            >
                Explore the API
            </ExternalLinkButton>
        </FeatureGroup>
    );
}

/** The hosted servers, live from gen. Nothing shows until they load. */
function McpServers() {
    const { data: servers } = useMcpServers();
    if (servers.length === 0) return null;
    return <ChipList names={servers} />;
}

function ChipList({ names }: { names: string[] }) {
    return (
        <ul className="flex flex-wrap gap-2">
            {names.map((name) => (
                <li key={name}>
                    <PaidChip size="md">{name}</PaidChip>
                </li>
            ))}
        </ul>
    );
}

function FeatureGroup({
    title,
    description,
    children,
}: {
    title: string;
    description?: string;
    children: ReactNode;
}) {
    return (
        <section className="flex flex-col gap-5">
            <ContentHeader
                eyebrow={null}
                title={title}
                subtitle={description}
                className="px-1"
            />
            {children}
        </section>
    );
}

export function DevKit({ className }: { className?: string }) {
    const { data } = usePlatformStats();

    return (
        <section className={cn("flex flex-col gap-10", className)}>
            <Models />

            <FeatureGroup
                title="Pick the pieces you need."
                description="Agents and hosted tools, plus storage, billing and safety."
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {BUILD_FEATURES.map((feature) => (
                        <FeatureCard
                            key={feature.title}
                            feature={feature}
                            countLabel={
                                data && feature.catalogCount === "agents"
                                    ? data.agents.toLocaleString()
                                    : undefined
                            }
                        />
                    ))}
                </div>
            </FeatureGroup>

            <FeatureGroup
                title="Put your model, agent or app in front of our users."
                description="You build it; we handle sign-in, billing and discovery. Publishing models and agents is in alpha and needs publisher access."
            >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {PUBLISH_FEATURES.map((feature) => (
                        <FeatureCard key={feature.title} feature={feature} />
                    ))}
                </div>
            </FeatureGroup>
        </section>
    );
}
