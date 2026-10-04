import assert from "node:assert/strict";
import test from "node:test";
import { crc32, createZip, listZipEntries } from "../src/zip.js";

test("crc32 known vector", () => {
    assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("zip round-trip preserves names and bytes", () => {
    const files = [
        { name: "hello.txt", data: new TextEncoder().encode("hi pollen") },
        {
            name: "src/main.js",
            data: new TextEncoder().encode('console.log("ütf8 ✓")'),
        },
        { name: "empty", data: new Uint8Array(0) },
    ];
    const zip = createZip(files);
    const entries = listZipEntries(zip);
    assert.equal(entries.length, 3);
    assert.deepEqual(
        entries.map((e) => e.name),
        ["hello.txt", "src/main.js", "empty"],
    );
    assert.equal(new TextDecoder().decode(entries[0].data), "hi pollen");
    assert.equal(
        new TextDecoder().decode(entries[1].data),
        'console.log("ütf8 ✓")',
    );
    assert.equal(entries[2].data.length, 0);
});

test("round-trip of 1 MiB binary content", () => {
    const data = new Uint8Array(1024 * 1024);
    for (let i = 0; i < data.length; i++) data[i] = i & 0xff;
    const zip = createZip([{ name: "big.bin", data }]);
    const [entry] = listZipEntries(zip);
    assert.equal(entry.data.length, data.length);
    assert.equal(crc32(entry.data), crc32(data));
});
