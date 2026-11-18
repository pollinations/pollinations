// icanhazdadjoke.com answers HTML unless the request asks for JSON;
// the shared fetchJson sends Accept: application/json, so the JSON
// shape ({id, joke, status}) is what we get.
export const dadjokesTools = [
    [
        "dad_joke",
        "Get a random dad joke from icanhazdadjoke.com. Random only — no lookup, no topic, no search.",
        {},
        async (_args, fetchJson) => {
            const data = await fetchJson("https://icanhazdadjoke.com/");
            if (typeof data?.joke !== "string" || !data.joke)
                throw new Error("Invalid dad joke response");
            return { id: data.id ?? null, joke: data.joke };
        },
    ],
];
