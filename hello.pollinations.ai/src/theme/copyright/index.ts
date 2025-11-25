/**
 * Central Copy Registry
 * Dynamically loads all copy files from this directory
 */

// Define a type for the module content
interface CopyModule {
    [key: string]: unknown;
}

// Use Vite's import.meta.glob to load all .ts files in this directory
// Eager loading ensures they are available immediately
const copyModules = import.meta.glob<CopyModule>("./*.ts", { eager: true });

export const ALL_COPY: Record<string, unknown> = {};

// Aggregate all exports into a single object
Object.entries(copyModules).forEach(([path, module]) => {
    // Skip index.ts itself
    if (path.includes("index.ts")) return;

    // Merge all named exports from the module
    Object.assign(ALL_COPY, module);
});

export default ALL_COPY;
