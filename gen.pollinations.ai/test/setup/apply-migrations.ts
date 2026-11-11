import { applyD1Migrations, env } from "cloudflare:test";
import { resetStorageBeforeEach } from "@shared/test/reset-storage.ts";

// Storage is isolated per test file, so every file starts with an empty D1.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
resetStorageBeforeEach({
    db: env.DB,
    kv: [env.KV],
    r2: [env.TEXT_BUCKET, env.TEST_MEDIA_BUCKET],
});
