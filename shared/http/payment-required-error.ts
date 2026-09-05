import { HTTPException } from "hono/http-exception";

export class PaymentRequiredError extends HTTPException {
    constructor(
        readonly errorCode: "KEY_BUDGET_EXHAUSTED" | "INSUFFICIENT_BALANCE",
        message: string,
    ) {
        super(402, { message });
    }
}
