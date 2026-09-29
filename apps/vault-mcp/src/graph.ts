import { ZodError, z } from "zod";
import { canonicalJson, sha256 } from "./canonical";
import {
    graphReadSchema,
    graphSearchSchema,
    graphWriteSchema,
} from "./contracts";

class GraphError extends Error {}
interface Row {
    [key: string]: SqlStorageValue;
}
interface NodeRow extends Row {
    id: string;
    name: string;
    text: string;
    aliases: string;
    version: number;
    recorded_at: number;
}
interface RelationRow extends Row {
    id: string;
    subject: string;
    predicate: string;
    target: string;
    evidence: string;
    status: string;
    version: number;
    actor: string;
}
const fail = (code: string): never => {
    throw new GraphError(code);
};
const head = (sql: SqlStorage) =>
    Number(
        sql.exec("SELECT value FROM meta WHERE key='graph_head'").one().value,
    );
const node = (row: NodeRow) => ({
    id: row.id,
    name: row.name,
    text: row.text,
    origin: "agent_generated",
    recordedAt: row.recorded_at,
    validTime: { kind: "unknown" },
    aliases: JSON.parse(row.aliases) as string[],
    version: row.version,
});
const relation = (row: RelationRow) => ({
    id: row.id,
    subject: row.subject,
    predicate: row.predicate,
    target: row.target,
    evidence: row.evidence,
    status: row.status,
    version: row.version,
    origin: "agent_generated",
    actor: row.actor,
    validTime: { kind: "unknown" },
});
const encoder = new TextEncoder();
function decodeCursor(value: string): string {
    try {
        const decoded = atob(value);
        JSON.parse(decoded);
        return decoded;
    } catch {
        return fail("invalid_request");
    }
}

export async function graphOperation(
    storage: DurableObjectStorage,
    actor: string,
    operation: string,
    input: unknown,
    now: number,
): Promise<Response> {
    const sql = storage.sql;
    try {
        if (operation === "write") {
            const command = graphWriteSchema.parse(input);
            if (!/^[a-f0-9]{64}$/.test(actor)) fail("invalid_request");
            if (encoder.encode(canonicalJson(command)).length > 65_536)
                fail("limit_exceeded");
            const digest = await sha256(canonicalJson({ operation, command }));
            const saved = sql
                .exec(
                    "SELECT request_digest,receipt FROM receipts WHERE actor=? AND idempotency_key=?",
                    actor,
                    command.idempotencyKey,
                )
                .toArray()[0];
            if (saved) {
                if (saved.request_digest !== digest)
                    fail("idempotency_conflict");
                return Response.json(JSON.parse(String(saved.receipt)));
            }
            const validateWrite = () => {
                const ids = [...command.nodes, ...command.relations].map(
                    (v) => v.id,
                );
                if (new Set(ids).size !== ids.length) fail("invalid_request");
                const requestMinute = Math.floor(now / 60_000);
                const usage = sql
                    .exec("SELECT value FROM meta WHERE key='graph_rate'")
                    .toArray()[0];
                const rate = usage
                    ? z
                          .object({
                              minute: z.number().int(),
                              count: z.number().int().nonnegative(),
                          })
                          .parse(JSON.parse(String(usage.value)))
                    : { minute: requestMinute, count: 0 };
                const minute = Math.max(requestMinute, rate.minute);
                const count = rate.minute === minute ? rate.count : 0;
                if (count >= 120) fail("rate_limited");
                let added = 0;
                const pending = new Set(command.nodes.map((v) => v.id));
                for (const value of command.nodes) {
                    if (
                        sql
                            .exec(
                                "SELECT 1 FROM graph_relations WHERE id=?",
                                value.id,
                            )
                            .toArray().length
                    )
                        fail("id_conflict");
                    const previous = sql
                        .exec<NodeRow>(
                            "SELECT * FROM graph_nodes WHERE id=?",
                            value.id,
                        )
                        .toArray()[0];
                    if ((previous?.version ?? 0) !== value.expectedVersion)
                        fail("version_conflict");
                    if (!previous) added++;
                }
                for (const value of command.relations) {
                    if (
                        pending.has(value.id) ||
                        sql
                            .exec(
                                "SELECT 1 FROM graph_nodes WHERE id=?",
                                value.id,
                            )
                            .toArray().length
                    )
                        fail("id_conflict");
                    for (const endpoint of [value.subject, value.target])
                        if (
                            !pending.has(endpoint) &&
                            !sql
                                .exec(
                                    "SELECT 1 FROM graph_nodes WHERE id=?",
                                    endpoint,
                                )
                                .toArray().length
                        )
                            fail("not_found");
                    const previous = sql
                        .exec<RelationRow>(
                            "SELECT * FROM graph_relations WHERE id=?",
                            value.id,
                        )
                        .toArray()[0];
                    if ((previous?.version ?? 0) !== value.expectedVersion)
                        fail("version_conflict");
                    if (
                        previous &&
                        (previous.subject !== value.subject ||
                            previous.predicate !== value.predicate ||
                            previous.target !== value.target)
                    )
                        fail("relation_identity_conflict");
                    if (!previous) added++;
                }
                const total = Number(
                    sql
                        .exec(
                            "SELECT (SELECT COUNT(*) FROM graph_nodes)+(SELECT COUNT(*) FROM graph_relations) AS total",
                        )
                        .one().total,
                );
                const histories = Number(
                    sql
                        .exec("SELECT COUNT(*) AS total FROM graph_revisions")
                        .one().total,
                );
                if (total + added > 20_000 || histories + ids.length > 100_000)
                    fail("quota_exceeded");
                return { ids, minute, count, revision: head(sql) + 1 };
            };
            const result = storage.transactionSync(() => {
                const saved = sql
                    .exec(
                        "SELECT request_digest,receipt FROM receipts WHERE actor=? AND idempotency_key=?",
                        actor,
                        command.idempotencyKey,
                    )
                    .toArray()[0];
                if (saved) {
                    if (saved.request_digest !== digest)
                        fail("idempotency_conflict");
                    return JSON.parse(saved.receipt as string) as Record<
                        string,
                        unknown
                    >;
                }
                const { ids, minute, count, revision } = validateWrite();
                for (const value of command.nodes) {
                    const next = value.expectedVersion + 1;
                    sql.exec(
                        "INSERT INTO graph_nodes(id,name,text,aliases,version) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,text=excluded.text,aliases=excluded.aliases,version=excluded.version",
                        value.id,
                        value.name,
                        value.text,
                        canonicalJson(value.aliases),
                        next,
                    );
                    sql.exec("DELETE FROM graph_fts WHERE id=?", value.id);
                    sql.exec(
                        "INSERT INTO graph_fts(id,body) VALUES(?,?)",
                        value.id,
                        [
                            value.id,
                            value.name,
                            ...value.aliases,
                            value.text,
                        ].join(" "),
                    );
                    sql.exec(
                        "INSERT INTO graph_revisions(id,version,head,kind,payload,actor,recorded_at) VALUES(?,?,?,?,?,?,?)",
                        value.id,
                        next,
                        revision,
                        "node",
                        canonicalJson(
                            node({
                                ...value,
                                aliases: canonicalJson(value.aliases),
                                version: next,
                                recorded_at: now,
                            }),
                        ),
                        actor,
                        now,
                    );
                }
                for (const value of command.relations) {
                    const next = value.expectedVersion + 1;
                    sql.exec(
                        "INSERT INTO graph_relations(id,subject,predicate,target,evidence,status,version,actor) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET evidence=excluded.evidence,status=excluded.status,version=excluded.version,actor=excluded.actor",
                        value.id,
                        value.subject,
                        value.predicate,
                        value.target,
                        value.evidence,
                        value.status,
                        next,
                        actor,
                    );
                    sql.exec(
                        "INSERT INTO graph_revisions(id,version,head,kind,payload,actor,recorded_at) VALUES(?,?,?,?,?,?,?)",
                        value.id,
                        next,
                        revision,
                        "relation",
                        canonicalJson(
                            relation({ ...value, actor, version: next }),
                        ),
                        actor,
                        now,
                    );
                }
                sql.exec(
                    "UPDATE meta SET value=? WHERE key='graph_head'",
                    String(revision),
                );
                sql.exec(
                    "INSERT INTO meta(key,value) VALUES('graph_rate',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    canonicalJson({ minute, count: count + 1 }),
                );
                const receipt = {
                    head: revision,
                    ids,
                    versions: [...command.nodes, ...command.relations].map(
                        (v) => ({
                            id: v.id,
                            version: v.expectedVersion + 1,
                        }),
                    ),
                };
                sql.exec(
                    "INSERT INTO receipts(actor,idempotency_key,request_digest,receipt) VALUES(?,?,?,?)",
                    actor,
                    command.idempotencyKey,
                    digest,
                    canonicalJson(receipt),
                );
                return receipt;
            });
            return Response.json(result);
        }
        storage.transactionSync(() => {
            const requestMinute = Math.floor(now / 60_000);
            const saved = sql
                .exec("SELECT value FROM meta WHERE key='graph_read_rate'")
                .toArray()[0];
            const previous = saved
                ? z
                      .object({
                          minute: z.number().int(),
                          count: z.number().int().nonnegative(),
                      })
                      .parse(JSON.parse(String(saved.value)))
                : { minute: requestMinute, count: 0 };
            const minute = Math.max(requestMinute, previous.minute);
            const count = previous.minute === minute ? previous.count : 0;
            if (count >= 600) fail("rate_limited");
            sql.exec(
                "INSERT INTO meta(key,value) VALUES('graph_read_rate',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                canonicalJson({ minute, count: count + 1 }),
            );
        });
        if (operation === "read") {
            const value = graphReadSchema.parse(input);
            const currentHead = head(sql);
            if (
                value.expectedHead !== undefined &&
                value.expectedHead !== currentHead
            )
                fail("restart_required");
            const missingIds: string[] = [];
            const omissions: {
                id: string;
                kind: "nodes" | "relations" | "history";
            }[] = [];
            const inactiveIds: string[] = [];
            const nodes: ReturnType<typeof node>[] = [];
            const relations: ReturnType<typeof relation>[] = [];
            let truncated = false;
            let bytes = 0;
            const append = <T>(
                items: T[],
                item: T,
                id: string,
                kind: "nodes" | "relations" | "history",
            ) => {
                const size = encoder.encode(JSON.stringify(item)).length + 1;
                if (bytes + size > 48_000) {
                    truncated = true;
                    if (
                        !omissions.some(
                            (entry) => entry.id === id && entry.kind === kind,
                        )
                    )
                        omissions.push({ id, kind });
                    return;
                }
                items.push(item);
                bytes += size;
            };
            const foundNodes = new Set<string>();
            // Requested nodes take precedence over expanded evidence and history.
            for (const id of new Set(value.ids)) {
                const item = sql
                    .exec<NodeRow>(
                        "SELECT n.*,r.recorded_at FROM graph_nodes n JOIN graph_revisions r ON r.id=n.id AND r.version=n.version WHERE n.id=?",
                        id,
                    )
                    .toArray()[0];
                if (
                    !item &&
                    sql
                        .exec("SELECT 1 FROM graph_nodes WHERE id=?", id)
                        .toArray().length
                )
                    fail("integrity_failure");
                if (item) {
                    foundNodes.add(id);
                    append(nodes, node(item), id, "nodes");
                }
            }
            for (const id of new Set(value.ids)) {
                const rows = sql
                    .exec<RelationRow>(
                        "SELECT * FROM graph_relations WHERE (id=? OR subject=? OR target=?) AND status='active' ORDER BY id LIMIT 33",
                        id,
                        id,
                        id,
                    )
                    .toArray();
                const directRelation = !foundNodes.has(id)
                    ? sql
                          .exec<RelationRow>(
                              "SELECT * FROM graph_relations WHERE id=?",
                              id,
                          )
                          .toArray()[0]
                    : undefined;
                if (!foundNodes.has(id) && !directRelation) missingIds.push(id);
                if (directRelation?.status === "retracted")
                    inactiveIds.push(id);
                if (rows.length > 32) {
                    truncated = true;
                    omissions.push({ id, kind: "relations" });
                }
                for (const row of rows.slice(0, 32))
                    if (!relations.some((r) => r.id === row.id))
                        append(relations, relation(row), id, "relations");
            }
            const history: unknown[] = [];
            if (value.includeHistory)
                for (const id of new Set(value.ids)) {
                    const rows = sql
                        .exec(
                            "SELECT head,payload,recorded_at FROM graph_revisions WHERE id=? ORDER BY version DESC LIMIT 17",
                            id,
                        )
                        .toArray();
                    if (rows.length > 16) {
                        truncated = true;
                        omissions.push({ id, kind: "history" });
                    }
                    for (const r of rows.slice(0, 16))
                        append(
                            history,
                            {
                                head: r.head,
                                recordedAt: r.recorded_at,
                                record: JSON.parse(r.payload as string),
                            },
                            id,
                            "history",
                        );
                }
            const result = {
                head: currentHead,
                nodes,
                relations,
                history,
                truncated,
                missingIds,
                inactiveIds,
                omissions,
                trust: "untrusted_memory",
            };
            if (encoder.encode(JSON.stringify(result)).length > 65_536)
                fail("limit_exceeded");
            return Response.json(result);
        }
        const value = graphSearchSchema.parse(input);
        if (value.mode === "count") {
            if (value.query || value.queryVariants.length || value.cursor)
                fail("invalid_request");
            const rows = sql
                .exec(
                    `SELECT COUNT(${value.countUnit === "targets" ? "DISTINCT target" : "*"}) AS count FROM graph_relations WHERE status='active' AND (? IS NULL OR subject=?) AND (? IS NULL OR predicate=?) AND (? IS NULL OR target=?)`,
                    value.subject ?? null,
                    value.subject ?? null,
                    value.predicate ?? null,
                    value.predicate ?? null,
                    value.target ?? null,
                    value.target ?? null,
                )
                .one();
            return Response.json({
                head: head(sql),
                count: rows.count,
                countUnit: value.countUnit,
                complete: true,
            });
        }
        const { cursor: _cursor, ...query } = value;
        const queryDigest = await sha256(canonicalJson(query));
        // Re-read head after hashing: SQLite reads below run without await.
        const currentHead = head(sql);
        let offset = 0;
        if (value.cursor) {
            const cursor = z
                .object({
                    head: z
                        .number()
                        .int()
                        .nonnegative()
                        .max(Number.MAX_SAFE_INTEGER),
                    offset: z.number().int().min(0).max(20_000),
                    digest: z.string().regex(/^[a-f0-9]{64}$/),
                })
                .strict()
                .parse(JSON.parse(decodeCursor(value.cursor)));
            if (cursor.head !== currentHead || cursor.digest !== queryDigest)
                fail("restart_required");
            offset = cursor.offset;
        }
        if (value.subject || value.predicate || value.target)
            fail("invalid_request");
        // Caller reformulations share one query, ordering, page and output budget.
        const queries = [
            ...new Set(
                [value.query, ...value.queryVariants]
                    .map((q) => q.trim())
                    .filter(Boolean),
            ),
        ];
        const groups = queries
            .map((q) => {
                const terms = q.match(/[\p{L}\p{N}_]+/gu) ?? [];
                if (terms.length > 16) fail("limit_exceeded");
                return terms.length
                    ? `(${terms.map((t) => `"${t}"`).join(" AND ")})`
                    : "";
            })
            .filter(Boolean);
        const match = groups.join(" OR ");
        const rows = queries.length
            ? match
                ? sql
                      .exec<NodeRow>(
                          `WITH
              node_hits AS MATERIALIZED (SELECT id,bm25(graph_fts) AS score FROM graph_fts WHERE graph_fts MATCH ?),
              edge_hits AS MATERIALIZED (SELECT e.subject,e.target,bm25(graph_relation_fts) AS score FROM graph_relation_fts f JOIN graph_relations e ON e.id=f.id WHERE graph_relation_fts MATCH ? AND e.status='active'),
              candidates AS (
                SELECT id,0 AS channel,score FROM node_hits
                UNION ALL SELECT subject,1,score FROM edge_hits
                UNION ALL SELECT target,1,score FROM edge_hits
              ),
              ranked AS (SELECT id,MIN(channel) AS channel,COALESCE(MIN(CASE WHEN channel=0 THEN score END),MIN(score)) AS score FROM candidates GROUP BY id)
              SELECT n.*,r.recorded_at FROM ranked c JOIN graph_nodes n ON n.id=c.id JOIN graph_revisions r ON r.id=n.id AND r.version=n.version
              ORDER BY CASE WHEN n.id=? OR n.name=? OR EXISTS(SELECT 1 FROM json_each(n.aliases) WHERE value=?) THEN 0 ELSE 1 END,c.channel,c.score,n.id LIMIT ? OFFSET ?`,
                          match,
                          match,
                          value.query,
                          value.query,
                          value.query,
                          value.limit + 1,
                          offset,
                      )
                      .toArray()
                : []
            : sql
                  .exec<NodeRow>(
                      "SELECT n.*,r.recorded_at FROM graph_nodes n JOIN graph_revisions r ON r.id=n.id AND r.version=n.version ORDER BY n.id LIMIT ? OFFSET ?",
                      value.limit + 1,
                      offset,
                  )
                  .toArray();
        const selected: ReturnType<typeof node>[] = [];
        let bytes = 0;
        for (const row of rows.slice(0, value.limit)) {
            const item = node(row);
            const size = encoder.encode(JSON.stringify(item)).length;
            if (bytes + size > 48_000) break;
            selected.push(item);
            bytes += size;
        }
        const truncated = rows.length > selected.length;
        const nextCursor = truncated
            ? btoa(
                  JSON.stringify({
                      head: currentHead,
                      offset: offset + selected.length,
                      digest: queryDigest,
                  }),
              )
            : null;
        const relations: ReturnType<typeof relation>[] = [];
        const linkedNodes: ReturnType<typeof node>[] = [];
        const omissions: { id: string; kind: "relations" }[] = [];
        const included = new Set(selected.map((item) => item.id));
        // ponytail: one hop, four edges per seed and 32 total; deeper paths need measured recall gains.
        for (const seed of selected) {
            const edges = sql
                .exec<RelationRow>(
                    `SELECT * FROM graph_relations WHERE status='active' AND (subject=? OR target=?) ORDER BY ${match ? "CASE WHEN id IN (SELECT id FROM graph_relation_fts WHERE graph_relation_fts MATCH ?) THEN 0 ELSE 1 END," : ""} id LIMIT 5`,
                    seed.id,
                    seed.id,
                    ...(match ? [match] : []),
                )
                .toArray();
            let omitted = edges.length > 4;
            for (const edge of edges.slice(0, 4)) {
                if (relations.some((item) => item.id === edge.id)) continue;
                if (relations.length >= 32) {
                    omitted = true;
                    continue;
                }
                const endpoints: ReturnType<typeof node>[] = [];
                for (const id of new Set([edge.subject, edge.target])) {
                    if (included.has(id)) continue;
                    const endpoint = sql
                        .exec<NodeRow>(
                            "SELECT n.*,r.recorded_at FROM graph_nodes n JOIN graph_revisions r ON r.id=n.id AND r.version=n.version WHERE n.id=?",
                            id,
                        )
                        .toArray()[0];
                    endpoints.push(node(endpoint ?? fail("integrity_failure")));
                }
                const evidence = relation(edge);
                const size = encoder.encode(
                    JSON.stringify([evidence, ...endpoints]),
                ).length;
                if (
                    linkedNodes.length + endpoints.length > 32 ||
                    bytes + size > 48_000
                ) {
                    omitted = true;
                    continue;
                }
                relations.push(evidence);
                linkedNodes.push(...endpoints);
                for (const endpoint of endpoints) included.add(endpoint.id);
                bytes += size;
            }
            if (omitted) omissions.push({ id: seed.id, kind: "relations" });
        }
        return Response.json({
            head: currentHead,
            nodes: selected,
            relations,
            linkedNodes,
            contextTruncated: omissions.length > 0,
            omissions,
            truncated,
            nextCursor,
            contextStatus: selected.length ? "evidence_found" : "no_evidence",
            absenceProven: false,
            nextAction: selected.length ? "read_at_head" : "reformulate_query",
            trust: "untrusted_memory",
            retrieval: {
                method: "lexical_graph",
                graphDepth: 1,
                matching: "all_terms_per_variant",
                semanticVerification: false,
            },
        });
    } catch (cause) {
        const code =
            cause instanceof GraphError
                ? cause.message
                : cause instanceof ZodError
                  ? "invalid_request"
                  : "internal";
        return Response.json(
            { code },
            {
                status:
                    code === "internal"
                        ? 500
                        : code === "not_found"
                          ? 404
                          : code === "rate_limited"
                            ? 429
                            : 409,
            },
        );
    }
}
