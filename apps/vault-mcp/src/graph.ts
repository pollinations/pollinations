import type { z } from "zod";
import type {
    graphReadSchema,
    graphSearchSchema,
    graphWriteSchema,
} from "./contracts";

export class GraphError extends Error {}
type Row = Record<string, SqlStorageValue>;
type NodeRow = Row & { id: string; aliases: string; version: string };
const encoder = new TextEncoder();
const fail = (code: string): never => {
    throw new GraphError(code);
};
const node = (row: NodeRow) => ({
    ...row,
    aliases: JSON.parse(row.aliases) as string[],
});

// Read and write limits use separate counters.
function consumeRate(
    sql: SqlStorage,
    operation: string,
    now: number,
    limit: number,
) {
    const { count } = sql
        .exec(
            "INSERT INTO rate_limits(operation,minute,count) VALUES(?,?,1) ON CONFLICT(operation) DO UPDATE SET count=CASE WHEN minute=excluded.minute THEN count+1 ELSE 1 END, minute=excluded.minute RETURNING count",
            operation,
            Math.floor(now / 60_000),
        )
        .one();
    if (Number(count) > limit) fail("rate_limited");
}

function checkVersion(
    sql: SqlStorage,
    query: string,
    keys: string[],
    expected: string | null,
) {
    const previous = sql.exec(query, ...keys).toArray()[0];
    if ((previous?.version ?? null) !== expected) fail("version_conflict");
}

// Separate budgets ensure that even large nodes leave room to page relationships.
function context(sql: SqlStorage, rows: NodeRow[], relationOffset = 0) {
    const take = <T>(items: T[], remaining: number) => {
        const selected: T[] = [];
        for (const item of items) {
            const size = encoder.encode(JSON.stringify(item)).length + 1;
            if (size > remaining) break;
            selected.push(item);
            remaining -= size;
        }
        return selected;
    };
    const nodes = take(rows.map(node), 48_000);
    const ids = JSON.stringify(nodes.map((n) => n.id));
    const edges = nodes.length
        ? sql
              .exec(
                  "SELECT * FROM graph_relations WHERE subject IN (SELECT value FROM json_each(?)) OR target IN (SELECT value FROM json_each(?)) ORDER BY subject,predicate,target LIMIT 33 OFFSET ?",
                  ids,
                  ids,
                  relationOffset,
              )
              .toArray()
        : [];
    const relations = take(edges.slice(0, 32), 16_000);
    return {
        nodes,
        relations,
        truncated:
            nodes.length < rows.length || relations.length < edges.length,
        nextRelationOffset:
            relations.length < edges.length
                ? relationOffset + relations.length
                : null,
    };
}

export function graphOperation(
    storage: DurableObjectStorage,
    ...[operation, input, now]:
        | ["write", z.output<typeof graphWriteSchema>, number]
        | ["read", z.output<typeof graphReadSchema>, number]
        | ["search", z.output<typeof graphSearchSchema>, number]
) {
    const sql = storage.sql;
    if (operation === "write") {
        const command = input;
        const encoded = JSON.stringify(command);
        if (encoder.encode(encoded).length > 65_536) fail("limit_exceeded");
        const result = storage.transactionSync(() => {
            consumeRate(sql, "write", now, 120);
            const nodes = [];
            const relations = [];
            for (const value of command.nodes) {
                checkVersion(
                    sql,
                    "SELECT version FROM graph_nodes WHERE id=?",
                    [value.id],
                    value.expectedVersion,
                );
                const version = "delete" in value ? null : crypto.randomUUID();
                if ("delete" in value) {
                    sql.exec("DELETE FROM graph_nodes WHERE id=?", value.id);
                } else {
                    sql.exec(
                        "INSERT INTO graph_nodes(id,name,text,aliases,version,recordedAt) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,text=excluded.text,aliases=excluded.aliases,version=excluded.version,recordedAt=excluded.recordedAt",
                        value.id,
                        value.name,
                        value.text,
                        JSON.stringify(value.aliases),
                        version,
                        now,
                    );
                }
                nodes.push({ id: value.id, version });
            }
            for (const value of command.relations) {
                const keys = [value.subject, value.predicate, value.target];
                checkVersion(
                    sql,
                    "SELECT version FROM graph_relations WHERE subject=? AND predicate=? AND target=?",
                    keys,
                    value.expectedVersion,
                );
                const version = "delete" in value ? null : crypto.randomUUID();
                if ("delete" in value) {
                    sql.exec(
                        "DELETE FROM graph_relations WHERE subject=? AND predicate=? AND target=?",
                        ...keys,
                    );
                } else {
                    sql.exec(
                        "INSERT INTO graph_relations(subject,predicate,target,evidence,version,recordedAt) VALUES(?,?,?,?,?,?) ON CONFLICT(subject,predicate,target) DO UPDATE SET evidence=excluded.evidence,version=excluded.version,recordedAt=excluded.recordedAt",
                        ...keys,
                        value.evidence,
                        version,
                        now,
                    );
                }
                relations.push({
                    subject: value.subject,
                    predicate: value.predicate,
                    target: value.target,
                    version,
                });
            }
            const { total } = sql
                .exec(
                    "SELECT (SELECT COUNT(*) FROM graph_nodes)+(SELECT COUNT(*) FROM graph_relations) AS total",
                )
                .one();
            if (Number(total) > 20_000) fail("quota_exceeded");
            return { nodes, relations };
        });
        return result;
    }
    consumeRate(sql, "read", now, 600);
    if (operation === "read") {
        const { ids, relationOffset } = input;
        const rows = sql
            .exec<NodeRow>(
                "SELECT * FROM graph_nodes WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id",
                JSON.stringify(ids),
            )
            .toArray();
        const found = new Set(rows.map((row) => row.id));
        return {
            ...context(sql, rows, relationOffset),
            missingIds: [...new Set(ids)].filter((id) => !found.has(id)),
        };
    }
    const value = input;
    if (value.mode === "count") {
        const result = sql
            .exec(
                "SELECT COUNT(" +
                    (value.countUnit === "targets" ? "DISTINCT target" : "*") +
                    ") AS count FROM graph_relations WHERE (? IS NULL OR subject=?) AND (? IS NULL OR predicate=?) AND (? IS NULL OR target=?)",
                value.subject ?? null,
                value.subject ?? null,
                value.predicate ?? null,
                value.predicate ?? null,
                value.target ?? null,
                value.target ?? null,
            )
            .one();
        return {
            count: result.count,
            countUnit: value.countUnit,
        };
    }
    const terms = value.query.match(/[\p{L}\p{N}_]+/gu) ?? [];
    if (terms.length > 16) fail("limit_exceeded");
    const match = terms.map((term) => `"${term}"`).join(" AND ");
    let rows: NodeRow[] = [];
    if (!value.query.trim()) {
        rows = sql
            .exec<NodeRow>(
                "SELECT * FROM graph_nodes ORDER BY id LIMIT ? OFFSET ?",
                value.limit + 1,
                value.offset,
            )
            .toArray();
    } else if (match) {
        rows = sql
            .exec<NodeRow>(
                "WITH edges AS (SELECT r.subject,r.target FROM graph_relations r JOIN graph_relation_fts f ON r.rowid=f.rowid WHERE graph_relation_fts MATCH ?) " +
                    "SELECT n.* FROM graph_nodes n WHERE n.id IN (SELECT id FROM graph_fts WHERE graph_fts MATCH ? UNION SELECT subject FROM edges UNION SELECT target FROM edges) " +
                    "ORDER BY CASE WHEN n.id=? OR n.name=? THEN 0 ELSE 1 END,n.id LIMIT ? OFFSET ?",
                match,
                match,
                value.query,
                value.query,
                value.limit + 1,
                value.offset,
            )
            .toArray();
    }
    const result = context(sql, rows.slice(0, value.limit));
    const more = rows.length > result.nodes.length;
    return {
        ...result,
        truncated: result.truncated || more,
        nextOffset: more ? value.offset + result.nodes.length : null,
    };
}
