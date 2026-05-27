const DOMAIN = "media.pollinations.ai";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export const VISIBILITIES = ["private", "unlisted", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export type CatalogAuth = {
    userId: string | null;
    apiKeyId: string | null;
    byopClientKeyId: string | null;
    byopClientName: string | null;
    byopClientUserId: string | null;
};

export type CatalogOptions = {
    visibility: Visibility;
    parents: string[];
    relationship: string;
    tags: string[];
    expiresAt: string | null;
};

type SaveCatalogInput = {
    hash: string;
    fullSha256: string;
    contentType: string;
    size: number;
    auth: CatalogAuth;
    options: CatalogOptions;
};

type MediaRow = {
    id: string;
    hash: string;
    contentType: string;
    size: number;
    visibility: Visibility;
    createdAt: string;
    updatedAt: string;
    verifiedAppKeyId: string | null;
    verifiedAppName: string | null;
    verifiedAppOwnerUserId: string | null;
    tags: string | null;
    relationship?: string | null;
    parentHash?: string | null;
    relationCreatedAt?: string | null;
};

type Cursor = {
    createdAt: string;
    id: string;
};

export type CatalogItem = {
    id: string;
    hash: string;
    url: string;
    contentType: string;
    size: number;
    visibility: Visibility;
    createdAt: string;
    updatedAt: string;
    verifiedApp: {
        keyId: string;
        name: string | null;
        ownerUserId: string | null;
    } | null;
    tags: string[];
};

export type ChildCatalogItem = CatalogItem & {
    parentHash: string;
    relationship: string;
    relationCreatedAt: string;
};

export type CatalogList<T> = {
    items: T[];
    nextCursor: string | null;
};

export function catalogUrl(hash: string): string {
    return `https://${DOMAIN}/${hash}`;
}

export function parseLimit(raw: string | null): number {
    const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_LIMIT;
    if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
    return Math.min(parsed, MAX_LIMIT);
}

export async function saveCatalogEntry(
    db: D1Database,
    input: SaveCatalogInput,
): Promise<{ cataloged: true; entryId: string }> {
    if (!input.auth.userId || !input.auth.apiKeyId) {
        throw new Error("Verified media uploads require userId and apiKeyId");
    }

    const now = new Date().toISOString();
    const entryId = crypto.randomUUID();
    const parents = input.options.parents.filter((hash) => hash !== input.hash);

    await db.batch([
        db
            .prepare(
                `INSERT INTO media_objects (
                    hash, full_sha256, content_type, size,
                    created_at, updated_at, last_seen_at, expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(hash) DO UPDATE SET
                    full_sha256 = excluded.full_sha256,
                    content_type = excluded.content_type,
                    size = excluded.size,
                    updated_at = excluded.updated_at,
                    last_seen_at = excluded.last_seen_at,
                    expires_at = COALESCE(media_objects.expires_at, excluded.expires_at)`,
            )
            .bind(
                input.hash,
                input.fullSha256,
                input.contentType,
                input.size,
                now,
                now,
                now,
                input.options.expiresAt,
            ),
        db
            .prepare(
                `INSERT INTO media_entries (
                    id, hash, owner_user_id, api_key_id,
                    verified_app_key_id, verified_app_name,
                    verified_app_owner_user_id, visibility, source,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upload', ?, ?)
                ON CONFLICT(owner_user_id, hash) DO UPDATE SET
                    api_key_id = excluded.api_key_id,
                    verified_app_key_id = excluded.verified_app_key_id,
                    verified_app_name = excluded.verified_app_name,
                    verified_app_owner_user_id = excluded.verified_app_owner_user_id,
                    visibility = excluded.visibility,
                    updated_at = excluded.updated_at`,
            )
            .bind(
                entryId,
                input.hash,
                input.auth.userId,
                input.auth.apiKeyId,
                input.auth.byopClientKeyId,
                input.auth.byopClientName,
                input.auth.byopClientUserId,
                input.options.visibility,
                now,
                now,
            ),
    ]);

    const tagStatements = input.options.tags.map((tag) =>
        db
            .prepare(
                `INSERT OR IGNORE INTO media_tags (
                    hash, tag, verified_app_key_id, created_at
                ) VALUES (?, ?, ?, ?)`,
            )
            .bind(input.hash, tag, input.auth.byopClientKeyId ?? "", now),
    );
    const edgeStatements = parents.map((parentHash) =>
        db
            .prepare(
                `INSERT OR IGNORE INTO media_edges (
                    parent_hash, child_hash, relationship,
                    actor_user_id, verified_app_key_id, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .bind(
                parentHash,
                input.hash,
                input.options.relationship,
                input.auth.userId,
                input.auth.byopClientKeyId,
                now,
            ),
    );

    if (tagStatements.length || edgeStatements.length) {
        await db.batch([...tagStatements, ...edgeStatements]);
    }

    const row = await db
        .prepare(
            `SELECT id FROM media_entries
            WHERE owner_user_id = ? AND hash = ?`,
        )
        .bind(input.auth.userId, input.hash)
        .first<{ id: string }>();

    return { cataloged: true, entryId: row?.id ?? entryId };
}

export async function listUserMedia(
    db: D1Database,
    ownerUserId: string,
    limit: number,
    cursor: string | null,
): Promise<CatalogList<CatalogItem>> {
    const decoded = decodeCursor(cursor);
    const args: unknown[] = [ownerUserId];
    let cursorClause = "";
    if (decoded) {
        cursorClause =
            "AND (e.created_at < ? OR (e.created_at = ? AND e.id < ?))";
        args.push(decoded.createdAt, decoded.createdAt, decoded.id);
    }
    args.push(limit + 1);

    const rows = await db
        .prepare(
            `SELECT
                e.id,
                e.hash,
                o.content_type AS contentType,
                o.size,
                e.visibility,
                e.created_at AS createdAt,
                e.updated_at AS updatedAt,
                e.verified_app_key_id AS verifiedAppKeyId,
                e.verified_app_name AS verifiedAppName,
                e.verified_app_owner_user_id AS verifiedAppOwnerUserId,
                GROUP_CONCAT(DISTINCT t.tag) AS tags
            FROM media_entries e
            JOIN media_objects o ON o.hash = e.hash
            LEFT JOIN media_tags t ON t.hash = e.hash
            WHERE e.owner_user_id = ?
            ${cursorClause}
            GROUP BY e.id
            ORDER BY e.created_at DESC, e.id DESC
            LIMIT ?`,
        )
        .bind(...args)
        .all<MediaRow>();

    return paginateRows(rows.results ?? [], limit, rowToItem);
}

export async function listAppMedia(
    db: D1Database,
    appKeyId: string,
    limit: number,
    cursor: string | null,
): Promise<CatalogList<CatalogItem>> {
    const decoded = decodeCursor(cursor);
    const args: unknown[] = [appKeyId];
    let cursorClause = "";
    if (decoded) {
        cursorClause =
            "AND (e.created_at < ? OR (e.created_at = ? AND e.id < ?))";
        args.push(decoded.createdAt, decoded.createdAt, decoded.id);
    }
    args.push(limit + 1);

    const rows = await db
        .prepare(
            `SELECT
                e.id,
                e.hash,
                o.content_type AS contentType,
                o.size,
                e.visibility,
                e.created_at AS createdAt,
                e.updated_at AS updatedAt,
                e.verified_app_key_id AS verifiedAppKeyId,
                e.verified_app_name AS verifiedAppName,
                e.verified_app_owner_user_id AS verifiedAppOwnerUserId,
                GROUP_CONCAT(DISTINCT t.tag) AS tags
            FROM media_entries e
            JOIN media_objects o ON o.hash = e.hash
            LEFT JOIN media_tags t ON t.hash = e.hash
            WHERE e.verified_app_key_id = ?
              AND e.visibility = 'public'
            ${cursorClause}
            GROUP BY e.id
            ORDER BY e.created_at DESC, e.id DESC
            LIMIT ?`,
        )
        .bind(...args)
        .all<MediaRow>();

    return paginateRows(rows.results ?? [], limit, rowToItem);
}

export async function listChildren(
    db: D1Database,
    parentHash: string,
    limit: number,
    cursor: string | null,
): Promise<CatalogList<ChildCatalogItem>> {
    const decoded = decodeCursor(cursor);
    const args: unknown[] = [parentHash];
    let cursorClause = "";
    if (decoded) {
        cursorClause =
            "AND (ed.created_at < ? OR (ed.created_at = ? AND e.id < ?))";
        args.push(decoded.createdAt, decoded.createdAt, decoded.id);
    }
    args.push(limit + 1);

    const rows = await db
        .prepare(
            `SELECT
                e.id,
                e.hash,
                o.content_type AS contentType,
                o.size,
                e.visibility,
                e.created_at AS createdAt,
                e.updated_at AS updatedAt,
                e.verified_app_key_id AS verifiedAppKeyId,
                e.verified_app_name AS verifiedAppName,
                e.verified_app_owner_user_id AS verifiedAppOwnerUserId,
                ed.parent_hash AS parentHash,
                ed.relationship,
                ed.created_at AS relationCreatedAt,
                GROUP_CONCAT(DISTINCT t.tag) AS tags
            FROM media_edges ed
            JOIN media_entries e
                ON e.hash = ed.child_hash
                AND e.owner_user_id = ed.actor_user_id
            JOIN media_objects o ON o.hash = e.hash
            LEFT JOIN media_tags t ON t.hash = e.hash
            WHERE ed.parent_hash = ?
              AND e.visibility IN ('public', 'unlisted')
            ${cursorClause}
            GROUP BY e.id, ed.parent_hash, ed.relationship, ed.created_at
            ORDER BY ed.created_at DESC, e.id DESC
            LIMIT ?`,
        )
        .bind(...args)
        .all<MediaRow>();

    return paginateRows(rows.results ?? [], limit, rowToChildItem);
}

function paginateRows<T>(
    rows: MediaRow[],
    limit: number,
    mapRow: (row: MediaRow) => T,
): CatalogList<T> {
    const page = rows.slice(0, limit);
    const nextRow = rows.length > limit ? page[page.length - 1] : null;
    return {
        items: page.map(mapRow),
        nextCursor: nextRow
            ? encodeCursor({
                  createdAt: nextRow.relationCreatedAt ?? nextRow.createdAt,
                  id: nextRow.id,
              })
            : null,
    };
}

function rowToItem(row: MediaRow): CatalogItem {
    return {
        id: row.id,
        hash: row.hash,
        url: catalogUrl(row.hash),
        contentType: row.contentType,
        size: row.size,
        visibility: row.visibility,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        verifiedApp: row.verifiedAppKeyId
            ? {
                  keyId: row.verifiedAppKeyId,
                  name: row.verifiedAppName,
                  ownerUserId: row.verifiedAppOwnerUserId,
              }
            : null,
        tags: parseTags(row.tags),
    };
}

function rowToChildItem(row: MediaRow): ChildCatalogItem {
    return {
        ...rowToItem(row),
        parentHash: row.parentHash ?? "",
        relationship: row.relationship ?? "derived_from",
        relationCreatedAt: row.relationCreatedAt ?? row.createdAt,
    };
}

function parseTags(tags: string | null): string[] {
    if (!tags) return [];
    return tags.split(",").filter(Boolean);
}

function encodeCursor(cursor: Cursor): string {
    return btoa(JSON.stringify(cursor));
}

function decodeCursor(cursor: string | null): Cursor | null {
    if (!cursor) return null;
    try {
        const parsed = JSON.parse(atob(cursor)) as Partial<Cursor>;
        if (
            typeof parsed.createdAt !== "string" ||
            typeof parsed.id !== "string"
        ) {
            return null;
        }
        return { createdAt: parsed.createdAt, id: parsed.id };
    } catch {
        return null;
    }
}
