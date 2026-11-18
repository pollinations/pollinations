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

const QUESTS = [
    { ...base, id: "q_open", title: "open", state: "available" },
    {
        ...base,
        id: "q_claimed",
        title: "claimed",
        state: "available",
        reward: {
            id: "r",
            questId: "q_claimed",
            title: "reward",
            pollenAmount: 1,
            balanceBucket: "tier",
            earnedAt: "2026-10-01T00:00:00.000Z",
            claimedAt: "2026-10-01T00:00:01.000Z",
        },
    },
    {
        ...base,
        id: "q_closed",
        title: "completed by someone else",
        state: "completed",
        status: "completed",
    },
];

describe("quests claim state", () => {
    it("reports quests closed by others as closed, not claimed", async () => {
        const out = await run([], QUESTS);
        const byId = Object.fromEntries(out.map((q) => [q.id, q.status]));
        expect(byId).toEqual({
            q_open: "open",
            q_claimed: "claimed",
            q_closed: "closed",
        });
    });
});

describe("quests human output", () => {
    it("shows rewards as dollars with the balance icon", async () => {
        setKeyOverride("sk_test");
        setOutputMode("human");
        const printed: string[] = [];
        const capture = (value: unknown) => {
            printed.push(String(value));
            return true;
        };
        vi.spyOn(process.stdout, "write").mockImplementation(capture);
        vi.spyOn(process.stderr, "write").mockImplementation(capture);
        const claimable = (id: string) => ({
            ...base,
            id,
            title: id,
            state: "available",
            reward: {
                id: `r_${id}`,
                questId: id,
                title: "reward",
                pollenAmount: 0.1,
                balanceBucket: "tier",
                earnedAt: "2026-10-01T00:00:00.000Z",
                claimedAt: null,
            },
        });
        const quests = [claimable("a"), claimable("b"), claimable("c")];
        vi.stubGlobal("fetch", async () => Response.json({ quests }));

        await questsCommand.parseAsync([], { from: "user" });

        const out = printed.join("");
        expect(out).toContain("3 reward(s) ready to claim (🌱 $0.3)");
        expect(out).toContain("🌱 $0.1");
        expect(out).not.toContain("tier");
    });
});
