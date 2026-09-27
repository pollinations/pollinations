import { mkdir, writeFile } from "node:fs/promises";
import { bundleWorkers } from "./runtime";

const directory = new URL("./dist-runtime/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(
    new URL("workers.json", directory),
    JSON.stringify(await bundleWorkers()),
);
