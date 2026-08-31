import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { ConversationRecord } from "./types.js";

interface ConversationRow {
    caller_user_id: string;
    conversation_id: string;
    thread_id: string;
}

export class ConversationStore {
    readonly #database: DatabaseSync;

    constructor(path: string) {
        this.#database = new DatabaseSync(path);
        this.#database.exec("PRAGMA journal_mode = WAL");
        this.#database.exec(`
      CREATE TABLE IF NOT EXISTS conversation (
        caller_user_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (caller_user_id, conversation_id)
      ) STRICT;
    `);
    }

    get(
        callerUserId: string,
        conversationId: string,
    ): ConversationRecord | undefined {
        const row = this.#database
            .prepare(
                `SELECT caller_user_id, conversation_id, thread_id
         FROM conversation WHERE caller_user_id = ? AND conversation_id = ?`,
            )
            .get(callerUserId, conversationId) as unknown as
            | ConversationRow
            | undefined;
        return row ? mapRow(row) : undefined;
    }

    create(callerUserId: string, threadId: string): ConversationRecord {
        const record = { callerUserId, conversationId: randomUUID(), threadId };
        this.#database
            .prepare(
                `INSERT INTO conversation (caller_user_id, conversation_id, thread_id) VALUES (?, ?, ?)`,
            )
            .run(callerUserId, record.conversationId, threadId);
        return record;
    }

    close(): void {
        this.#database.close();
    }
}

function mapRow(row: ConversationRow): ConversationRecord {
    return {
        callerUserId: row.caller_user_id,
        conversationId: row.conversation_id,
        threadId: row.thread_id,
    };
}
