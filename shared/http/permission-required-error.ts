import { HTTPException } from "hono/http-exception";

/** The key lacks a model or account permission its owner can grant at `fixUrl`. */
export class PermissionRequiredError extends HTTPException {
    constructor(
        message: string,
        readonly fixUrl: string,
    ) {
        super(403, { message });
    }
}
