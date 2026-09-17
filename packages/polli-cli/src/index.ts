import { program } from "./program.js";

if (process.argv.length <= 2) {
    program.help();
}

program.parseAsync(process.argv).catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
});
