#!/usr/bin/env node

const { readdirSync } = require("fs");
const { execSync } = require("child_process");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const migrationsDir = path.join(projectRoot, "migrations");
const databaseName = "github_auth";

// exec options to ensure wrangler runs with the correct config (wrangler.toml)
const execOpts = { encoding: 'utf8', shell: true, cwd: projectRoot };

console.log("🔁 Running development migrations from:", migrationsDir);

try {
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

    // Query wrangler for already-applied migrations and skip them
    function getAppliedMigrations() {
      try {
        console.log('🔎 Checking already-applied migrations (local)...');
  const raw = execSync(`npx wrangler d1 migrations list ${databaseName} --local`, execOpts);
        const lines = raw.split(/\r?\n/);
        const set = new Set();
        for (const line of lines) {
          const m = line.match(/([\w\-\/.]+\.sql)/);
          if (m && m[1]) set.add(path.basename(m[1]));
        }
        return { set, raw };
      } catch (err) {
        console.log('⚠️ Warning: unable to query migrations list (wrangler may be missing or not configured). Will attempt to apply all migration files.');
        return { set: new Set(), raw: '' };
      }
    }

    const { set: appliedSet, raw: appliedListRaw } = getAppliedMigrations();

    // Helper: extract table names from CREATE TABLE statements in a migration file
    function extractTablesFromSql(sql) {
      const tables = new Set();
      const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`|\[)?([\w_]+)(?:`|\])?/ig;
      let m;
      while ((m = re.exec(sql)) !== null) {
        if (m[1]) tables.add(m[1]);
      }
      return Array.from(tables);
    }

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const shouldSkip = appliedSet.has(file) || appliedListRaw.includes(file);

      if (shouldSkip) {
        // Verify that the migration actually created its expected tables. If not, re-run it.
        console.log(`[SKIPPED] ${file} (verifying)`);
        try {
          const sql = require('fs').readFileSync(filePath, { encoding: 'utf8' });
          const tables = extractTablesFromSql(sql);
          if (tables.length === 0) {
            // nothing to verify, assume ok
            continue;
          }

          // Fetch current tables once and check membership
          const rawCheck = execSync(`npx wrangler d1 execute ${databaseName} --local --command "SELECT name FROM sqlite_master WHERE type='table';"`, execOpts);
          const missing = [];
          for (const t of tables) {
            if (!rawCheck.includes(t)) missing.push(t);
          }
          if (missing.length > 0) {
            console.log(`⚠️ Missing tables for ${file}: ${missing.join(', ')} — re-applying migration`);
            try {
              execSync(`npx wrangler d1 execute ${databaseName} --local --file ${filePath}`, { stdio: 'inherit', shell: true, cwd: projectRoot });
              console.log(`[APPLIED] ${file} (re-applied to create missing tables)`);
            } catch (err) {
              console.log(`[WARN] Failed to re-apply ${file}: ${err.message}`);
            }
          } else {
            console.log(`[OK] Verified tables exist for ${file}`);
          }
        } catch (err) {
          console.log(`[WARN] Verification failed for ${file}: ${err.message}`);
        }

        continue;
      }

      console.log(`[APPLYING] ${file}`);
      try {
  execSync(`npx wrangler d1 execute ${databaseName} --local --file ${filePath}`, { stdio: 'inherit', shell: true, cwd: projectRoot });
        console.log(`[APPLIED] ${file}`);
      } catch (err) {
        console.log(`[WARN] Failed to apply ${file}: ${err.message}`);
        // continue applying other migrations instead of aborting
      }
    }

  // run apply-indexes as a final step (idempotent) - run in local mode
    try {
    execSync(`node ./apply-indexes.js --local`, { stdio: 'inherit', shell: true, cwd: projectRoot });
  } catch (err) {
    console.log('Note: apply-indexes.js failed or skipped; indexes might already exist.');
  }

  console.log('✅ Development migrations complete');
} catch (error) {
  console.error('❌ Migration runner failed:', error.message);
  process.exit(1);
}
