import { HTTPException } from "hono/http-exception";

export class PaymentRequiredError extends HTTPException {
    constructor(
        readonly errorCode: "KEY_BUDGET_EXHAUSTED" | "INSUFFICIENT_BALANCE",
        message: string,
        /** Only paid Pollen can cover this model, so quests are no remedy. */
        readonly paidOnly = false,
    ) {
        super(402, { message });
    }
}
