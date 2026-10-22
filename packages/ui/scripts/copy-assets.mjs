// Cross-platform replacement for the POSIX-only `cp`/`sed`/`mkdir -p` asset
// steps in the build:* npm scripts (Windows cmd.exe has none of them, so
// `npm run build` — and the `predev` that chains it — failed there). Invoked as
// `node scripts/copy-assets.mjs <css|fonts|brand|licenses>`, mirroring the
// build:* targets. Paths resolve from this file's location, so it works no
// matter which shell or working directory npm runs it from.
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Copy every file in `srcDir` whose extension matches into `destDir`. */
async function copyByExtension(srcDir, destDir, ext) {
    await mkdir(destDir, { recursive: true });
    for (const entry of await readdir(srcDir)) {
        if (extname(entry) === ext) {
            await cp(join(srcDir, entry), join(destDir, entry));
        }
    }
}

const targets = {
    // build:css runs after tailwind wrote dist/styles.css. Copy theme.css and
    // rewrite app.css's bare import to the co-located, minified styles.css.
    async css() {
        const styles = join(ROOT, "src/styles");
        await mkdir(join(ROOT, "dist"), { recursive: true });
        await cp(join(styles, "theme.css"), join(ROOT, "dist/theme.css"));
        const app = await readFile(join(styles, "app.css"), "utf8");
        await writeFile(
            join(ROOT, "dist/app.css"),
            app.replaceAll("@pollinations/ui/styles.css", "./styles.css"),
        );
    },
    async fonts() {
        await copyByExtension(
            join(ROOT, "src/fonts"),
            join(ROOT, "dist/fonts"),
            ".woff2",
        );
    },
    async licenses() {
        await copyByExtension(
            join(ROOT, "src/licenses"),
            join(ROOT, "dist/licenses"),
            ".txt",
        );
    },
    async brand() {
        await mkdir(join(ROOT, "dist/brand"), { recursive: true });
        await cp(join(ROOT, "src/brand"), join(ROOT, "dist/brand"), {
            recursive: true,
        });
    },
};

const target = targets[process.argv[2]];
if (!target) {
    console.error(
        `usage: node scripts/copy-assets.mjs <${Object.keys(targets).join("|")}>`,
    );
    process.exit(1);
}
await target();
