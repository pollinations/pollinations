import { readdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const files = [];
async function collect(directory) {
    for (const entry of await readdir(new URL(directory, root), {
        withFileTypes: true,
    })) {
        const path = directory + entry.name;
        if (entry.isDirectory() && entry.name !== "__pycache__")
            await collect(`${path}/`);
        else if (entry.isFile() && /\.(py|typed)$/.test(path))
            files.push({
                path: `/home/user/floret/${path}`,
                data: await readFile(new URL(path, root), "utf8"),
            });
    }
}
await collect("src/");
for (const path of ["pyproject.toml", "README.md"])
    files.push({
        path: `/home/user/floret/${path}`,
        data: await readFile(new URL(path, root), "utf8"),
    });
await writeFile(
    new URL("source-bundle.js", root),
    `export default ${JSON.stringify(files)};\n`,
);
console.log(`Bundled ${files.length} Floret source files`);
