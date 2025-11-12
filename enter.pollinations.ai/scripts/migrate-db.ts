import { command, run, string, boolean } from "@drizzle-team/brocli";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

const execAsync = promisify(exec);

// Define table order based on foreign key dependencies
// Tables with no dependencies first, then tables that depend on them
// Skip event table
const TABLE_ORDER = [
    "user",
    "verification",
    "session", // Depends on user
    "account", // Depends on user
    "apikey", // Depends on user
] as const;

type TableName = (typeof TABLE_ORDER)[number];

async function exportTable(
    database: string,
    table: TableName,
    outputDir: string,
): Promise<string> {
    const outputFile = join(outputDir, `${table}.sql`);
    console.log(`Exporting ${table} from ${database}...`);
    try {
        const { stderr } = await execAsync(
            `npx wrangler d1 export ${database} --table ${table} --output ${outputFile}`,
        );
        if (stderr) {
            console.warn(`  Warning: ${stderr}`);
        }
        console.log(`  Successfully wrote data in ${table} to ${outputFile}`);
        return outputFile;
    } catch (error: any) {
        console.error(`  Failed to export ${table}:`, error.message);
        throw error;
    }
}

async function importTable(
    database: string,
    table: TableName,
    sqlFile: string,
): Promise<void> {
    console.log(`Importing ${table} into ${database}...`);
    try {
        const { stderr } = await execAsync(
            `npx wrangler d1 execute ${database} --file ${sqlFile}`,
        );
        if (stderr) {
            console.warn(`  Warning: ${stderr}`);
        }
        console.log(`  Successfully imported ${table}`);
    } catch (error: any) {
        console.error(`  Failed to import ${table}:`, error.message);
        throw error;
    }
}

async function ensureDirectoryExists(dir: string): Promise<void> {
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
}

const exportCommand = command({
    name: "export",
    desc: "Export tables from source database (backup only)",
    options: {
        source: string().alias("s").desc("Source database name").required(),
        backupDir: string()
            .alias("d")
            .desc("Directory to store backup files")
            .default("./db-backup"),
        tables: string()
            .desc("Comma-separated list of tables to export (default: all)")
            .default(""),
    },
    handler: async (opts) => {
        const { source, backupDir, tables } = opts;
        const tableList = tables
            ? (tables.split(",").filter(Boolean) as TableName[])
            : TABLE_ORDER;

        console.log("\n");
        console.log("Starting database export:");
        console.log(`  Source: ${source}`);
        console.log(`  Backup directory: ${backupDir}`);
        console.log(`  Tables: ${tableList.join(", ")}`);
        console.log("\n");

        try {
            await ensureDirectoryExists(backupDir);

            for (const table of tableList) {
                await exportTable(source, table, backupDir);
            }
            console.log("\n");
            console.log("  Export completed successfully!");
            console.log(`  Backup files saved at: ${backupDir}\n`);
        } catch (error: any) {
            console.error("\n  Export failed:", error.message);
            process.exit(1);
        }
    },
});

const importCommand = command({
    name: "import",
    desc: "Import tables to target database from backup files",
    options: {
        target: string().alias("t").desc("Target database name").required(),
        dir: string()
            .desc("Directory containing backup files")
            .default("./backup"),
        tables: string()
            .desc(
                "Comma-separated list of tables to import (default: all in correct order)",
            )
            .default(""),
    },
    handler: async (opts) => {
        const { target, dir, tables } = opts;
        const tableList = tables
            ? (tables.split(",").filter(Boolean) as TableName[])
            : TABLE_ORDER;

        console.log("\nStarting database import:");
        console.log(`  Target: ${target}`);
        console.log(`  Backup directory: ${dir}`);
        console.log(`  Tables (in order): ${tableList.join(", ")}`);
        console.log("\n");

        try {
            for (const table of tableList) {
                const sqlFile = join(dir, `${table}.sql`);
                if (!existsSync(sqlFile)) {
                    throw new Error(`Backup file not found: ${sqlFile}`);
                }
                await importTable(target, table, sqlFile);
            }
            console.log("\nImport completed successfully!\n");
        } catch (error: any) {
            console.error("\nImport failed:", error.message);
            process.exit(1);
        }
    },
});

const listTablesCommand = command({
    name: "list-tables",
    desc: "List all tables in correct migration order",
    handler: async () => {
        console.log("\nTables in correct migration order:\n");
        TABLE_ORDER.forEach((table, index) => {
            const deps =
                index === 0 || index === 1 || index === 2
                    ? "no dependencies"
                    : "depends on user";
            console.log(`   ${index + 1}. ${table.padEnd(12)} (${deps})`);
        });
        console.log("\n");
    },
});

const commands = [
    migrateCommand,
    exportCommand,
    importCommand,
    listTablesCommand,
];

run(commands);
