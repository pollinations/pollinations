// Advice Slip: one random piece of advice per call. Random-only —
// there is no lookup by topic or id, the same novelty family as
// xkcd's latest-comic lookup.
export const adviceTools = [
    [
        "advice",
        "Get a random piece of advice from Advice Slip. Random-only — it returns one slip, there is no way to ask for advice on a topic.",
        {},
        async (_args, fetchJson) => {
            const data = await fetchJson("https://api.adviceslip.com/advice");
            if (!data?.slip || typeof data.slip.advice !== "string")
                throw new Error("Invalid Advice Slip response");
            return { id: data.slip.id, advice: data.slip.advice };
        },
    ],
];
