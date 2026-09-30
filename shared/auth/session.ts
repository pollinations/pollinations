import { and, eq, getTableColumns, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/better-auth.ts";
import {
    type ApiKeyAuthBindings,
    type AuthUser,
    assertNotBanned,
    assertStagingAccess,
} from "./api-key.ts";

// Enter sends a dashboard session's token in this header when it calls gen
// for the logged-in user. Browsers never attach it on their own, and enter's
// session cookie is host-only, so only a caller holding the token can use it.
export const SESSION_TOKEN_HEADER = "x-pollinations-session";

export async function authenticateSessionRequest(
    request: Request,
    env: ApiKeyAuthBindings,
): Promise<AuthUser | null> {
    const token = request.headers.get(SESSION_TOKEN_HEADER);
    if (!token) return null;
    const row = await drizzle(env.DB)
        .select({ user: getTableColumns(schema.user) })
        .from(schema.session)
        .innerJoin(schema.user, eq(schema.user.id, schema.session.userId))
        .where(
            and(
                eq(schema.session.token, token),
                gt(schema.session.expiresAt, new Date()),
            ),
        )
        .get();
    if (!row) return null;
    assertNotBanned(row.user);
    assertStagingAccess(env, row.user);
    return row.user;
}
