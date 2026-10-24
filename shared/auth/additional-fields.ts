// An invite link (?ref=<GitHub id>) sets this cookie in the dashboard; the
// signup hook in enter's auth.ts reads it to fill `referredBy`.
export const INVITE_REF_COOKIE = "invite_ref";

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
        // Set at signup from INVITE_REF_COOKIE (enter's auth.ts) or by a BYOP
        // app login; never sent to clients.
        referredBy: {
            type: "string",
            required: false,
            input: false,
            returned: false,
        },
    },
} as const;
