import { HTTPException } from "hono/http-exception";

export class PaymentRequiredError extends HTTPException {
    constructor(
        readonly errorCode:
            | "KEY_BUDGET_EXHAUSTED"
            | "INSUFFICIENT_BALANCE"
            | "QUEST_POLLEN_ONLY",
        message: string,
        /** The page where the key's owner fixes this. */
        readonly fixUrl: string,
        /** Only paid Pollen can cover this model, so quests are no remedy. */
        readonly paidOnly = false,
    ) {
        super(402, { message });
    }
}
