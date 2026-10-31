import { HTTPException } from "hono/http-exception";
import { type Grant, signGrantAgent } from "../auth/agent-run-token.ts";
import { fixLink, type RefusalContext } from "./fix-link.ts";

/** The key lacks a model or account permission its owner can grant at `fixUrl`. */
export class PermissionRequiredError extends HTTPException {
    constructor(
        message: string,
        readonly fixUrl: string,
    ) {
        super(403, { message });
    }
}

export function permissionRequired(
    c: RefusalContext,
    grant: Grant,
    reason: string,
): PermissionRequiredError {
    const id = c.var.auth?.apiKey?.id ?? "";
    // During an agent run, sign the agent's name into the link so the grant
    // page can show who asked without trusting the agent to name itself.
    const agent = c.var.auth?.agentRun?.agentModelId;
    const sig =
        agent &&
        signGrantAgent({
            secret: c.env.BETTER_AUTH_SECRET,
            apiKeyId: id,
            grant,
            agent,
        });
    const fixUrl = fixLink(c, "/grant", {
        id,
        ...grant,
        agent,
        sig,
        ref: "agent_grant",
    });
    return new PermissionRequiredError(
        `${reason} Allow it at ${fixUrl}`,
        fixUrl,
    );
}
