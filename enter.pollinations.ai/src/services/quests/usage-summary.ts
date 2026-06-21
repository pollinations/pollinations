import { fetchTinybirdRows, requireTinybirdReadToken } from "../tinybird.ts";

export type UsageQuestSummaryRow = {
    userId: string;
    firstImageEventId: string;
    imageRequests: number;
    firstTextEventId: string;
    textRequests: number;
    distinctModels: number;
    totalRequests: number;
    activeDaysLast7: number;
};

export async function loadUsageQuestSummary(
    env: CloudflareBindings,
): Promise<UsageQuestSummaryRow[]> {
    const tinybirdOrigin = new URL(env.TINYBIRD_INGEST_URL).origin;
    const tinybirdToken = requireTinybirdReadToken(env);
    return fetchTinybirdRows<UsageQuestSummaryRow>(
        tinybirdOrigin,
        "/v0/pipes/quest_usage_summary.json",
        tinybirdToken,
        {},
    );
}
