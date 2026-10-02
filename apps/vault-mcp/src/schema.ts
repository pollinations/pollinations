export function migrate(storage: DurableObjectStorage) {
    storage.transactionSync(() => {
        for (const statement of [
            "CREATE TABLE IF NOT EXISTS graph_nodes (id TEXT PRIMARY KEY, name TEXT NOT NULL, text TEXT NOT NULL, aliases TEXT NOT NULL, version TEXT NOT NULL, recordedAt INTEGER NOT NULL)",
            "CREATE TABLE IF NOT EXISTS graph_relations (subject TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE, predicate TEXT NOT NULL, target TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE, evidence TEXT NOT NULL, version TEXT NOT NULL, recordedAt INTEGER NOT NULL, PRIMARY KEY(subject,predicate,target))",
            "CREATE INDEX IF NOT EXISTS graph_target ON graph_relations(target)",
            "CREATE INDEX IF NOT EXISTS graph_predicate ON graph_relations(predicate)",
            "CREATE TABLE IF NOT EXISTS rate_limits (operation TEXT PRIMARY KEY, minute INTEGER NOT NULL, count INTEGER NOT NULL)",
            "CREATE VIRTUAL TABLE IF NOT EXISTS graph_fts USING fts5(id UNINDEXED,body,tokenize='unicode61')",
            "CREATE VIRTUAL TABLE IF NOT EXISTS graph_relation_fts USING fts5(body,tokenize='unicode61')",
            "CREATE TRIGGER IF NOT EXISTS node_insert AFTER INSERT ON graph_nodes BEGIN INSERT INTO graph_fts(id,body) VALUES(new.id,new.id||' '||new.name||' '||new.text||' '||new.aliases); END",
            "CREATE TRIGGER IF NOT EXISTS node_update AFTER UPDATE ON graph_nodes BEGIN DELETE FROM graph_fts WHERE id=old.id; INSERT INTO graph_fts(id,body) VALUES(new.id,new.id||' '||new.name||' '||new.text||' '||new.aliases); END",
            "CREATE TRIGGER IF NOT EXISTS node_delete AFTER DELETE ON graph_nodes BEGIN DELETE FROM graph_fts WHERE id=old.id; END",
            "CREATE TRIGGER IF NOT EXISTS relation_insert AFTER INSERT ON graph_relations BEGIN INSERT INTO graph_relation_fts(rowid,body) VALUES(new.rowid,new.subject||' '||new.predicate||' '||new.target||' '||new.evidence); END",
            "CREATE TRIGGER IF NOT EXISTS relation_update AFTER UPDATE ON graph_relations BEGIN DELETE FROM graph_relation_fts WHERE rowid=old.rowid; INSERT INTO graph_relation_fts(rowid,body) VALUES(new.rowid,new.subject||' '||new.predicate||' '||new.target||' '||new.evidence); END",
            "CREATE TRIGGER IF NOT EXISTS relation_delete AFTER DELETE ON graph_relations BEGIN DELETE FROM graph_relation_fts WHERE rowid=old.rowid; END",
        ])
            storage.sql.exec(statement);
    });
}
