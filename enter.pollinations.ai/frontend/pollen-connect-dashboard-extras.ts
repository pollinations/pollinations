import {
    currentPeriod,
    getPeriodBucketKeys,
    type PeriodSelection,
} from "../../packages/ui/src/lib/period.ts";
import type {
    QuestCatalogResponse,
    QuestCheckResult,
} from "./src/backend-types.ts";
import type { DailyUsageRecord } from "./src/components/activity/types.ts";
import type { DeveloperEarningsRow } from "./src/components/activity/use-earnings-data.ts";

// Existing account-setup quests, sampled from services/quests/groups/account-setup.ts.
// The preview represents their UI states; it never evaluates or awards a real quest.
const catalog: QuestCatalogResponse = {
    quests: [
        {
            id: "first_api_key",
            title: "Create your first API key",
            description: "Create an API [key](/keys).",
            category: "setup",
            state: "available",
            rewardAmount: 0.25,
            balanceBucket: "tier",
            url: null,
        },
        {
            id: "use_app",
            title: "Use a Pollinations app",
            description:
                "Connect to a Pollinations app. Log in to any app in the [apps directory](https://pollinations.ai/apps) that supports it.",
            category: "setup",
            state: "available",
            rewardAmount: 0.25,
            balanceBucket: "tier",
            url: null,
        },
        {
            id: "top_up_100_since_launch",
            title: "Top up 100 Pollen",
            description:
                "You have [topped up](/pollen#buy-pollen) 100 Pollen or more. _(from 21/06/26)_",
            category: "grow",
            state: "available",
            rewardAmount: 50,
            balanceBucket: "tier",
            goal: { target: 100, unit: "pollen" },
            url: null,
        },
        {
            id: "early_adopter",
            title: "Early adopter",
            description:
                "Your Pollinations account is at least nine months old.",
            category: "grow",
            state: "coming_soon",
            rewardAmount: 2,
            balanceBucket: "tier",
            url: null,
        },
    ],
};

/** Local data for the real Activity and Quests routes, including their existing actions. */
export function createDashboardExtrasFixture(query: URLSearchParams) {
    const failedPaths = new Set<string>();
    const empty = query.get("collection_case") === "empty";
    const now = new Date();
    const rewards = empty
        ? []
        : catalog.quests.slice(0, 2).map((quest, index) => ({
              id: `preview-reward-${quest.id}`,
              questId: quest.id,
              title: quest.title,
              pollenAmount: quest.rewardAmount,
              balanceBucket: quest.balanceBucket,
              earnedAt: now.toISOString(),
              claimedAt:
                  index === 0 ? now.toISOString() : (null as string | null),
              url: quest.url,
          }));
    let questBalance = Number(query.get("sim_quest") ?? 5);
    const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), {
            status,
            headers: { "Content-Type": "application/json" },
        });

    return (url: URL, method: string, signedIn = true) => {
        const path = url.pathname;
        const activity = [
            "/api/account/usage/daily",
            "/api/account/earnings",
            "/api/account/usage",
            "/api/account/earnings/transactions",
        ].includes(path);
        const questRead = [
            "/api/quests/catalog",
            "/api/quests/rewards",
        ].includes(path);
        if (method === "GET" && (activity || questRead)) {
            if (query.get("collection_case") === "loading")
                return new Promise<Response>(() => {});
            if (
                query.get("collection_case") === "error" &&
                !failedPaths.has(path)
            ) {
                failedPaths.add(path);
                return json({ error: "Preview data unavailable" }, 503);
            }
            if (path === "/api/quests/catalog") return json(catalog);
            if (path === "/api/quests/rewards")
                return signedIn
                    ? json({ rewards })
                    : json({ message: "Authentication required" }, 401);

            const fallback = currentPeriod();
            const granularity = url.searchParams.get("granularity");
            const selection: PeriodSelection = {
                granularity:
                    granularity === "day" ||
                    granularity === "week" ||
                    granularity === "month"
                        ? granularity
                        : fallback.granularity,
                period: url.searchParams.get("period") ?? fallback.period,
            };
            const dates = getPeriodBucketKeys(selection).slice(0, 3);
            if (path === "/api/account/usage/daily") {
                const usage: DailyUsageRecord[] = empty
                    ? []
                    : dates.map((date, index) => ({
                          date,
                          api_key_id:
                              index === 1
                                  ? "preview-secret"
                                  : "preview-connection",
                          api_key: index === 1 ? "My API key" : "App example",
                          model: index === 1 ? "flux" : "openai",
                          meter_source: index === 1 ? "tier" : "pack",
                          requests: (index + 1) * 4,
                          cost_usd: (index + 1) * 0.1,
                      }));
                return json({ usage, count: usage.length });
            }
            if (path === "/api/account/earnings") {
                const daily: DeveloperEarningsRow[] = empty
                    ? []
                    : dates.slice(0, 2).map((date, index) => ({
                          date,
                          entity_id: index
                              ? "preview/example"
                              : "preview-registration",
                          entity_name: index ? "Example model" : "My app",
                          source: index ? "community_model" : "byop_markup",
                          requests: 4,
                          paid_requests: 3,
                          tier_requests: 1,
                          baseline_price: 0.8,
                          cost_usd: 1,
                          reward_rate: 0.2,
                          pollen_earned: 0.2,
                          paid_earned: 0.15,
                          tier_earned: 0.05,
                      }));
                return json({
                    daily,
                    perEntity: daily.map((row) => ({ ...row, date: "" })),
                });
            }
            const limit = Number(url.searchParams.get("limit") ?? 11);
            const events = Array.from(
                { length: empty ? 0 : 16 },
                (_, index) => ({
                    timestamp: new Date(now.getTime() - index * 60000)
                        .toISOString()
                        .slice(0, 19)
                        .replace("T", " "),
                    cursor_event_id: `preview-event-${index}`,
                    model: index % 2 ? "flux" : "openai",
                    meter_source: index % 2 ? "tier" : "pack",
                    index,
                }),
            );
            if (path === "/api/account/usage") {
                const usage = events
                    .filter(({ index }) => index % 4 !== 0)
                    .slice(0, limit)
                    .map(({ index: _index, ...event }) => ({
                        ...event,
                        api_key_id: "preview-secret",
                        api_key: "My API key",
                        cost_usd: 0.01,
                    }));
                return json({ usage, count: usage.length });
            }
            const transactions = events
                .filter(({ index }) => index % 4 === 0)
                .slice(0, limit)
                .map(({ index: _index, ...event }) => ({
                    ...event,
                    entity_name: "My app",
                    pollen_earned: 0.002,
                }));
            return json({ transactions, count: transactions.length });
        }
        if (method === "POST" && path === "/api/quests/check") {
            if (query.get("quest_check") === "waiting")
                return new Promise<Response>(() => {});
            if (query.get("quest_check") === "error")
                return json(
                    { message: "Preview quest check unavailable" },
                    503,
                );
            const result: QuestCheckResult = {
                success: true,
                recorded: 0,
                rewardIds: [],
                progress: [
                    {
                        questId: "top_up_100_since_launch",
                        current: empty ? 0 : 25,
                        target: 100,
                        unit: "pollen",
                    },
                ],
            };
            return json(result);
        }
        if (
            method === "POST" &&
            /^\/api\/quests\/rewards\/[^/]+\/claim$/.test(path)
        ) {
            if (query.get("result") === "waiting")
                return new Promise<Response>(() => {});
            if (query.get("result") === "error") {
                query.delete("result");
                return json(
                    { message: "Preview reward claim unavailable" },
                    503,
                );
            }
            const reward = rewards.find(
                (reward) => reward.id === path.split("/")[4],
            );
            if (!reward) return json({ message: "Reward not found" }, 404);
            const claimed = reward.claimedAt === null;
            if (claimed) {
                reward.claimedAt = new Date().toISOString();
                questBalance += reward.pollenAmount;
            }
            return json({ claimed, newBalance: questBalance, reward });
        }
        return undefined;
    };
}
