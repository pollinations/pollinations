import {
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    type CommunityEndpointPriceKey,
    communityEndpointPrices,
    isGroupActive,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import { and, eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";

type Db = ReturnType<typeof drizzle<typeof schema>>;

const PriceSchema = z.number().finite().min(0);
const UpdatePriceFieldsSchema = Object.fromEntries(
    COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [
        field.key,
        PriceSchema.optional(),
    ]),
) as unknown as Record<
    CommunityEndpointPriceKey,
    z.ZodType<number | undefined>
>;

const CreateGroupSchema = z.object({
    slug: z
        .string()
        .trim()
        .min(1)
        .max(60)
        .regex(
            /^[a-z0-9-]+$/,
            "Slug must be lowercase alphanumeric with hyphens",
        ),
    displayName: z.string().trim().min(1).max(120),
    description: z.string().trim().max(240).optional(),
    endpointId: z.string().min(1),
    ...UpdatePriceFieldsSchema,
});

const InviteMemberSchema = z.object({
    endpointId: z.string().min(1),
});

const TransferAdminSchema = z.object({
    newAdminUserId: z.string().min(1),
});

async function requireGroupAdmin(db: Db, slug: string, userId: string) {
    const group = await db.query.communityEndpointGroup.findFirst({
        where: eq(schema.communityEndpointGroup.slug, slug),
    });
    if (!group) {
        throw new HTTPException(404, { message: "Group not found" });
    }
    if (group.adminUserId !== userId) {
        throw new HTTPException(403, {
            message: "Only the group admin can perform this action",
        });
    }
    return group;
}

async function requireGroupMember(db: Db, slug: string, userId: string) {
    const endpoint = await db.query.communityEndpoint.findFirst({
        where: and(
            eq(schema.communityEndpoint.groupSlug, slug),
            eq(schema.communityEndpoint.ownerUserId, userId),
        ),
    });
    if (!endpoint) {
        throw new HTTPException(403, {
            message: "You are not a member of this group",
        });
    }
    return endpoint;
}

async function getGroupMemberCount(db: Db, slug: string) {
    const _members = await db.query.communityEndpoint.findMany({
        where: and(
            eq(schema.communityEndpoint.groupSlug, slug),
            isNotNull(schema.communityEndpoint.disabledAt),
        ),
    });
    // Count non-disabled members
    const allMembers = await db.query.communityEndpoint.findMany({
        where: eq(schema.communityEndpoint.groupSlug, slug),
    });
    return {
        total: allMembers.length,
        active: allMembers.filter((m) => m.disabledAt === null).length,
    };
}

async function getGroupResponse(db: Db, slug: string) {
    const group = await db.query.communityEndpointGroup.findFirst({
        where: eq(schema.communityEndpointGroup.slug, slug),
    });
    if (!group) return null;

    const members = await db.query.communityEndpoint.findMany({
        where: eq(schema.communityEndpoint.groupSlug, slug),
        columns: {
            id: true,
            ownerUserId: true,
            name: true,
            disabledAt: true,
            promptTextPrice: true,
            completionTextPrice: true,
        },
    });

    const ownerUsernames = await db.query.user.findMany({
        where: eq(schema.user.id, members[0]?.ownerUserId ?? ""),
        columns: { id: true, githubUsername: true },
    });
    const usernameMap = new Map(
        ownerUsernames.map((u) => [u.id, u.githubUsername]),
    );

    return {
        slug: group.slug,
        displayName: group.displayName,
        description: group.description,
        adminUserId: group.adminUserId,
        memberCount: members.length,
        activeMemberCount: members.filter((m) => m.disabledAt === null).length,
        members: members.map((m) => ({
            id: m.id,
            ownerUserId: m.ownerUserId,
            ownerGithubUsername: usernameMap.get(m.ownerUserId) ?? null,
            name: m.name,
            disabled: m.disabledAt !== null,
        })),
        ...communityEndpointPrices(group),
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
    };
}

export const communityEndpointGroupsRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: true }))
    .get(
        "/",
        describeRoute({
            tags: ["👤 Account"],
            summary: "List My Groups",
            description:
                "List community model groups the authenticated user is a member of.",
            responses: {
                200: { description: "Groups" },
                401: { description: "Unauthorized" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const db = drizzle(c.env.DB, { schema });

            // Find all groups where the user owns an endpoint that's in a group
            const memberEndpoints = await db.query.communityEndpoint.findMany({
                where: and(
                    eq(schema.communityEndpoint.ownerUserId, user.id),
                    isNotNull(schema.communityEndpoint.groupSlug),
                ),
                columns: { groupSlug: true },
            });

            const groupSlugs = [
                ...new Set(
                    memberEndpoints
                        .map((e) => e.groupSlug)
                        .filter(Boolean) as string[],
                ),
            ];
            const groups = await Promise.all(
                groupSlugs.map((slug) => getGroupResponse(db, slug)),
            );

            return c.json({ data: groups.filter(Boolean) });
        },
    )
    .post(
        "/",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Create Group",
            description:
                "Create a new community model group. The creator becomes the admin. One of the user's community endpoints must be assigned to the group.",
            responses: {
                200: { description: "Created group" },
                400: { description: "Invalid input" },
                401: { description: "Unauthorized" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const db = drizzle(c.env.DB, { schema });
            const body = await c.req.json();
            const data = CreateGroupSchema.parse(body);

            // Verify the endpoint belongs to the user
            const endpoint = await db.query.communityEndpoint.findFirst({
                where: and(
                    eq(schema.communityEndpoint.id, data.endpointId),
                    eq(schema.communityEndpoint.ownerUserId, user.id),
                ),
            });
            if (!endpoint) {
                throw new HTTPException(404, { message: "Endpoint not found" });
            }
            if (endpoint.groupSlug) {
                throw new HTTPException(400, {
                    message: "Endpoint is already in a group",
                });
            }

            // Check slug is unique
            const existing = await db.query.communityEndpointGroup.findFirst({
                where: eq(schema.communityEndpointGroup.slug, data.slug),
            });
            if (existing) {
                throw new HTTPException(400, {
                    message: "Group slug already taken",
                });
            }

            // Create group
            const prices = communityEndpointPrices(data);
            await db.insert(schema.communityEndpointGroup).values({
                slug: data.slug,
                displayName: data.displayName,
                description: data.description,
                adminUserId: user.id,
                ...prices,
            });

            // Add creator's endpoint to the group
            await db
                .update(schema.communityEndpoint)
                .set({ groupSlug: data.slug })
                .where(eq(schema.communityEndpoint.id, data.endpointId));

            return c.json(await getGroupResponse(db, data.slug));
        },
    )
    .post(
        "/:slug/invite",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Invite Member",
            description:
                "Invite a community model owner to join the group (admin only).",
            responses: {
                200: { description: "Invitation sent" },
                400: { description: "Invalid input" },
                401: { description: "Unauthorized" },
                403: { description: "Not admin" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const slug = c.req.param("slug");
            const db = drizzle(c.env.DB, { schema });
            await requireGroupAdmin(db, slug, user.id);

            const body = await c.req.json();
            const data = InviteMemberSchema.parse(body);

            // Verify the invitee's endpoint exists and is public
            const inviteeEndpoint = await db.query.communityEndpoint.findFirst({
                where: eq(schema.communityEndpoint.id, data.endpointId),
            });
            if (!inviteeEndpoint) {
                throw new HTTPException(404, { message: "Endpoint not found" });
            }
            if (inviteeEndpoint.ownerUserId === user.id) {
                throw new HTTPException(400, {
                    message: "Cannot invite yourself",
                });
            }
            if (inviteeEndpoint.groupSlug) {
                throw new HTTPException(400, {
                    message: "Endpoint is already in a group",
                });
            }

            // Check for existing pending invitation
            const existingInvite =
                await db.query.communityEndpointInvitation.findFirst({
                    where: and(
                        eq(schema.communityEndpointInvitation.groupSlug, slug),
                        eq(
                            schema.communityEndpointInvitation.inviteeUserId,
                            inviteeEndpoint.ownerUserId,
                        ),
                        eq(
                            schema.communityEndpointInvitation.status,
                            "pending",
                        ),
                    ),
                });
            if (existingInvite) {
                throw new HTTPException(400, {
                    message: "Invitation already pending",
                });
            }

            const id = crypto.randomUUID();
            await db.insert(schema.communityEndpointInvitation).values({
                id,
                groupSlug: slug,
                inviterUserId: user.id,
                inviteeUserId: inviteeEndpoint.ownerUserId,
            });

            return c.json({ id, inviteeUserId: inviteeEndpoint.ownerUserId });
        },
    )
    .get(
        "/invitations",
        describeRoute({
            tags: ["👤 Account"],
            summary: "List My Invitations",
            description:
                "List pending group invitations for the authenticated user.",
            responses: {
                200: { description: "Invitations" },
                401: { description: "Unauthorized" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const db = drizzle(c.env.DB, { schema });

            const invitations =
                await db.query.communityEndpointInvitation.findMany({
                    where: and(
                        eq(
                            schema.communityEndpointInvitation.inviteeUserId,
                            user.id,
                        ),
                        eq(
                            schema.communityEndpointInvitation.status,
                            "pending",
                        ),
                    ),
                });

            // Enrich with group info
            const results = await Promise.all(
                invitations.map(async (inv) => {
                    const group =
                        await db.query.communityEndpointGroup.findFirst({
                            where: eq(
                                schema.communityEndpointGroup.slug,
                                inv.groupSlug,
                            ),
                        });
                    return {
                        id: inv.id,
                        groupSlug: inv.groupSlug,
                        groupDisplayName: group?.displayName ?? inv.groupSlug,
                        inviterUserId: inv.inviterUserId,
                        createdAt: inv.createdAt,
                    };
                }),
            );

            return c.json({ data: results });
        },
    )
    .post(
        "/invitations/:id/accept",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Accept Invitation",
            description:
                "Accept a group invitation. The user's most recently created endpoint is added to the group.",
            responses: {
                200: { description: "Joined group" },
                401: { description: "Unauthorized" },
                404: { description: "Invitation not found" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const id = c.req.param("id");
            const db = drizzle(c.env.DB, { schema });

            const invitation =
                await db.query.communityEndpointInvitation.findFirst({
                    where: and(
                        eq(schema.communityEndpointInvitation.id, id),
                        eq(
                            schema.communityEndpointInvitation.inviteeUserId,
                            user.id,
                        ),
                        eq(
                            schema.communityEndpointInvitation.status,
                            "pending",
                        ),
                    ),
                });
            if (!invitation) {
                throw new HTTPException(404, {
                    message: "Invitation not found",
                });
            }

            // Find the invitee's most recent non-grouped endpoint
            const endpoint = await db.query.communityEndpoint.findFirst({
                where: and(eq(schema.communityEndpoint.ownerUserId, user.id)),
                orderBy: (endpoint, { desc }) => [desc(endpoint.createdAt)],
            });
            if (!endpoint) {
                throw new HTTPException(400, {
                    message: "You have no community endpoints",
                });
            }
            if (endpoint.groupSlug) {
                throw new HTTPException(400, {
                    message: "Your endpoint is already in a group",
                });
            }

            // Accept: add endpoint to group, mark invitation accepted
            await db
                .update(schema.communityEndpoint)
                .set({ groupSlug: invitation.groupSlug })
                .where(eq(schema.communityEndpoint.id, endpoint.id));

            await db
                .update(schema.communityEndpointInvitation)
                .set({ status: "accepted" })
                .where(eq(schema.communityEndpointInvitation.id, id));

            return c.json(await getGroupResponse(db, invitation.groupSlug));
        },
    )
    .post(
        "/invitations/:id/decline",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Decline Invitation",
            description: "Decline a group invitation.",
            responses: {
                200: { description: "Invitation declined" },
                401: { description: "Unauthorized" },
                404: { description: "Invitation not found" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const id = c.req.param("id");
            const db = drizzle(c.env.DB, { schema });

            const invitation =
                await db.query.communityEndpointInvitation.findFirst({
                    where: and(
                        eq(schema.communityEndpointInvitation.id, id),
                        eq(
                            schema.communityEndpointInvitation.inviteeUserId,
                            user.id,
                        ),
                        eq(
                            schema.communityEndpointInvitation.status,
                            "pending",
                        ),
                    ),
                });
            if (!invitation) {
                throw new HTTPException(404, {
                    message: "Invitation not found",
                });
            }

            await db
                .update(schema.communityEndpointInvitation)
                .set({ status: "declined" })
                .where(eq(schema.communityEndpointInvitation.id, id));

            return c.json({ ok: true });
        },
    )
    .post(
        "/:slug/leave",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Leave Group",
            description:
                "Leave a group. Your endpoint is removed from the group. If fewer than 2 members remain, the group auto-dissolves.",
            responses: {
                200: { description: "Left group" },
                401: { description: "Unauthorized" },
                403: { description: "Not a member" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const slug = c.req.param("slug");
            const db = drizzle(c.env.DB, { schema });

            const endpoint = await requireGroupMember(db, slug, user.id);

            // Remove from group
            await db
                .update(schema.communityEndpoint)
                .set({ groupSlug: null })
                .where(eq(schema.communityEndpoint.id, endpoint.id));

            // Check if group should dissolve
            const { active } = await getGroupMemberCount(db, slug);
            if (!isGroupActive(active)) {
                // Auto-dissolve: remove all remaining members
                const remaining = await db.query.communityEndpoint.findMany({
                    where: eq(schema.communityEndpoint.groupSlug, slug),
                });
                for (const member of remaining) {
                    await db
                        .update(schema.communityEndpoint)
                        .set({ groupSlug: null })
                        .where(eq(schema.communityEndpoint.id, member.id));
                }
                // Delete group and pending invitations
                await db
                    .delete(schema.communityEndpointInvitation)
                    .where(
                        eq(schema.communityEndpointInvitation.groupSlug, slug),
                    );
                await db
                    .delete(schema.communityEndpointGroup)
                    .where(eq(schema.communityEndpointGroup.slug, slug));
                return c.json({ dissolved: true });
            }

            // If the leaving member was admin, auto-transfer to first remaining active member
            const group = await db.query.communityEndpointGroup.findFirst({
                where: eq(schema.communityEndpointGroup.slug, slug),
            });
            if (group?.adminUserId === user.id) {
                const nextAdmin = await db.query.communityEndpoint.findFirst({
                    where: and(eq(schema.communityEndpoint.groupSlug, slug)),
                });
                if (nextAdmin) {
                    await db
                        .update(schema.communityEndpointGroup)
                        .set({ adminUserId: nextAdmin.ownerUserId })
                        .where(eq(schema.communityEndpointGroup.slug, slug));
                }
            }

            return c.json(await getGroupResponse(db, slug));
        },
    )
    .delete(
        "/:slug/members/:endpointId",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Remove Member",
            description:
                "Remove a member from the group (admin only). If fewer than 2 members remain, the group auto-dissolves.",
            responses: {
                200: { description: "Member removed" },
                401: { description: "Unauthorized" },
                403: { description: "Not admin" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const slug = c.req.param("slug");
            const endpointId = c.req.param("endpointId");
            const db = drizzle(c.env.DB, { schema });

            await requireGroupAdmin(db, slug, user.id);

            const endpoint = await db.query.communityEndpoint.findFirst({
                where: and(
                    eq(schema.communityEndpoint.id, endpointId),
                    eq(schema.communityEndpoint.groupSlug, slug),
                ),
            });
            if (!endpoint) {
                throw new HTTPException(404, { message: "Member not found" });
            }

            // Remove from group
            await db
                .update(schema.communityEndpoint)
                .set({ groupSlug: null })
                .where(eq(schema.communityEndpoint.id, endpointId));

            // Check dissolve
            const { active } = await getGroupMemberCount(db, slug);
            if (!isGroupActive(active)) {
                const remaining = await db.query.communityEndpoint.findMany({
                    where: eq(schema.communityEndpoint.groupSlug, slug),
                });
                for (const member of remaining) {
                    await db
                        .update(schema.communityEndpoint)
                        .set({ groupSlug: null })
                        .where(eq(schema.communityEndpoint.id, member.id));
                }
                await db
                    .delete(schema.communityEndpointInvitation)
                    .where(
                        eq(schema.communityEndpointInvitation.groupSlug, slug),
                    );
                await db
                    .delete(schema.communityEndpointGroup)
                    .where(eq(schema.communityEndpointGroup.slug, slug));
                return c.json({ dissolved: true });
            }

            return c.json(await getGroupResponse(db, slug));
        },
    )
    .post(
        "/:slug/transfer",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Transfer Admin",
            description:
                "Transfer adminship to another current member (admin only).",
            responses: {
                200: { description: "Admin transferred" },
                400: { description: "Invalid input" },
                401: { description: "Unauthorized" },
                403: { description: "Not admin" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const slug = c.req.param("slug");
            const db = drizzle(c.env.DB, { schema });

            await requireGroupAdmin(db, slug, user.id);

            const body = await c.req.json();
            const data = TransferAdminSchema.parse(body);

            // Verify target is a current member
            const targetEndpoint = await db.query.communityEndpoint.findFirst({
                where: and(
                    eq(schema.communityEndpoint.groupSlug, slug),
                    eq(
                        schema.communityEndpoint.ownerUserId,
                        data.newAdminUserId,
                    ),
                ),
            });
            if (!targetEndpoint) {
                throw new HTTPException(400, {
                    message: "Target user is not a member of this group",
                });
            }

            await db
                .update(schema.communityEndpointGroup)
                .set({ adminUserId: data.newAdminUserId })
                .where(eq(schema.communityEndpointGroup.slug, slug));

            return c.json(await getGroupResponse(db, slug));
        },
    )
    .patch(
        "/:slug",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Update Group",
            description:
                "Update group display name, description, or pricing (admin only). Pricing changes require all members to match.",
            responses: {
                200: { description: "Updated group" },
                400: { description: "Invalid input" },
                401: { description: "Unauthorized" },
                403: { description: "Not admin" },
            },
        }),
        async (c) => {
            const user = c.var.auth.requireUser();
            const slug = c.req.param("slug");
            const db = drizzle(c.env.DB, { schema });

            await requireGroupAdmin(db, slug, user.id);

            const body = await c.req.json();
            const updates: Record<string, unknown> = {};

            if (body.displayName) updates.displayName = body.displayName;
            if (body.description !== undefined)
                updates.description = body.description;

            // Pricing updates
            for (const field of COMMUNITY_ENDPOINT_PRICE_FIELDS) {
                if (body[field.key] !== undefined) {
                    updates[field.key] = body[field.key];
                }
            }

            if (Object.keys(updates).length === 0) {
                throw new HTTPException(400, {
                    message: "No updates provided",
                });
            }

            updates.updatedAt = new Date();

            await db
                .update(schema.communityEndpointGroup)
                .set(updates)
                .where(eq(schema.communityEndpointGroup.slug, slug));

            return c.json(await getGroupResponse(db, slug));
        },
    );
