import { type ModelCatalogItem, pricingEntries } from "@pollinations/sdk";
import {
    useAccountKey,
    useAccountKeyUsage,
    useAccountProfile,
    useAuthActions,
    useModelCatalog,
} from "@pollinations/sdk/react";
import {
    Alert,
    ButtonGroup,
    Chip,
    ExternalLinkButton,
    Surface,
    Table,
    TableBody,
    TableCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import { UserAvatar } from "@pollinations/ui/auth/sdk";
import {
    categoryLabel,
    ModalityChip,
    ModalityDot,
    ModalityTab,
    ModelSelector,
    type ModelSelectorCategory,
} from "@pollinations/ui/gen";
import { type ReactNode, useState } from "react";
import { GEN_BASE_URL } from "../config";
import { PageIntro, SectionHeader } from "./reference-layout";

function AccountSummaryText({
    value,
    isLoading,
    fallback = "Not shared",
}: {
    value: string | null | undefined;
    isLoading?: boolean;
    fallback?: string;
}) {
    return (
        <span className="min-w-0 truncate text-sm font-medium text-theme-text-base">
            {isLoading ? "Loading..." : value || fallback}
        </span>
    );
}

function CatalogValue({
    children,
    mono = false,
}: {
    children: ReactNode;
    mono?: boolean;
}) {
    return (
        <span
            className={`min-w-0 break-words text-sm text-theme-text-base [overflow-wrap:anywhere] ${mono ? "break-all font-mono" : ""}`}
        >
            {children}
        </span>
    );
}

function CatalogCell({ children }: { children: ReactNode }) {
    return (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {children}
        </div>
    );
}

function CatalogTableRow({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <TableRow>
            <TableCell
                muted
                className="w-40 align-top font-medium whitespace-nowrap"
            >
                {label}
            </TableCell>
            <TableCell className="min-w-0 align-top">
                <CatalogCell>{children}</CatalogCell>
            </TableCell>
        </TableRow>
    );
}

function CatalogTable({
    ariaLabel = "Model catalog",
    children,
}: {
    ariaLabel?: string;
    children: ReactNode;
}) {
    return (
        <Table aria-label={ariaLabel}>
            <TableBody>{children}</TableBody>
        </Table>
    );
}

function formatCatalogToken(value: string): string {
    return value.replace(/_/g, " ");
}

function ModalityChipList({ values }: { values: readonly string[] }) {
    if (values.length === 0) {
        return (
            <Text as="span" size="sm" tone="muted">
                Not listed
            </Text>
        );
    }
    return values.map((value) => (
        <ModalityChip key={value} modality={value} size="sm">
            {formatCatalogToken(value)}
        </ModalityChip>
    ));
}

function TokenChipList({ values }: { values: readonly string[] }) {
    return values.map((value) => (
        <Chip key={value} intent="neutral" size="sm">
            {formatCatalogToken(value)}
        </Chip>
    ));
}

function BooleanCapability({ value }: { value: boolean }) {
    return (
        <Chip intent={value ? "success" : "neutral"} size="sm">
            {value ? "Yes" : "No"}
        </Chip>
    );
}

function formatPollenAmount(value: number | null | undefined): string {
    if (value == null) return "No cap";
    return `${value.toLocaleString(undefined, {
        maximumFractionDigits: 4,
    })} pollen`;
}

function formatUsageCount(count: number | null | undefined): string {
    if (count == null) return "No usage";
    return `${count.toLocaleString()} request${count === 1 ? "" : "s"} / 30d`;
}

function formatExpiry(value: string | null | undefined): string {
    if (!value) return "No expiry";
    return value.slice(0, 10);
}

function CategoryChips({
    categories,
    isLoading,
}: {
    categories: readonly ModelSelectorCategory[];
    isLoading: boolean;
}) {
    if (isLoading) {
        return (
            <Chip intent="neutral" size="sm">
                Loading
            </Chip>
        );
    }
    if (!categories.length) {
        return (
            <Chip intent="neutral" size="sm">
                No category
            </Chip>
        );
    }
    return categories.map((category) => (
        <Chip key={category} size="sm">
            <span className="inline-flex items-center gap-1.5">
                <ModalityDot modality={category} />
                {categoryLabel(category)}
            </span>
        </Chip>
    ));
}

function selectedCatalogModel(
    models: readonly ModelCatalogItem[],
    category: ModelSelectorCategory,
    selectedModelId: string | undefined,
): ModelCatalogItem | undefined {
    return (
        (selectedModelId
            ? models.find((model) => model.id === selectedModelId)
            : undefined) ?? models.find((model) => model.category === category)
    );
}

export function ModulesPage() {
    const {
        models,
        allowedModelIds,
        allowedCategories,
        isLoggedIn,
        isLoading,
        error,
    } = useModelCatalog({
        baseUrl: GEN_BASE_URL,
    });
    const { enterUrl } = useAuthActions();
    const profile = useAccountProfile({ enabled: isLoggedIn });
    const accountKey = useAccountKey({ enabled: isLoggedIn });
    const keyUsage = useAccountKeyUsage({
        enabled: isLoggedIn,
        days: 30,
        limit: 1,
    });
    const [category, setCategory] = useState<ModelSelectorCategory | null>(
        null,
    );
    const [selectedByCategory, setSelectedByCategory] = useState<
        Partial<Record<ModelSelectorCategory, string>>
    >({});
    // Categories come only from the catalog the key can actually see. No
    // hardcoded fallback list — an empty catalog renders an empty state.
    const categories = allowedCategories;
    const activeCategory =
        category && categories.includes(category) ? category : categories[0];
    const visibleModels = isLoggedIn
        ? models.filter((model) => allowedModelIds.has(model.id))
        : models;
    const selectedModel = activeCategory
        ? selectedCatalogModel(
              visibleModels,
              activeCategory,
              selectedByCategory[activeCategory],
          )
        : undefined;
    const selectedModelId = selectedModel?.id ?? "";
    const selectedModelAccess = !isLoggedIn
        ? "Public catalog"
        : selectedModel && allowedModelIds.has(selectedModel.id)
          ? "Allowed by key"
          : "Not allowed";
    const selectedPricingEntries = pricingEntries(selectedModel?.pricing);

    return (
        <>
            <PageIntro>
                Modules are domain features wired to the SDK and live data —
                authentication, model selection, wallet — assembled from
                primitives and compositions.
            </PageIntro>

            <section>
                <SectionHeader title="Auth" />
                <Surface
                    variant="panel"
                    className="flex flex-col items-start gap-5"
                >
                    <div className="flex flex-wrap items-center gap-3">
                        <AppUserMenu dashboardHref={enterUrl} />
                        {!isLoggedIn ? (
                            <span className="text-sm font-medium text-intent-danger-text">
                                Authorize the app to load your account and
                                per-key access.
                            </span>
                        ) : null}
                    </div>
                    <div className="flex w-full flex-col gap-5">
                        <div className="w-full">
                            <Text as="h3" size="sm" weight="bold">
                                Account
                            </Text>
                            <div className="mt-2">
                                <CatalogTable ariaLabel="Account">
                                    <CatalogTableRow label="Profile picture">
                                        {isLoggedIn ? (
                                            <UserAvatar size="lg" />
                                        ) : (
                                            <AccountSummaryText value="—" />
                                        )}
                                    </CatalogTableRow>
                                    <CatalogTableRow label="GitHub Username">
                                        <AccountSummaryText
                                            value={
                                                isLoggedIn
                                                    ? (profile.data
                                                          ?.githubUsername ??
                                                      null)
                                                    : "—"
                                            }
                                            isLoading={profile.isLoading}
                                            fallback="Not available"
                                        />
                                    </CatalogTableRow>
                                    <CatalogTableRow label="GitHub Name">
                                        <AccountSummaryText
                                            value={
                                                isLoggedIn
                                                    ? profile.data?.name
                                                    : "—"
                                            }
                                            isLoading={profile.isLoading}
                                        />
                                    </CatalogTableRow>
                                    <CatalogTableRow label="Email">
                                        <AccountSummaryText
                                            value={
                                                isLoggedIn
                                                    ? profile.data?.email
                                                    : "—"
                                            }
                                            isLoading={profile.isLoading}
                                        />
                                    </CatalogTableRow>
                                </CatalogTable>
                            </div>
                        </div>

                        <div className="w-full">
                            <Text as="h3" size="sm" weight="bold">
                                App access (per key)
                            </Text>
                            <div className="mt-2">
                                <CatalogTable ariaLabel="App access per key">
                                    <CatalogTableRow label="Key budget">
                                        <AccountSummaryText
                                            value={
                                                isLoggedIn
                                                    ? formatPollenAmount(
                                                          accountKey.data
                                                              ?.pollenBudget,
                                                      )
                                                    : "—"
                                            }
                                            isLoading={accountKey.isLoading}
                                            fallback="No cap"
                                        />
                                    </CatalogTableRow>
                                    <CatalogTableRow label="Key expires">
                                        <AccountSummaryText
                                            value={
                                                isLoggedIn
                                                    ? formatExpiry(
                                                          accountKey.data
                                                              ?.expiresAt,
                                                      )
                                                    : "—"
                                            }
                                            isLoading={accountKey.isLoading}
                                            fallback="No expiry"
                                        />
                                    </CatalogTableRow>
                                    <CatalogTableRow label="Usage">
                                        <AccountSummaryText
                                            value={
                                                isLoggedIn
                                                    ? formatUsageCount(
                                                          keyUsage.data?.count,
                                                      )
                                                    : "—"
                                            }
                                            isLoading={keyUsage.isLoading}
                                        />
                                    </CatalogTableRow>
                                    <CatalogTableRow label="Categories">
                                        {isLoggedIn ? (
                                            <CategoryChips
                                                categories={categories}
                                                isLoading={isLoading}
                                            />
                                        ) : (
                                            <AccountSummaryText value="—" />
                                        )}
                                    </CatalogTableRow>
                                    <CatalogTableRow label="App Earnings">
                                        {isLoggedIn ? (
                                            <Chip intent="success" size="sm">
                                                20% of pollen spent in-app
                                            </Chip>
                                        ) : (
                                            <AccountSummaryText value="—" />
                                        )}
                                    </CatalogTableRow>
                                </CatalogTable>
                            </div>
                        </div>
                    </div>
                </Surface>
            </section>

            {activeCategory ? (
                <>
                    <section>
                        <SectionHeader title="Gen" />
                        <Surface
                            variant="panel"
                            className="flex flex-col gap-5"
                        >
                            <CatalogTable ariaLabel="Model categories">
                                <CatalogTableRow label="Category">
                                    <ButtonGroup aria-label="Categories">
                                        {categories.map((item) => (
                                            <ModalityTab
                                                key={item}
                                                active={activeCategory === item}
                                                onClick={() =>
                                                    setCategory(item)
                                                }
                                            >
                                                {categoryLabel(item)}
                                            </ModalityTab>
                                        ))}
                                    </ButtonGroup>
                                </CatalogTableRow>
                            </CatalogTable>

                            <div className="flex w-full flex-col gap-2">
                                <Text as="h3" size="sm" weight="bold">
                                    Model
                                </Text>
                                <CatalogTable ariaLabel="Selected model">
                                    <CatalogTableRow label="Title">
                                        <ModelSelector
                                            models={visibleModels}
                                            category={activeCategory}
                                            value={selectedModelId}
                                            isLoading={isLoading}
                                            onChange={(modelId) =>
                                                setSelectedByCategory(
                                                    (current) => ({
                                                        ...current,
                                                        [activeCategory]:
                                                            modelId,
                                                    }),
                                                )
                                            }
                                        />
                                    </CatalogTableRow>
                                    {selectedModel ? (
                                        <>
                                            <CatalogTableRow label="ID">
                                                <CatalogValue mono>
                                                    {selectedModel.id}
                                                </CatalogValue>
                                            </CatalogTableRow>
                                            <CatalogTableRow label="Brand">
                                                <CatalogValue>
                                                    {selectedModel.brand ??
                                                        "Not listed"}
                                                </CatalogValue>
                                            </CatalogTableRow>
                                            <CatalogTableRow label="Access">
                                                <Chip
                                                    intent={
                                                        selectedModelAccess ===
                                                        "Not allowed"
                                                            ? "warning"
                                                            : "success"
                                                    }
                                                    size="sm"
                                                >
                                                    {selectedModelAccess}
                                                </Chip>
                                                {selectedModel.paidOnly ? (
                                                    <Chip size="sm">paid</Chip>
                                                ) : null}
                                            </CatalogTableRow>
                                            <CatalogTableRow label="Description">
                                                <CatalogValue>
                                                    {selectedModel.description ??
                                                        "Not listed"}
                                                </CatalogValue>
                                            </CatalogTableRow>
                                            <CatalogTableRow label="Input">
                                                <ModalityChipList
                                                    values={
                                                        selectedModel.inputModalities
                                                    }
                                                />
                                            </CatalogTableRow>
                                            <CatalogTableRow label="Output">
                                                <ModalityChipList
                                                    values={
                                                        selectedModel.outputModalities
                                                    }
                                                />
                                            </CatalogTableRow>
                                            <CatalogTableRow label="Tools">
                                                <BooleanCapability
                                                    value={selectedModel.tools}
                                                />
                                            </CatalogTableRow>
                                            <CatalogTableRow label="Reasoning">
                                                <BooleanCapability
                                                    value={
                                                        selectedModel.reasoning
                                                    }
                                                />
                                            </CatalogTableRow>
                                            {selectedModel.contextLength ? (
                                                <CatalogTableRow label="Context">
                                                    <CatalogValue>
                                                        {`${selectedModel.contextLength.toLocaleString()} tokens`}
                                                    </CatalogValue>
                                                </CatalogTableRow>
                                            ) : null}
                                            {selectedModel.maxReferenceImages ? (
                                                <CatalogTableRow label="Reference images">
                                                    <CatalogValue>
                                                        {selectedModel.maxReferenceImages.toLocaleString()}
                                                    </CatalogValue>
                                                </CatalogTableRow>
                                            ) : null}
                                            {selectedModel.maxReferenceVideos ? (
                                                <CatalogTableRow label="Reference videos">
                                                    <CatalogValue>
                                                        {selectedModel.maxReferenceVideos.toLocaleString()}
                                                    </CatalogValue>
                                                </CatalogTableRow>
                                            ) : null}
                                            {selectedModel.videoCapabilities
                                                .length ? (
                                                <CatalogTableRow label="Video">
                                                    <TokenChipList
                                                        values={
                                                            selectedModel.videoCapabilities
                                                        }
                                                    />
                                                </CatalogTableRow>
                                            ) : null}
                                            {selectedModel.voices.length ? (
                                                <CatalogTableRow label="Voices">
                                                    <TokenChipList
                                                        values={
                                                            selectedModel.voices
                                                        }
                                                    />
                                                </CatalogTableRow>
                                            ) : null}
                                            {selectedPricingEntries.length ? (
                                                selectedPricingEntries.map(
                                                    ([label, value]) => (
                                                        <CatalogTableRow
                                                            key={label}
                                                            label={`Price: ${label}`}
                                                        >
                                                            <CatalogValue mono>
                                                                {value}
                                                            </CatalogValue>
                                                            <Chip
                                                                intent="neutral"
                                                                size="sm"
                                                            >
                                                                pollen
                                                            </Chip>
                                                        </CatalogTableRow>
                                                    ),
                                                )
                                            ) : (
                                                <CatalogTableRow label="Pricing">
                                                    <Text
                                                        as="span"
                                                        size="sm"
                                                        tone="muted"
                                                    >
                                                        Not listed
                                                    </Text>
                                                </CatalogTableRow>
                                            )}
                                        </>
                                    ) : null}
                                </CatalogTable>
                            </div>
                            {error ? (
                                <Alert intent="warning">
                                    Model catalog unavailable: {error.message}
                                </Alert>
                            ) : !selectedModel ? (
                                <Text size="sm" tone="soft">
                                    {isLoading
                                        ? "Loading models..."
                                        : "No model available for this category."}
                                </Text>
                            ) : null}
                        </Surface>
                    </section>

                    <ExternalLinkButton
                        href="https://playground.pollinations.ai"
                        className="self-start"
                    >
                        Try it out in Playground
                    </ExternalLinkButton>
                </>
            ) : (
                <section>
                    <SectionHeader title="Gen" />
                    <Surface variant="panel" className="flex flex-col gap-3">
                        {error ? (
                            <Alert intent="warning">
                                Model catalog unavailable: {error.message}
                            </Alert>
                        ) : (
                            <Text size="sm" tone="soft">
                                {isLoading
                                    ? "Loading models..."
                                    : "No models available for your key."}
                            </Text>
                        )}
                    </Surface>
                </section>
            )}
        </>
    );
}
