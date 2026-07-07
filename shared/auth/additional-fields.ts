export const authAdditionalFields = {
    user: {
        githubId: {
            type: "number",
            input: false,
        },
        githubUsername: {
            type: "string",
            input: false,
        },
        handle: {
            type: "string",
            input: false,
        },
        tier: {
            type: "string",
            defaultValue: "spore",
            input: false,
        },
    },
    account: {
        // Live provider login (GitHub) — set synchronously at account
        // creation and kept fresh by the login sync. Must be registered
        // here or the adapter strips it from account writes.
        username: {
            type: "string",
            required: false,
            input: false,
        },
    },
} as const;
