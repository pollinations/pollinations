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
    },
} as const;
