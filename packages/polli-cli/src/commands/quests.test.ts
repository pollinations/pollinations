import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../lib/config.js";
import { setOutputMode } from "../lib/output.js";
import { questsCommand } from "./quests.js";

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setKeyOverride(undefined);
    setOutputMode("human");
});

function run(args: string[], quests: unknown[]) {
    setKeyOverride("sk_test");
    setOutputMode("json");
    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((value) => {
        output.push(String(value));
        return true;
    });
    vi.stubGlobal(
        "fetch",
        async () =>
            new Response(JSON.stringify({ quests }), {
                status: 200,
                headers: { "content-type": "application/json" },
            }),
    );
    return questsCommand
        .parseAsync(args, { from: "user" })
        .then(() => JSON.parse(output.join("")) as Record<string, unknown>[]);
}

const base = {
    description: "",
    category: "setup",
    rewardAmount: 1,
    balanceBucket: "tier",
    url: null,
};

const reward = (claimedAt: string | null) => ({
    id: "r",
    questId: "q_claimed",
    title: "reward",
    pollenAmount: 1,
    balanceBucket: "tier",
    earnedAt: "2026-10-01T00:00:00.000Z",
    claimedAt,
});

const QUESTS = [
    { ...base, id: "q_open", title: "open", state: "available" },
    {
        ...base,
        id: "q_claimable",
        title: "claimable",
        state: "available",
        reward: reward(null),
    },
    {
        ...base,
        id: "q_claimed",
        title: "claimed",
        state: "available",
        reward: reward("2026-10-01T00:00:01.000Z"),
    },
    {
        ...base,
        id: "q_closed",
        title: "closed by someone else",
        state: "completed",
        status: "completed",
    },
    { ...base, id: "q_coming", title: "coming", state: "coming_soon" },
    {
        ...base,
        id: "q_coming_claimed",
        title: "claimed despite coming-soon flag",
        state: "coming_soon",
        reward: reward("2026-10-01T00:00:02.000Z"),
    },
];

describe("quests claim state", () => {
    it("reports quests closed without this account as closed, not claimed", async () => {
        const out = await run([], QUESTS);
        const byId = Object.fromEntries(out.map((q) => [q.id, q.status]));
        expect(byId).toEqual({
            q_open: "open",
            q_claimable: "claimable",
            q_claimed: "claimed",
            q_closed: "closed",
            q_coming: "coming",
            q_coming_claimed: "claimed",
        });
    });

    it("keeps --claimed to quests this account actually claimed", async () => {
        const out = await run(["--claimed"], QUESTS);
        expect(out.map((q) => q.id)).toEqual(["q_claimed", "q_coming_claimed"]);
    });

    it("lists quests closed without this account under --closed", async () => {
        const out = await run(["--closed"], QUESTS);
        expect(out.map((q) => q.id)).toEqual(["q_closed"]);
    });
});
