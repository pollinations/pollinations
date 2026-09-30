import { cp, mkdir, rm } from "node:fs/promises";

await rm(new URL("./dist/", import.meta.url), { recursive: true, force: true });
await mkdir(new URL("./dist/vendor/wasmer/", import.meta.url), {
    recursive: true,
});
await cp(
    new URL("./public/", import.meta.url),
    new URL("./dist/", import.meta.url),
    { recursive: true },
);
for (const dir of ["dist", "pkg"]) {
    await cp(
        new URL(`./node_modules/@wasmer/sdk/${dir}/`, import.meta.url),
        new URL(`./dist/vendor/wasmer/${dir}/`, import.meta.url),
        { recursive: true },
    );
}
await cp(
    new URL("./node_modules/@wasmer/sdk/LICENSE", import.meta.url),
    new URL("./dist/vendor/wasmer/LICENSE", import.meta.url),
);
await cp(
    new URL(
        "./node_modules/coi-serviceworker/coi-serviceworker.js",
        import.meta.url,
    ),
    new URL("./dist/coi-serviceworker.js", import.meta.url),
);
for (const [name, directory] of [
    ["@xterm/xterm", "xterm"],
    ["@xterm/addon-fit", "fit"],
]) {
    for (const path of ["lib", "LICENSE"])
        await cp(
            new URL(`./node_modules/${name}/${path}`, import.meta.url),
            new URL(`./dist/vendor/${directory}/${path}`, import.meta.url),
            { recursive: true },
        );
}
await cp(
    new URL("./node_modules/@xterm/xterm/css/xterm.css", import.meta.url),
    new URL("./dist/vendor/xterm/xterm.css", import.meta.url),
);
await mkdir(new URL("./dist/vendor/fflate/", import.meta.url), {
    recursive: true,
});
for (const [source, target] of [
    ["esm/browser.js", "browser.js"],
    ["LICENSE", "LICENSE"],
]) {
    await cp(
        new URL(`./node_modules/fflate/${source}`, import.meta.url),
        new URL(`./dist/vendor/fflate/${target}`, import.meta.url),
    );
}
