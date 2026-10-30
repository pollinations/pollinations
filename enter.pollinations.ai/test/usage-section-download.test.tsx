import { describe, expect, it, vi } from "vitest";
import { accountClient } from "../frontend/src/api";
import { downloadFile } from "../frontend/src/components/activity/activity-helpers";
import { ActivityToolbar } from "../frontend/src/components/activity/activity-toolbar";
import { UsageSection } from "../frontend/src/components/activity/usage-section";
import { useUsageData } from "../frontend/src/components/activity/use-usage-data";

vi.mock("../frontend/src/api", () => ({
    accountClient: { usage: { $get: vi.fn().mockResolvedValue({}) } },
}));
vi.mock("../frontend/src/components/activity/activity-helpers", () => {
    const empty = () => null;
    return {
        ActivityEmptyState: empty,
        ActivityFilter: empty,
        ActivityKeyFilter: empty,
        CsvDownloadButton: empty,
        clearActivitySelectionOnEscape: vi.fn(),
        downloadFile: vi.fn(),
        PollenUsageBadges: empty,
    };
});
vi.mock("../frontend/src/components/layout/dashboard-loading", () => ({
    LoadError: () => null,
    SectionContent: () => null,
}));
vi.mock("../frontend/src/components/activity/use-usage-data", () => ({
    useUsageData: vi.fn(() => ({
        loading: false,
        refreshing: false,
        error: undefined,
        fetchUsage: vi.fn(),
        usedModels: [],
        usedApiKeys: [],
        chartData: [],
        hasData: false,
        stats: {},
        hasPeriodData: true,
    })),
}));

describe("usage CSV download", () => {
    it("passes the visible key and model filters to the detailed export", async () => {
        const tree = UsageSection({
            period: { granularity: "day", period: "2026-10-27" },
            onPeriodChange: vi.fn(),
            metric: "requests",
            groupBy: "model",
            onGroupByChange: vi.fn(),
            selectedKeyIds: ["key-a", "key-b"],
            selectedModels: ["model-a", "model-b"],
            onMetricChange: vi.fn(),
            onSelectedKeyIdsChange: vi.fn(),
            onSelectedModelsChange: vi.fn(),
        });
        const toolbar = tree.props.children[0];
        expect(toolbar.type).toBe(ActivityToolbar);
        await toolbar.props.download.props.onClick();

        expect(accountClient.usage.$get).toHaveBeenCalledWith({
            query: expect.objectContaining({
                api_key_ids: "key-a,key-b",
                models: "model-a,model-b",
            }),
        });
        expect(downloadFile).toHaveBeenCalled();
    });
});
