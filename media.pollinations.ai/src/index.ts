import { Hono } from "hono";
import { cors } from "hono/cors";
import { describeRoute, openAPIRouteHandler, resolver } from "hono-openapi";
import { z } from "zod";

const DOMAIN = "media.pollinations.ai";
const KEY_VERIFY_URL = "https://gen.pollinations.ai/account/key";
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const HASH_PATTERN = /^[a-f0-9]{16}$/i;
const DEFAULT_MAX_SIZE = 10485760; // 10 MB

// Hard-coded limits (not configurable - these are API contract constraints)
const MAX_PUBLIC_TAGS = 20;
const MAX_PRIVATE_TAGS = 50;
const TAG_MAX_LEN = 32;
const TAG_PATTERN = /^[a-z0-9\-_]+$/;

interface Env {
  MEDIA_BUCKET: R2Bucket;
  DB: D1Database;
  MAX_FILE_SIZE: string;
}

interface AuthResult {
  valid: boolean;
  type: string;
  name: string | null;
}

interface MediaItem {
  id: string;
  url: string;
  contentType: string;
  size: number;
  createdAt: string;
  publicTags?: string[];
  privateTags?: string[];
}

function normalizeTag(tag: string): string {
  return tag.toLowerCase().trim();
}

function validateTag(tag: string): boolean {
  const normalized = normalizeTag(tag);
  return (
    normalized.length > 0 &&
    normalized.length <= TAG_MAX_LEN &&
    TAG_PATTERN.test(normalized)
  );
}

async function verifyApiKey(apiKey: string): Promise<AuthResult | null> {
  try {
    const res = await fetch(KEY_VERIFY_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json<AuthResult>();
    return data.valid ? data : null;
  } catch {
    return null;
  }
}

function extractApiKey(req: Request): string | null {
  const bearer = req.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (bearer) return bearer;
  return new URL(req.url).searchParams.get("key");
}

function fileTooLargeError(maxSize: number): { error: string } {
  return { error: `File too large. Max size: ${maxSize / 1024 / 1024}MB` };
}

function mediaUrl(hash: string): string {
  return `https://${DOMAIN}/${hash}`;
}

function encodeCursor(data: { createdAt: string; hash: string }): string {
  const encoded = btoa(JSON.stringify(data));
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function decodeCursor(cursor: string): { createdAt: string; hash: string } | null {
  try {
    const padded = cursor.padEnd(
      cursor.length + ((4 - (cursor.length % 4)) % 4),
      "=",
    );
    const decoded = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

const UploadResponseSchema = z.object({
  id: z.string().describe("16-char hex content hash"),
  url: z.string().describe("Public retrieval URL"),
  contentType: z.string(),
  size: z.number().int().describe("File size in bytes"),
  duplicate: z.boolean().describe("true if file already existed"),
});

const ErrorSchema = z.object({
  error: z.string(),
});

const MetadataResponseSchema = z.object({
  hash: z.string().describe("16-char hex content hash"),
  contentType: z.string(),
  size: z.number().int().describe("File size in bytes"),
  uploadedAt: z
    .string()
    .optional()
    .describe("ISO-8601 upload timestamp, when recorded"),
});

const api = new Hono<{ Bindings: Env }>();

api.post(
  "/upload",
  describeRoute({
    tags: ["media.pollinations.ai"],
    summary: "Upload media",
    description:
      "Upload an image, audio, or video file. Supports multipart/form-data, raw binary, or base64 JSON. Returns a content-addressed hash URL. The hash includes the filename, so the same content with different filenames gets different URLs. Re-uploading resets the 14-day TTL.",
    responses: {
      200: {
        description: "Upload successful",
        content: {
          "application/json": {
            schema: resolver(UploadResponseSchema),
          },
        },
      },
      401: {
        description: "Missing or invalid API key",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
      413: {
        description: "File too large (max 10MB)",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
    },
  }),
  async (c) => {
    const apiKey = extractApiKey(c.req.raw);
    if (!apiKey) {
      return c.json(
        {
          error: "API key required. Pass via Authorization: Bearer <key> or ?key=<key>",
        },
        401,
      );
    }
    const authResult = await verifyApiKey(apiKey);
    if (!authResult) {
      return c.json({ error: "Invalid or expired API key" }, 401);
    }

    const maxSize = parseInt(c.env.MAX_FILE_SIZE, 10) || DEFAULT_MAX_SIZE;

    // Fail fast: reject oversized requests before reading the body into memory
    const contentLength = parseInt(
      c.req.header("content-length") || "0",
      10,
    );
    if (contentLength > maxSize) {
      return c.json(fileTooLargeError(maxSize), 413);
    }

    let fileBuffer: ArrayBuffer;
    let contentType: string;
    let fileName: string | undefined;

    const requestContentType = c.req.header("content-type") || "";

    try {
      if (requestContentType.includes("multipart/form-data")) {
        const formData = await c.req.formData();
        const file = formData.get("file") as File | null;

        if (!(file instanceof File)) {
          return c.json(
            {
              error: "No file provided. Use 'file' field in form-data.",
            },
            400,
          );
        }

        if (file.size > maxSize) {
          return c.json(fileTooLargeError(maxSize), 413);
        }

        fileBuffer = await file.arrayBuffer();
        contentType = file.type || detectContentType(file.name);
        fileName = file.name;
      } else if (requestContentType.includes("application/json")) {
        const body = await c.req.json<{
          data: string;
          contentType?: string;
          name?: string;
        }>();

        if (!body.data) {
          return c.json(
            { error: "Missing 'data' field in JSON body" },
            400,
          );
        }

        const base64Data = body.data.includes(",")
          ? body.data.split(",")[1]
          : body.data;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        fileBuffer = bytes.buffer;

        if (fileBuffer.byteLength > maxSize) {
          return c.json(fileTooLargeError(maxSize), 413);
        }
        if (fileBuffer.byteLength === 0) {
          return c.json({ error: "Empty file" }, 400);
        }

        contentType = body.contentType || "application/octet-stream";
        fileName = body.name;
      } else {
        fileBuffer = await c.req.arrayBuffer();

        if (fileBuffer.byteLength > maxSize) {
          return c.json(fileTooLargeError(maxSize), 413);
        }
        if (fileBuffer.byteLength === 0) {
          return c.json({ error: "Empty file" }, 400);
        }

        contentType = requestContentType || "application/octet-stream";
      }

      const hash = await generateHash(fileBuffer, fileName);

      const existing = await c.env.MEDIA_BUCKET.head(hash);

      // Always re-PUT to reset the R2 object timestamp (resets lifecycle TTL).
      await c.env.MEDIA_BUCKET.put(hash, fileBuffer, {
        httpMetadata: {
          contentType,
          cacheControl: CACHE_CONTROL,
        },
        customMetadata: {
          uploadedAt: new Date().toISOString(),
          originalName: fileName || "",
          uploadedBy: authResult.name || "",
          keyType: authResult.type,
        },
      });

      // Index in media_objects; ignore conflicts (re-upload of same hash).
      // Don't fail the upload if the DB write fails — blob is safely in R2.
      try {
        await c.env.DB
          .prepare(
            `INSERT OR IGNORE INTO media_objects
               (hash, owner, content_type, size, created_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(
            hash,
            authResult.name || "",
            contentType,
            fileBuffer.byteLength,
            new Date().toISOString(),
          )
          .run();
      } catch (dbError) {
        console.error("Database error during upload:", dbError);
      }

      console.log(
        JSON.stringify({
          event: "upload",
          hash,
          size: fileBuffer.byteLength,
          contentType,
          keyType: authResult.type,
          uploadedBy: authResult.name || "unknown",
          duplicate: !!existing,
        }),
      );

      return c.json({
        id: hash,
        url: mediaUrl(hash),
        contentType,
        size: fileBuffer.byteLength,
        duplicate: !!existing,
      });
    } catch (error) {
      console.error("Upload error:", error);
      return c.json({ error: "Upload failed" }, 500);
    }
  },
);

api.get(
  "/:hash",
  describeRoute({
    tags: ["media.pollinations.ai"],
    summary: "Retrieve media",
    description:
      "Get a file by its content hash. No authentication required. Responses are cached immutably.",
    responses: {
      200: { description: "File content with appropriate Content-Type" },
      400: {
        description: "Invalid hash format",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
      404: {
        description: "File not found",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
    },
  }),
  async (c) => {
    const hash = c.req.param("hash");

    if (!HASH_PATTERN.test(hash)) {
      return c.json({ error: "Invalid hash format" }, 400);
    }

    try {
      const object = await c.env.MEDIA_BUCKET.get(hash);

      if (!object) {
        return c.json({ error: "Not found" }, 404);
      }

      const headers = new Headers();
      headers.set(
        "Content-Type",
        object.httpMetadata?.contentType || "application/octet-stream",
      );
      headers.set("Cache-Control", CACHE_CONTROL);
      headers.set("X-Content-Hash", hash);
      headers.set("X-Content-Size", object.size.toString());

      const originalName = object.customMetadata?.originalName;
      if (originalName) {
        const sanitized = encodeURIComponent(originalName);
        headers.set(
          "Content-Disposition",
          `inline; filename*=UTF-8''${sanitized}`,
        );
      }

      return new Response(object.body, { headers });
    } catch (error) {
      console.error("Retrieve error:", error);
      return c.json({ error: "Retrieval failed" }, 500);
    }
  },
);

api.get(
  "/:hash/metadata",
  describeRoute({
    tags: ["media.pollinations.ai"],
    summary: "Get file metadata",
    description:
      "Return file metadata (hash, content type, size, upload timestamp) as JSON without downloading the file body.",
    responses: {
      200: {
        description: "File metadata",
        content: {
          "application/json": {
            schema: resolver(MetadataResponseSchema),
          },
        },
      },
      400: {
        description: "Invalid hash format",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
      404: {
        description: "File not found",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
    },
  }),
  async (c) => {
    const hash = c.req.param("hash");

    if (!HASH_PATTERN.test(hash)) {
      return c.json({ error: "Invalid hash format" }, 400);
    }

    try {
      const object = await c.env.MEDIA_BUCKET.head(hash);

      if (!object) {
        return c.json({ error: "Not found" }, 404);
      }

      c.header("Cache-Control", CACHE_CONTROL);
      return c.json({
        hash,
        contentType:
          object.httpMetadata?.contentType ||
          "application/octet-stream",
        size: object.size,
        ...(object.customMetadata?.uploadedAt && {
          uploadedAt: object.customMetadata.uploadedAt,
        }),
      });
    } catch (error) {
      console.error("Metadata error:", error);
      return c.json({ error: "Metadata lookup failed" }, 500);
    }
  },
);

api.on(
  "HEAD",
  "/:hash",
  describeRoute({
    tags: ["media.pollinations.ai"],
    summary: "Check if media exists",
    description:
      "Check existence and metadata without downloading the file.",
    responses: {
      200: {
        description:
          "File exists (headers include Content-Type, Content-Length, X-Content-Hash)",
      },
      400: { description: "Invalid hash format" },
      404: { description: "File not found" },
    },
  }),
  async (c) => {
    const hash = c.req.param("hash");

    if (!HASH_PATTERN.test(hash)) {
      return new Response(null, { status: 400 });
    }

    try {
      const object = await c.env.MEDIA_BUCKET.head(hash);

      if (!object) {
        return new Response(null, { status: 404 });
      }

      const headers = new Headers();
      headers.set(
        "Content-Type",
        object.httpMetadata?.contentType || "application/octet-stream",
      );
      headers.set("Content-Length", object.size.toString());
      headers.set("Cache-Control", CACHE_CONTROL);
      headers.set("X-Content-Hash", hash);

      if (object.customMetadata?.uploadedAt) {
        headers.set("X-Uploaded-At", object.customMetadata.uploadedAt);
      }

      return new Response(null, { status: 200, headers });
    } catch {
      return new Response(null, { status: 500 });
    }
  },
);

api.get(
  "/me/media",
  describeRoute({
    tags: ["media.pollinations.ai"],
    summary: "List my uploads",
    description:
      "Retrieve a paginated list of your uploaded media with tags. Requires authentication.",
    responses: {
      200: {
        description: "Paginated list of uploads",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                items: z.array(
                  z.object({
                    id: z.string(),
                    url: z.string(),
                    contentType: z.string(),
                    size: z.number(),
                    createdAt: z.string(),
                    publicTags: z
                      .array(z.string())
                      .optional(),
                    privateTags: z
                      .array(z.string())
                      .optional(),
                  }),
                ),
                nextCursor: z.string().optional(),
              }),
            ),
          },
        },
      },
      400: {
        description: "Invalid request (bad cursor)",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
    },
  }),
  async (c) => {
    const apiKey = extractApiKey(c.req.raw);
    if (!apiKey) {
      return c.json({ error: "API key required" }, 401);
    }
    const authResult = await verifyApiKey(apiKey);
    if (!authResult) {
      return c.json({ error: "Invalid or expired API key" }, 401);
    }

    const limit = Math.min(
      parseInt(c.req.query("limit") || "50"),
      500,
    );
    if (!Number.isFinite(limit) || limit < 1) {
      return c.json({ error: "Invalid limit" }, 400);
    }

    const cursor = c.req.query("cursor");

    try {
      let query = `SELECT m.* FROM media_objects m WHERE m.owner = ?`;
      const params: (string | number)[] = [authResult.name || ""];

      if (cursor) {
        const decoded = decodeCursor(cursor);
        if (!decoded) {
          return c.json({ error: "Invalid cursor" }, 400);
        }
        query += ` AND (m.created_at < ? OR (m.created_at = ? AND m.hash > ?))`;
        params.push(decoded.createdAt, decoded.createdAt, decoded.hash);
      }

      query += ` ORDER BY m.created_at DESC, m.hash DESC LIMIT ?`;
      params.push(limit + 1);

      const result = await c.env.DB.prepare(query).bind(...params).all<{
        hash: string;
        content_type: string;
        size: number;
        created_at: string;
      }>();

      let items: MediaItem[] = [];
      let nextCursor: string | undefined;

      if (result.results && result.results.length > 0) {
        const hasMore = result.results.length > limit;
        const rows = hasMore ? result.results.slice(0, limit) : result.results;

        const hashes = rows.map((r) => r.hash);

        // Fetch tags for all media items in batch
        const publicTagsMap = new Map<string, string[]>();
        const privateTagsMap = new Map<string, string[]>();

        if (hashes.length > 0) {
          const placeholders = hashes.map(() => "?").join(",");

          const publicTagResult = await c.env.DB
            .prepare(
              `SELECT hash, tag FROM public_tags WHERE hash IN (${placeholders})`,
            )
            .bind(...hashes)
            .all<{ hash: string; tag: string }>();

          const privateTagResult = await c.env.DB
            .prepare(
              `SELECT hash, tag FROM private_tags WHERE hash IN (${placeholders}) AND owner = ?`,
            )
            .bind(...hashes, authResult.name || "")
            .all<{ hash: string; tag: string }>();

          publicTagResult.results?.forEach((tag) => {
            if (!publicTagsMap.has(tag.hash)) {
              publicTagsMap.set(tag.hash, []);
            }
            publicTagsMap.get(tag.hash)!.push(tag.tag);
          });

          privateTagResult.results?.forEach((tag) => {
            if (!privateTagsMap.has(tag.hash)) {
              privateTagsMap.set(tag.hash, []);
            }
            privateTagsMap.get(tag.hash)!.push(tag.tag);
          });
        }

        items = rows.map((row) => ({
          id: row.hash,
          url: mediaUrl(row.hash),
          contentType: row.content_type,
          size: row.size,
          createdAt: row.created_at,
          publicTags: publicTagsMap.get(row.hash) || [],
          privateTags: privateTagsMap.get(row.hash) || [],
        }));

        if (hasMore) {
          const lastRow = rows[rows.length - 1];
          nextCursor = encodeCursor({
            createdAt: lastRow.created_at,
            hash: lastRow.hash,
          });
        }
      }

      return c.json({ items, ...(nextCursor && { nextCursor }) });
    } catch (error) {
      console.error("List media error:", error);
      return c.json({ error: "Failed to list media" }, 500);
    }
  },
);

api.put(
  "/:hash/tags",
  describeRoute({
    tags: ["media.pollinations.ai"],
    summary: "Set media tags",
    description:
      "Set public and/or private tags for a media file. Requires authentication and ownership.",
    responses: {
      200: {
        description: "Tags updated",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                id: z.string(),
                public: z.array(z.string()),
                private: z.array(z.string()),
              }),
            ),
          },
        },
      },
      400: {
        description: "Invalid request",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
      403: {
        description: "Not the file owner",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
      404: {
        description: "File not found",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
    },
  }),
  async (c) => {
    const hash = c.req.param("hash");
    if (!HASH_PATTERN.test(hash)) {
      return c.json({ error: "Invalid hash format" }, 400);
    }

    const apiKey = extractApiKey(c.req.raw);
    if (!apiKey) {
      return c.json({ error: "API key required" }, 401);
    }
    const authResult = await verifyApiKey(apiKey);
    if (!authResult) {
      return c.json({ error: "Invalid or expired API key" }, 401);
    }

    try {
      const body = await c.req.json<{
        public?: string[];
        private?: string[];
      }>();

      const publicTags = (body.public || [])
        .map(normalizeTag)
        .filter(validateTag);
      const privateTags = (body.private || [])
        .map(normalizeTag)
        .filter(validateTag);

      if (publicTags.length > MAX_PUBLIC_TAGS) {
        return c.json(
          {
            error: `Too many public tags (max ${MAX_PUBLIC_TAGS})`,
          },
          400,
        );
      }
      if (privateTags.length > MAX_PRIVATE_TAGS) {
        return c.json(
          {
            error: `Too many private tags (max ${MAX_PRIVATE_TAGS})`,
          },
          400,
        );
      }

      // Verify ownership
      const media = await c.env.DB
        .prepare("SELECT owner FROM media_objects WHERE hash = ?")
        .bind(hash)
        .first<{ owner: string }>();

      if (!media) {
        return c.json({ error: "Media not found" }, 404);
      }

      if (media.owner !== authResult.name) {
        return c.json({ error: "Not the file owner" }, 403);
      }

      // Atomic replace: delete + insert all tags in a single D1 batch.
      // D1's batch() executes statements in an implicit transaction, so
      // a partial failure rolls back the entire tag update.
      const statements: D1PreparedStatement[] = [
        c.env.DB
          .prepare("DELETE FROM public_tags WHERE hash = ?")
          .bind(hash),
        c.env.DB
          .prepare("DELETE FROM private_tags WHERE hash = ? AND owner = ?")
          .bind(hash, authResult.name),
      ];

      for (const tag of publicTags) {
        statements.push(
          c.env.DB
            .prepare("INSERT INTO public_tags (hash, tag) VALUES (?, ?)")
            .bind(hash, tag),
        );
      }
      for (const tag of privateTags) {
        statements.push(
          c.env.DB
            .prepare(
              "INSERT INTO private_tags (hash, owner, tag) VALUES (?, ?, ?)",
            )
            .bind(hash, authResult.name, tag),
        );
      }

      await c.env.DB.batch(statements);

      return c.json({
        id: hash,
        public: publicTags,
        private: privateTags,
      });
    } catch (error) {
      console.error("Tag error:", error);
      if (error instanceof SyntaxError) {
        return c.json({ error: "Invalid JSON in request body" }, 400);
      }
      return c.json({ error: "Failed to set tags" }, 500);
    }
  },
);

api.get(
  "/tags/:tag",
  describeRoute({
    tags: ["media.pollinations.ai"],
    summary: "Browse by public tag",
    description:
      "Get all media files tagged with a specific public tag. No authentication required.",
    responses: {
      200: {
        description: "Paginated list of media with tag",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                tag: z.string(),
                items: z.array(
                  z.object({
                    id: z.string(),
                    url: z.string(),
                    contentType: z.string(),
                    size: z.number(),
                    createdAt: z.string(),
                  }),
                ),
                nextCursor: z.string().optional(),
              }),
            ),
          },
        },
      },
      400: {
        description: "Invalid tag format",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
    },
  }),
  async (c) => {
    let tag = c.req.param("tag");
    tag = normalizeTag(tag);

    if (!validateTag(tag)) {
      return c.json({ error: "Invalid tag format" }, 400);
    }

    const limit = Math.min(
      parseInt(c.req.query("limit") || "50"),
      500,
    );
    if (!Number.isFinite(limit) || limit < 1) {
      return c.json({ error: "Invalid limit" }, 400);
    }

    const cursor = c.req.query("cursor");

    try {
      let query = `SELECT DISTINCT m.hash, m.content_type, m.size, m.created_at
        FROM media_objects m
        INNER JOIN public_tags pt ON m.hash = pt.hash
        WHERE pt.tag = ?`;

      const params: (string | number)[] = [tag];

      if (cursor) {
        const decoded = decodeCursor(cursor);
        if (!decoded) {
          return c.json({ error: "Invalid cursor" }, 400);
        }
        query += ` AND (m.created_at < ? OR (m.created_at = ? AND m.hash > ?))`;
        params.push(decoded.createdAt, decoded.createdAt, decoded.hash);
      }

      query += ` ORDER BY m.created_at DESC, m.hash DESC LIMIT ?`;
      params.push(limit + 1);

      const result = await c.env.DB.prepare(query).bind(...params).all<{
        hash: string;
        content_type: string;
        size: number;
        created_at: string;
      }>();

      let items: Array<{
        id: string;
        url: string;
        contentType: string;
        size: number;
        createdAt: string;
      }> = [];
      let nextCursor: string | undefined;

      if (result.results && result.results.length > 0) {
        const hasMore = result.results.length > limit;
        const displayRows = hasMore ? result.results.slice(0, limit) : result.results;

        items = displayRows.map((row) => ({
          id: row.hash,
          url: mediaUrl(row.hash),
          contentType: row.content_type,
          size: row.size,
          createdAt: row.created_at,
        }));

        if (hasMore) {
          const lastRow = displayRows[displayRows.length - 1];
          nextCursor = encodeCursor({
            createdAt: lastRow.created_at,
            hash: lastRow.hash,
          });
        }
      }

      return c.json({ tag, items, ...(nextCursor && { nextCursor }) });
    } catch (error) {
      console.error("Browse tag error:", error);
      return c.json({ error: "Failed to browse tag" }, 500);
    }
  },
);

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "HEAD", "PUT", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["X-Content-Hash", "X-Content-Size"],
  }),
);

app.get("/", (c) => {
  return c.json({
    service: DOMAIN,
    version: "1.0.0",
    endpoints: {
      upload: "POST /upload (requires API key)",
      retrieve: "GET /:hash",
      metadata: "GET /:hash/metadata",
      listMyMedia: "GET /me/media (requires API key)",
      setTags: "PUT /:hash/tags (requires API key)",
      browseTag: "GET /tags/:tag",
      docs: "GET /openapi.json",
    },
    limits: {
      maxFileSize: "10MB",
      maxPublicTagsPerFile: MAX_PUBLIC_TAGS,
      maxPrivateTagsPerFile: MAX_PRIVATE_TAGS,
      maxTagLength: TAG_MAX_LEN,
    },
  });
});

app.get("/openapi.json", async (c, next) => {
  const handler = openAPIRouteHandler(api, {
    documentation: {
      info: {
        title: "media.pollinations.ai",
        version: "1.0.0",
        description:
          "Content-addressed media storage. Upload images, audio, and video with deduplication via SHA-256 hashing. Uploads require a pollinations.ai API key (`pk_` or `sk_`). Retrieval is public.",
      },
      servers: [{ url: `https://${DOMAIN}` }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "API Key",
            description: "pollinations.ai API key (pk_ or sk_)",
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });
  const response = await handler(c, next);
  if (!response) return;
  const schema = await response.json();
  return c.json(schema);
});

app.route("/", api);

// 16 hex chars = 64 bits -- collision expected around ~4B files (birthday paradox)
// Hash includes filename so the same content with different names gets different URLs.
async function generateHash(
  buffer: ArrayBuffer,
  fileName?: string,
): Promise<string> {
  const nameBytes = new TextEncoder().encode(fileName || "");
  const separator = new Uint8Array([0x00]);
  const combined = new Uint8Array(
    buffer.byteLength + separator.length + nameBytes.length,
  );
  combined.set(new Uint8Array(buffer), 0);
  combined.set(separator, buffer.byteLength);
  combined.set(nameBytes, buffer.byteLength + separator.length);
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    combined.buffer.slice(
      combined.byteOffset,
      combined.byteOffset + combined.byteLength,
    ),
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 16);
}

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  flac: "audio/flac",
  aac: "audio/aac",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
};

function detectContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return MIME_TYPES[ext] || "application/octet-stream";
}

export default app;
