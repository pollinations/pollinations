import fs from "fs";
import path from "path";
import { extractCopyJobs } from "../src/theme/guidelines/helpers/writing";

// Helper to extract flat copy from a full copy object
function flattenCopy(fullCopy: any): Record<string, string> {
    const { jobs } = extractCopyJobs(fullCopy, false);
    const flatCopy: Record<string, string> = {};
    jobs.forEach((job) => {
        flatCopy[job.id] = job.text;
    });
    return flatCopy;
}

const presetsDir = path.resolve(__dirname, "../src/content/presets");
const files = fs
    .readdirSync(presetsDir)
    .filter((f) => f.endsWith(".ts") && f !== "index.ts");

files.forEach((file) => {
    const filePath = path.join(presetsDir, file);
    const content = fs.readFileSync(filePath, "utf-8");

    // Extract the Copy object using regex (simple parsing)
    // We assume the format: export const {Name}Copy: ThemeCopy = { ... };
    const copyMatch = content.match(
        /export const (\w+)Copy: ThemeCopy = (\{[\s\S]*?\});/,
    );

    if (copyMatch) {
        const copyName = copyMatch[1];
        const copyObjString = copyMatch[2];

        try {
            // Evaluates the object string to get the actual object
            // This is a bit risky but works for static config files
            // We need to handle "transforms" array which might be in the string
            // But wait, we can just use the extractCopyJobs on the object if we can parse it.
            // Since it's TS, we can't just JSON.parse.
            // Alternative: Import the file using jiti/vite-node and get the object
            // But we are running this script with vite-node, so we can dynamic import!
            // Let's use dynamic import approach in a separate async function
        } catch (e) {
            console.error(`Failed to parse copy in ${file}`, e);
        }
    }
});

async function migrate() {
    for (const file of files) {
        if (file === "index.ts") continue;

        console.log(`Migrating ${file}...`);
        const filePath = path.join(presetsDir, file);

        // Import the module
        const module = await import(filePath);

        // Find the copy export
        const copyKey = Object.keys(module).find((k) => k.endsWith("Copy"));
        if (!copyKey) {
            console.warn(`No copy found in ${file}`);
            continue;
        }

        const fullCopy = module[copyKey];
        const flatCopy = flattenCopy(fullCopy);

        // Read original file content
        let fileContent = fs.readFileSync(filePath, "utf-8");

        // Replace the Copy export with the new flat format
        // We look for the export statement and replace it
        // Regex to match the export: export const {Name}Copy: ThemeCopy = { ... };
        // We need to be careful to match the whole object.
        // Since we have the key, we can construct the new export string.

        const newExport = `export const ${copyKey} = ${JSON.stringify(flatCopy, null, 2)};`;

        // We need to find where the old export starts and ends.
        // A simple regex might fail if there are nested braces.
        // But we know it ends with }; usually at the end of file or before another export.
        // Actually, let's just replace the whole file content part.

        // Better approach:
        // 1. Remove the old export block.
        // 2. Append the new export block.
        // But we want to keep imports and other exports.

        // Let's try to match the start of the export
        const startRegex = new RegExp(`export const ${copyKey}: ThemeCopy =`);
        const startMatch = fileContent.match(startRegex);

        if (startMatch) {
            const startIndex = startMatch.index!;
            // Find the end of the object (matching braces) is hard with regex.
            // But we can assume it goes until the end of the file or next export?
            // Most preset files end with the copy export.

            // Let's try to find the next "export const" or end of file
            // But wait, usually Copy is the last thing.

            // Let's just use a simpler approach:
            // We know the structure of these files. They import ThemeCopy.
            // We should remove that import too.

            // 1. Remove "import type { ThemeCopy } from '../buildPrompts';"
            fileContent = fileContent.replace(
                /import type \{ ThemeCopy \} from "\.\.\/buildPrompts";\n?/,
                "",
            );

            // 2. Replace the export line and everything after it (assuming it's last)
            // If it's not last, this is dangerous.
            // Let's check if it's last.

            // Let's use a safer replacement:
            // We replace `export const {Name}Copy: ThemeCopy = { ... };`
            // We can construct a regex that matches the start, and then we just replace the whole block
            // by using the fact that we know the content of the full copy object? No.

            // Let's use the fact that we can generate the whole file content again?
            // No, we want to preserve the Theme and CssVariables exports which are complex.

            // Let's try to locate the export and replace it.
            // We can search for `export const ${copyKey}: ThemeCopy =`
            // And then find the matching closing brace.

            let openBraces = 0;
            let endIndex = -1;
            let foundStart = false;

            for (let i = startIndex; i < fileContent.length; i++) {
                if (fileContent[i] === "{") {
                    openBraces++;
                    foundStart = true;
                } else if (fileContent[i] === "}") {
                    openBraces--;
                }

                if (foundStart && openBraces === 0) {
                    endIndex = i + 1; // Include the closing brace
                    // Check for semicolon
                    if (fileContent[i + 1] === ";") endIndex++;
                    break;
                }
            }

            if (endIndex !== -1) {
                const before = fileContent.substring(0, startIndex);
                const after = fileContent.substring(endIndex);
                fileContent = before + newExport + after;

                // Write back
                fs.writeFileSync(filePath, fileContent);
                console.log(`✅ Migrated ${file}`);
            } else {
                console.error(`Could not find end of object for ${file}`);
            }
        } else {
            console.error(`Could not find export start for ${file}`);
        }
    }
}

migrate();
