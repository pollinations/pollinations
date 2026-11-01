import { beforeEach } from "vitest";

type Storage = {
    db?: D1Database;
    kv?: KVNamespace[];
    r2?: R2Bucket[];
};

type Table = { name: string; rows: Record<string, unknown>[] };

const TABLES_SQL =
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name <> 'd1_migrations'";

/**
 * `@cloudflare/vitest-plugin` isolates storage per test file, not per test.
 * The state the first test of a file starts from (after migrations and any
 * `beforeAll` seeding) is restored before every later test: D1 rows are put
 * back, and KV keys and R2 objects added since are deleted.
 */
export function resetStorageBeforeEach({ db, kv = [], r2 = [] }: Storage) {
    let baseline:
        | { tables: Table[]; kvKeys: Set<string>[]; r2Keys: Set<string>[] }
        | undefined;
    beforeEach(async () => {
        baseline ??= {
            tables: db ? await readTables(db) : [],
            kvKeys: await Promise.all(
                kv.map(async (namespace) => new Set(await kvKeys(namespace))),
            ),
            r2Keys: await Promise.all(
                r2.map(async (bucket) => new Set(await r2Keys(bucket))),
            ),
        };
        const { tables, kvKeys: keptKv, r2Keys: keptR2 } = baseline;
        if (db) await restoreTables(db, tables);
        await Promise.all([
            ...kv.map(async (namespace, i) => {
                const added = (await kvKeys(namespace)).filter(
                    (key) => !keptKv[i].has(key),
                );
                await Promise.all(added.map((key) => namespace.delete(key)));
            }),
            ...r2.map(async (bucket, i) => {
                const added = (await r2Keys(bucket)).filter(
                    (key) => !keptR2[i].has(key),
                );
                if (added.length > 0) await bucket.delete(added);
            }),
        ]);
    });
}

async function readTables(db: D1Database): Promise<Table[]> {
    const { results } = await db.prepare(TABLES_SQL).all<{ name: string }>();
    return Promise.all(
        results.map(async ({ name }) => ({
            name,
            rows: (await db.prepare(`SELECT * FROM "${name}"`).all()).results,
        })),
    );
}

async function restoreTables(db: D1Database, tables: Table[]) {
    await db.batch([
        db.prepare("PRAGMA defer_foreign_keys = ON"),
        ...tables.map(({ name }) => db.prepare(`DELETE FROM "${name}"`)),
        ...tables.flatMap(({ name, rows }) =>
            rows.map((row) => {
                const columns = Object.keys(row);
                return db
                    .prepare(
                        `INSERT INTO "${name}" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
                    )
                    .bind(...Object.values(row));
            }),
        ),
    ]);
}

async function kvKeys(namespace: KVNamespace) {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
        const page = await namespace.list({ cursor });
        keys.push(...page.keys.map((key) => key.name));
        cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return keys;
}

async function r2Keys(bucket: R2Bucket) {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
        const page = await bucket.list({ cursor });
        keys.push(...page.objects.map((object) => object.key));
        cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return keys;
}
