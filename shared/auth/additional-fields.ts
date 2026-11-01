export const authAdditionalFields = {
    user: {
        questPollenRestricted: {
            type: "boolean",
            required: false,
            input: false,
        },
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
    },
} as const;
