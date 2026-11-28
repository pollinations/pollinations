import { HTTPException } from "hono/http-exception";

type RefusalMessage = (
    link: (label: string, url: string) => string,
    isApiResponse: boolean,
) => string;

export class PaymentRequiredError extends HTTPException {
    readonly chatMessage: string;

    constructor(
        readonly errorCode:
            | "KEY_BUDGET_EXHAUSTED"
            | "INSUFFICIENT_BALANCE"
            | "QUEST_POLLEN_RESTRICTED"
            | "QUEST_POLLEN_ONLY",
        message: string | RefusalMessage,
        /** The page where the key's owner fixes this. */
        readonly fixUrl: string,
        /** Quest earnings alone cannot resolve this refusal. */
        readonly paidOnly = false,
    ) {
        super(402, {
            message:
                typeof message === "string"
                    ? message
                    : message((label, url) => `${label} (${url})`, true),
        });
        // A chat message can be shown to someone using another person's key.
        this.chatMessage =
            typeof message === "string"
                ? message
                : message((label, url) => `[${label}](<${url}>)`, false);
    }
}
