import {
    Button,
    CheckIcon,
    Chip,
    ClipboardIcon,
    CopyButton,
    IconButton,
    PencilIcon,
    Surface,
    XIcon,
} from "@pollinations/ui";
import { COMMUNITY_ENDPOINT_PRICE_FIELDS } from "@shared/community-endpoints.ts";
import { CommunityEndpointUsageCounts } from "./community-endpoint-usage.tsx";
import {
    type ActionState,
    type CommunityEndpoint,
    idleAction,
    pricePerTokenToPerMillion,
} from "./types.ts";

type CommunityEndpointCardProps = {
    endpoint: CommunityEndpoint;
    testState?: ActionState;
    onTest: () => void;
    onEdit: () => void;
    onDelete: () => void;
};

export function CommunityEndpointCard({
    endpoint,
    testState = idleAction,
    onTest,
    onEdit,
    onDelete,
}: CommunityEndpointCardProps) {
    const priceFields = COMMUNITY_ENDPOINT_PRICE_FIELDS.filter(
        (field) => endpoint[field.key] > 0,
    );

    return (
        <Surface className="transition-colors hover:bg-surface-opaque/90">
            <div className="mb-2 flex items-center gap-2">
                {testState.status === "success" && (
                    <Chip size="sm" intent="success">
                        Tested
                    </Chip>
                )}
                {testState.status === "loading" && (
                    <Chip size="sm" intent="warning">
                        Testing
                    </Chip>
                )}
                {testState.status === "error" && (
                    <Chip size="sm" intent="danger">
                        Test failed
                    </Chip>
                )}
                <span className="truncate text-sm font-medium">
                    {endpoint.name}
                </span>
                <span className="flex-1" />
                <div className="flex shrink-0 items-center gap-1">
                    <Button
                        type="button"
                        size="sm"
                        intent="info"
                        onClick={onTest}
                        disabled={testState.status === "loading"}
                    >
                        Test
                    </Button>
                    <IconButton
                        intent="info"
                        title="Edit model"
                        tooltip="Edit model"
                        tooltipAlign="center"
                        onClick={onEdit}
                    >
                        <PencilIcon className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                        intent="danger"
                        title="Delete model"
                        tooltip="Delete model"
                        tooltipAlign="center"
                        onClick={onDelete}
                    >
                        <XIcon className="h-4 w-4" />
                    </IconButton>
                </div>
            </div>

            <div className="flex items-center gap-1.5">
                <span className="truncate font-mono text-xs text-theme-text-muted">
                    {endpoint.modelId}
                </span>
                <CopyButton
                    value={endpoint.modelId}
                    tooltip="Copy model id"
                    copiedTooltip="Copied"
                    className="inline-flex shrink-0 items-center justify-center rounded-md p-1 text-theme-text-muted transition-colors hover:bg-theme-bg-active hover:text-theme-text-strong"
                >
                    {(copied: boolean) =>
                        copied ? (
                            <CheckIcon className="h-3.5 w-3.5" />
                        ) : (
                            <ClipboardIcon className="h-3.5 w-3.5" />
                        )
                    }
                </CopyButton>
            </div>

            {endpoint.description && (
                <p className="mt-2 text-sm text-theme-text-muted">
                    {endpoint.description}
                </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-theme-text-muted">
                <span className="min-w-0 max-w-full truncate">
                    <span className="text-theme-text-muted">Endpoint: </span>
                    {endpoint.baseUrl}
                </span>
                <span>
                    <span className="text-theme-text-muted">Provider: </span>
                    {endpoint.upstreamModel}
                </span>
                {priceFields.map((field) => (
                    <span key={field.key}>
                        <span className="text-theme-text-muted">
                            {field.label}:{" "}
                        </span>
                        {pricePerTokenToPerMillion(endpoint[field.key])} /1M
                    </span>
                ))}
            </div>

            {testState.status === "error" && testState.message && (
                <p className="mt-3 text-sm text-intent-danger-text">
                    {testState.message}
                </p>
            )}

            {testState.status === "success" && (
                <div className="mt-3 rounded-md border border-divider bg-surface-opaque/50 p-2">
                    {testState.message && (
                        <p className="mb-2 text-sm text-intent-success-text">
                            {testState.message}
                        </p>
                    )}
                    <CommunityEndpointUsageCounts
                        usage={testState.usage}
                        billableUsage={testState.billableUsage}
                    />
                </div>
            )}
        </Surface>
    );
}
