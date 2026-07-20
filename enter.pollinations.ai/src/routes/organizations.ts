import * as schema from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import { and, eq, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";

type Db = ReturnType<typeof drizzle<typeof schema>>;
type OrganizationRow = typeof schema.organization.$inferSelect;
type OrganizationMemberRow = typeof schema.organizationMember.$inferSelect;
type OrgRole = "owner" | "member";

function isUniqueConstraintError(error: unknown): boolean {
    // Drizzle wraps the underlying D1 error in a DrizzleQueryError whose own
    // `.message` is just "Failed query: ..." — the "UNIQUE constraint
    // failed" text is on `.cause`.
    const message = error instanceof Error ? error.message : String(error);
    const causeMessage =
        error instanceof Error && error.cause instanceof Error
            ? error.cause.message
            : "";
    return (
        message.includes("UNIQUE constraint failed") ||
        causeMessage.includes("UNIQUE constraint failed")
    );
}

function toOrganizationSummary(
    org: OrganizationRow,
    role: OrgRole,
    membership: OrganizationMemberRow | null,
) {
    return {
        id: org.id,
        name: org.name,
        packBalance: org.packBalance,
        role,
        canManageApiKeys:
            role === "owner" || membership?.canManageApiKeys === true,
        canFundOrganization:
            role === "owner" || membership?.canFundOrganization === true,
    };
}

function toMemberSummary(
    member: OrganizationMemberRow,
    user: {
        name: string;
        image: string | null;
        githubUsername: string | null;
    } | null,
) {
    return {
        id: member.id,
        userId: member.userId,
        name: user?.name ?? null,
        image: user?.image ?? null,
        githubUsername: user?.githubUsername ?? null,
        status: member.status,
        canManageApiKeys: member.canManageApiKeys,
        canFundOrganization: member.canFundOrganization,
        invitedByUserId: member.invitedByUserId,
        createdAt: member.createdAt,
        respondedAt: member.respondedAt,
    };
}

/**
 * Verify the caller has a relationship (owner or active member) to the org,
 * returning it. Throws 404 if the org doesn't exist or the caller has no
 * relationship to it — deliberately the same response for both, so this
 * endpoint isn't an oracle for org existence.
 */
async function requireOrgAccess(
    db: Db,
    organizationId: string,
    userId: string,
): Promise<{
    organization: OrganizationRow;
    role: OrgRole;
    membership: OrganizationMemberRow | null;
}> {
    const organization = await db.query.organization.findFirst({
        where: eq(schema.organization.id, organizationId),
    });
    if (!organization) {
        throw new HTTPException(404, { message: "Organization not found" });
    }
    if (organization.ownerUserId === userId) {
        return { organization, role: "owner", membership: null };
    }
    const membership = await db.query.organizationMember.findFirst({
        where: and(
            eq(schema.organizationMember.organizationId, organizationId),
            eq(schema.organizationMember.userId, userId),
            eq(schema.organizationMember.status, "active"),
        ),
    });
    if (!membership) {
        throw new HTTPException(404, { message: "Organization not found" });
    }
    return { organization, role: "member", membership };
}

/**
 * Reads the caller's requested organization scope. Prefers the
 * `X-Organization-Id` header — attached transparently by the frontend's
 * `hc()` client to every request once an org is active in the switcher —
 * falling back to an explicit `organizationId` query param for routes
 * reached via direct browser navigation (e.g. the Stripe checkout link),
 * which never carry custom headers.
 */
function readOrganizationIdParam(c: {
    req: {
        header: (name: string) => string | undefined;
        query: (name: string) => string | undefined;
    };
}): string | undefined {
    return (
        c.req.header("X-Organization-Id") ??
        c.req.query("organizationId") ??
        undefined
    );
}

/** Owner or a member with `canManageApiKeys` may manage the org's API keys. */
function requireManageApiKeysPermission(
    role: OrgRole,
    membership: OrganizationMemberRow | null,
): void {
    if (role === "owner" || membership?.canManageApiKeys === true) return;
    throw new HTTPException(403, {
        message:
            "You don't have permission to manage this organization's API keys",
    });
}

/** Owner or a member with `canFundOrganization` may initiate a top-up. */
function requireFundPermission(
    role: OrgRole,
    membership: OrganizationMemberRow | null,
): void {
    if (role === "owner" || membership?.canFundOrganization === true) return;
    throw new HTTPException(403, {
        message: "You don't have permission to fund this organization",
    });
}

function requireOwnerRole(role: OrgRole): void {
    if (role !== "owner") {
        throw new HTTPException(403, {
            message: "Only the organization owner can do this",
        });
    }
}

async function findMemberCandidateByGithubUsername(
    db: Db,
    githubUsername: string,
) {
    const [candidate] = await db
        .select({
            id: schema.user.id,
            name: schema.user.name,
            image: schema.user.image,
            githubUsername: schema.user.githubUsername,
        })
        .from(schema.user)
        .where(
            sql`lower(${schema.user.githubUsername}) = lower(${githubUsername})`,
        )
        .limit(1);
    return candidate;
}

const CreateOrganizationSchema = z.object({
    name: z.string().trim().min(1).max(120),
});

const UpdateOrganizationSchema = z.object({
    name: z.string().trim().min(1).max(120),
});

const InviteMemberSchema = z.object({
    githubUsername: z.string().trim().min(1),
    canManageApiKeys: z.boolean().optional().default(false),
    canFundOrganization: z.boolean().optional().default(false),
});

const UpdateMemberSchema = z.object({
    canManageApiKeys: z.boolean().optional(),
    canFundOrganization: z.boolean().optional(),
});

export const organizationsRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: false }))
    /** Orgs I belong to (owned ∪ active member) — powers the account switcher. */
    .get(
        "/",
        describeRoute({
            tags: ["👤 Account"],
            description: "List organizations the current user belongs to.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const db = drizzle(c.env.DB, { schema });

            const owned = await db.query.organization.findMany({
                where: eq(schema.organization.ownerUserId, user.id),
            });
            const memberships = await db.query.organizationMember.findMany({
                where: and(
                    eq(schema.organizationMember.userId, user.id),
                    eq(schema.organizationMember.status, "active"),
                ),
            });
            const memberOrgs =
                memberships.length > 0
                    ? await db.query.organization.findMany({
                          where: or(
                              ...memberships.map((m) =>
                                  eq(schema.organization.id, m.organizationId),
                              ),
                          ),
                      })
                    : [];
            const membershipByOrgId = new Map(
                memberships.map((m) => [m.organizationId, m]),
            );

            const data = [
                ...owned.map((org) =>
                    toOrganizationSummary(org, "owner", null),
                ),
                ...memberOrgs.map((org) =>
                    toOrganizationSummary(
                        org,
                        "member",
                        membershipByOrgId.get(org.id) ?? null,
                    ),
                ),
            ];
            return c.json({ data });
        },
    )
    /** My own pending invites, across all orgs. Registered before "/:id" so
     * "invitations" is never captured as an :id param. */
    .get(
        "/invitations",
        describeRoute({
            tags: ["👤 Account"],
            description:
                "List pending organization invitations addressed to me.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const db = drizzle(c.env.DB, { schema });
            const pending = await db.query.organizationMember.findMany({
                where: and(
                    eq(schema.organizationMember.userId, user.id),
                    eq(schema.organizationMember.status, "pending"),
                ),
                orderBy: (member, { desc }) => [desc(member.createdAt)],
            });
            if (pending.length === 0) return c.json({ data: [] });

            const orgs = await db.query.organization.findMany({
                where: or(
                    ...pending.map((m) =>
                        eq(schema.organization.id, m.organizationId),
                    ),
                ),
            });
            const inviters = await db.query.user.findMany({
                where: or(
                    ...pending.map((m) =>
                        eq(schema.user.id, m.invitedByUserId),
                    ),
                ),
            });
            const orgById = new Map(orgs.map((o) => [o.id, o]));
            const inviterById = new Map(inviters.map((u) => [u.id, u]));

            return c.json({
                data: pending.map((m) => ({
                    id: m.id,
                    organizationId: m.organizationId,
                    organizationName:
                        orgById.get(m.organizationId)?.name ?? null,
                    invitedByName:
                        inviterById.get(m.invitedByUserId)?.name ?? null,
                    createdAt: m.createdAt,
                })),
            });
        },
    )
    .post(
        "/invitations/:memberId/accept",
        describeRoute({
            tags: ["👤 Account"],
            description: "Accept a pending organization invitation.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { memberId } = c.req.param();
            const db = drizzle(c.env.DB, { schema });
            const membership = await db.query.organizationMember.findFirst({
                where: and(
                    eq(schema.organizationMember.id, memberId),
                    eq(schema.organizationMember.userId, user.id),
                    eq(schema.organizationMember.status, "pending"),
                ),
            });
            if (!membership) {
                throw new HTTPException(404, {
                    message: "Invitation not found",
                });
            }
            await db
                .update(schema.organizationMember)
                .set({ status: "active", respondedAt: new Date() })
                .where(eq(schema.organizationMember.id, memberId));
            return c.json({ id: memberId, status: "active" });
        },
    )
    .post(
        "/invitations/:memberId/decline",
        describeRoute({
            tags: ["👤 Account"],
            description: "Decline a pending organization invitation.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { memberId } = c.req.param();
            const db = drizzle(c.env.DB, { schema });
            const membership = await db.query.organizationMember.findFirst({
                where: and(
                    eq(schema.organizationMember.id, memberId),
                    eq(schema.organizationMember.userId, user.id),
                    eq(schema.organizationMember.status, "pending"),
                ),
            });
            if (!membership) {
                throw new HTTPException(404, {
                    message: "Invitation not found",
                });
            }
            // Delete rather than mark "declined" — nothing reads a terminal
            // declined state, and deleting lets the same person be re-invited
            // later without colliding with the (organizationId, userId) unique
            // index.
            await db
                .delete(schema.organizationMember)
                .where(eq(schema.organizationMember.id, memberId));
            return c.json({ id: memberId });
        },
    )
    .post(
        "/",
        describeRoute({
            tags: ["👤 Account"],
            description: "Create a new organization. The caller becomes owner.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        validator("json", CreateOrganizationSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { name } = c.req.valid("json");
            const db = drizzle(c.env.DB, { schema });
            const id = crypto.randomUUID();
            const [org] = await db
                .insert(schema.organization)
                .values({
                    id,
                    name,
                    ownerUserId: user.id,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .returning();
            return c.json(toOrganizationSummary(org, "owner", null));
        },
    )
    .get(
        "/:id",
        describeRoute({
            tags: ["👤 Account"],
            description: "Get organization details, including balance.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { id } = c.req.param();
            const db = drizzle(c.env.DB, { schema });
            const { organization, role, membership } = await requireOrgAccess(
                db,
                id,
                user.id,
            );
            return c.json(
                toOrganizationSummary(organization, role, membership),
            );
        },
    )
    .patch(
        "/:id",
        describeRoute({
            tags: ["👤 Account"],
            description: "Rename an organization. Owner-only.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        validator("json", UpdateOrganizationSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { id } = c.req.param();
            const { name } = c.req.valid("json");
            const db = drizzle(c.env.DB, { schema });
            const { organization, role, membership } = await requireOrgAccess(
                db,
                id,
                user.id,
            );
            requireOwnerRole(role);
            const [updated] = await db
                .update(schema.organization)
                .set({ name, updatedAt: new Date() })
                .where(eq(schema.organization.id, id))
                .returning();
            return c.json(
                toOrganizationSummary(
                    updated ?? organization,
                    role,
                    membership,
                ),
            );
        },
    )
    .delete(
        "/:id",
        describeRoute({
            tags: ["👤 Account"],
            description:
                "Delete an organization. Owner-only. Cascades to the organization's members and API keys.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { id } = c.req.param();
            const db = drizzle(c.env.DB, { schema });
            const { role } = await requireOrgAccess(db, id, user.id);
            requireOwnerRole(role);
            const orgKeys = await db.query.apikey.findMany({
                where: eq(schema.apikey.organizationId, id),
                columns: { id: true },
            });
            await db
                .delete(schema.organization)
                .where(eq(schema.organization.id, id));
            return c.json({ id, deletedApiKeyCount: orgKeys.length });
        },
    )
    .post(
        "/:id/leave",
        describeRoute({
            tags: ["👤 Account"],
            description:
                "Leave an organization you're an active member of. Not available to the owner.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { id } = c.req.param();
            const db = drizzle(c.env.DB, { schema });
            const { role, membership } = await requireOrgAccess(
                db,
                id,
                user.id,
            );
            if (role === "owner" || !membership) {
                throw new HTTPException(400, {
                    message:
                        "The owner cannot leave their own organization. Delete it instead.",
                });
            }
            await db
                .delete(schema.organizationMember)
                .where(eq(schema.organizationMember.id, membership.id));
            return c.json({ id: membership.id });
        },
    )
    .get(
        "/:id/members",
        describeRoute({
            tags: ["👤 Account"],
            description:
                "List an organization's members and their permissions. Visible to any member, including read-only.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { id } = c.req.param();
            const db = drizzle(c.env.DB, { schema });
            await requireOrgAccess(db, id, user.id);
            const members = await db.query.organizationMember.findMany({
                where: eq(schema.organizationMember.organizationId, id),
                orderBy: (member, { desc }) => [desc(member.createdAt)],
            });
            const users =
                members.length > 0
                    ? await db.query.user.findMany({
                          where: or(
                              ...members.map((m) =>
                                  eq(schema.user.id, m.userId),
                              ),
                          ),
                      })
                    : [];
            const userById = new Map(users.map((u) => [u.id, u]));
            return c.json({
                data: members.map((m) =>
                    toMemberSummary(m, userById.get(m.userId) ?? null),
                ),
            });
        },
    )
    .post(
        "/:id/members",
        describeRoute({
            tags: ["👤 Account"],
            description:
                "Invite a member by GitHub username. Owner-only. Creates a pending invitation.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        validator("json", InviteMemberSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { id } = c.req.param();
            const input = c.req.valid("json");
            const db = drizzle(c.env.DB, { schema });
            const { organization, role } = await requireOrgAccess(
                db,
                id,
                user.id,
            );
            requireOwnerRole(role);

            const candidate = await findMemberCandidateByGithubUsername(
                db,
                input.githubUsername,
            );
            if (!candidate) {
                throw new HTTPException(404, {
                    message: `No Pollinations account found for GitHub user "${input.githubUsername}"`,
                });
            }
            if (candidate.id === organization.ownerUserId) {
                throw new HTTPException(400, {
                    message: "The owner is already part of the organization",
                });
            }

            try {
                const [member] = await db
                    .insert(schema.organizationMember)
                    .values({
                        id: crypto.randomUUID(),
                        organizationId: id,
                        userId: candidate.id,
                        canManageApiKeys: input.canManageApiKeys,
                        canFundOrganization: input.canFundOrganization,
                        invitedByUserId: user.id,
                        createdAt: new Date(),
                    })
                    .returning();
                return c.json(toMemberSummary(member, candidate));
            } catch (error) {
                if (isUniqueConstraintError(error)) {
                    throw new HTTPException(409, {
                        message:
                            "This user already has an invitation or membership",
                    });
                }
                throw error;
            }
        },
    )
    .patch(
        "/:id/members/:memberId",
        describeRoute({
            tags: ["👤 Account"],
            description: "Update a member's permissions. Owner-only.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        validator("json", UpdateMemberSchema),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { id, memberId } = c.req.param();
            const input = c.req.valid("json");
            const db = drizzle(c.env.DB, { schema });
            const { role } = await requireOrgAccess(db, id, user.id);
            requireOwnerRole(role);

            const update: Partial<
                typeof schema.organizationMember.$inferInsert
            > = {};
            if (input.canManageApiKeys !== undefined) {
                update.canManageApiKeys = input.canManageApiKeys;
            }
            if (input.canFundOrganization !== undefined) {
                update.canFundOrganization = input.canFundOrganization;
            }
            const [updated] = await db
                .update(schema.organizationMember)
                .set(update)
                .where(
                    and(
                        eq(schema.organizationMember.id, memberId),
                        eq(schema.organizationMember.organizationId, id),
                    ),
                )
                .returning();
            if (!updated) {
                throw new HTTPException(404, { message: "Member not found" });
            }
            const memberUser = await db.query.user.findFirst({
                where: eq(schema.user.id, updated.userId),
            });
            return c.json(toMemberSummary(updated, memberUser ?? null));
        },
    )
    .delete(
        "/:id/members/:memberId",
        describeRoute({
            tags: ["👤 Account"],
            description:
                "Remove a member (or revoke a pending invite). Owner-only.",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const { id, memberId } = c.req.param();
            const db = drizzle(c.env.DB, { schema });
            const { role } = await requireOrgAccess(db, id, user.id);
            requireOwnerRole(role);
            await db
                .delete(schema.organizationMember)
                .where(
                    and(
                        eq(schema.organizationMember.id, memberId),
                        eq(schema.organizationMember.organizationId, id),
                    ),
                );
            return c.json({ id: memberId });
        },
    );

export {
    requireOrgAccess,
    requireManageApiKeysPermission,
    requireFundPermission,
    readOrganizationIdParam,
};
