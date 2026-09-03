// vitest re-runs setup files for every test file, and importing
// `cloudflare:test` here loads the Worker's main module, which
// vitest-pool-workers re-evaluates after each file. Migrations persist across
// files (setup runs outside isolated storage), so apply them once and keep the
// import out of every later file.
const MIGRATED = "__pollinationsTestMigrationsApplied";
const state = globalThis as typeof globalThis & { [MIGRATED]?: boolean };

if (!state[MIGRATED]) {
    const { applyD1Migrations, env } = await import("cloudflare:test");
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    state[MIGRATED] = true;
}

// Keep this file a module so top-level await is allowed.
export {};
