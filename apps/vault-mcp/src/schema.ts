export function migrate(storage: DurableObjectStorage) {
    storage.transactionSync(() => {
        const tables = storage.sql
            .exec(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='meta'",
            )
            .toArray();
        if (tables.length) {
            if (
                storage.sql
                    .exec("SELECT value FROM meta WHERE key='schema_version'")
                    .one().value !== "1"
            )
                throw new Error("Unsupported Vault schema");
            return;
        }
        for (const statement of [
            "CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)",
            "INSERT INTO meta VALUES('schema_version','1')",
            "CREATE TABLE receipts(actor TEXT NOT NULL,idempotency_key TEXT NOT NULL,request_digest TEXT NOT NULL,receipt TEXT NOT NULL,PRIMARY KEY(actor,idempotency_key))",
            "CREATE TABLE graph_nodes (id TEXT PRIMARY KEY, name TEXT NOT NULL, text TEXT NOT NULL, aliases TEXT NOT NULL, version INTEGER NOT NULL)",
            "CREATE TABLE graph_relations (id TEXT PRIMARY KEY, subject TEXT NOT NULL REFERENCES graph_nodes(id), predicate TEXT NOT NULL, target TEXT NOT NULL REFERENCES graph_nodes(id), evidence TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','retracted')), version INTEGER NOT NULL, actor TEXT NOT NULL)",
            "CREATE INDEX graph_subject ON graph_relations(subject,status)",
            "CREATE INDEX graph_target ON graph_relations(target,status)",
            "CREATE INDEX graph_predicate ON graph_relations(predicate,status)",
            "CREATE TABLE graph_revisions (id TEXT NOT NULL, version INTEGER NOT NULL, head INTEGER NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, actor TEXT NOT NULL, recorded_at INTEGER NOT NULL, PRIMARY KEY(id,version))",
            "CREATE VIRTUAL TABLE graph_fts USING fts5(id UNINDEXED,body,tokenize='unicode61')",
            "INSERT INTO meta(key,value) VALUES('graph_head','0')",
            "CREATE VIRTUAL TABLE graph_relation_fts USING fts5(id UNINDEXED,body,tokenize='unicode61')",
            "INSERT INTO graph_relation_fts(id,body) SELECT id,subject||' '||predicate||' '||target||' '||evidence FROM graph_relations WHERE status='active'",
            `CREATE TRIGGER graph_relation_insert AFTER INSERT ON graph_relations WHEN new.status='active' BEGIN
        INSERT INTO graph_relation_fts(id,body) VALUES(new.id,new.subject||' '||new.predicate||' '||new.target||' '||new.evidence);
      END`,
            `CREATE TRIGGER graph_relation_update AFTER UPDATE ON graph_relations BEGIN
        DELETE FROM graph_relation_fts WHERE id=old.id;
        INSERT INTO graph_relation_fts(id,body) SELECT new.id,new.subject||' '||new.predicate||' '||new.target||' '||new.evidence WHERE new.status='active';
      END`,
            "CREATE TRIGGER graph_relation_delete AFTER DELETE ON graph_relations BEGIN DELETE FROM graph_relation_fts WHERE id=old.id; END",
        ])
            storage.sql.exec(statement);
    });
}
