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
        tier: {
            type: "string",
            defaultValue: "spore",
            input: false,
        },
        cacheWritesDisabled: {
            type: "boolean",
            defaultValue: false,
            input: false,
        },
        privacyModeEnabled: {
            type: "boolean",
            defaultValue: false,
            input: false,
        },
    },
} as const;
