// Store-only (no compression) ZIP writer. ~80 lines, no dependencies.
// Files: [{ name: string, data: Uint8Array, date?: Date }]

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++)
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(data) {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++)
        c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
    const time =
        ((date.getHours() & 0x1f) << 11) |
        ((date.getMinutes() & 0x3f) << 5) |
        ((date.getSeconds() >> 1) & 0x1f);
    const day =
        (((date.getFullYear() - 1980) & 0x7f) << 9) |
        (((date.getMonth() + 1) & 0xf) << 5) |
        (date.getDate() & 0x1f);
    return { time, day };
}

const ZIP32_MAX_U16 = 0xffff;
const ZIP32_MAX_U32 = 0xffffffff;

export function createZip(files) {
    // No ZIP64 support: reject inputs that would silently truncate.
    if (files.length > ZIP32_MAX_U16)
        throw new Error(`too many files for ZIP32: ${files.length}`);
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;

    const push = (bytes) => {
        chunks.push(bytes);
        offset += bytes.length;
    };
    const u16 = (v) => new Uint8Array([v & 0xff, (v >> 8) & 0xff]);
    const u32 = (v) =>
        new Uint8Array([
            v & 0xff,
            (v >> 8) & 0xff,
            (v >> 16) & 0xff,
            (v >>> 24) & 0xff,
        ]);

    for (const file of files) {
        const nameBytes = encoder.encode(file.name);
        if (nameBytes.length > ZIP32_MAX_U16)
            throw new Error(
                `file name too long for ZIP32: ${file.name.slice(0, 64)}`,
            );
        if (file.data.length > ZIP32_MAX_U32)
            throw new Error(`file too large for ZIP32: ${file.name}`);
        const crc = crc32(file.data);
        const { time, day } = dosDateTime(file.date);
        const localOffset = offset;

        push(u32(0x04034b50));
        push(u16(20)); // version needed
        push(u16(0x0800)); // UTF-8 names
        push(u16(0)); // method: store
        push(u16(time));
        push(u16(day));
        push(u32(crc));
        push(u32(file.data.length));
        push(u32(file.data.length));
        push(u16(nameBytes.length));
        push(u16(0));
        push(nameBytes);
        push(file.data);

        central.push({
            nameBytes,
            crc,
            size: file.data.length,
            time,
            day,
            localOffset,
        });
    }

    const centralStart = offset;
    for (const entry of central) {
        push(u32(0x02014b50));
        push(u16(20)); // version made by
        push(u16(20)); // version needed
        push(u16(0x0800));
        push(u16(0));
        push(u16(entry.time));
        push(u16(entry.day));
        push(u32(entry.crc));
        push(u32(entry.size));
        push(u32(entry.size));
        push(u16(entry.nameBytes.length));
        push(u16(0)); // extra
        push(u16(0)); // comment
        push(u16(0)); // disk
        push(u16(0)); // internal attrs
        push(u32(0)); // external attrs
        push(u32(entry.localOffset));
        push(entry.nameBytes);
    }
    const centralSize = offset - centralStart;

    push(u32(0x06054b50));
    push(u16(0));
    push(u16(0));
    push(u16(central.length));
    push(u16(central.length));
    push(u32(centralSize));
    push(u32(centralStart));
    push(u16(0));

    const out = new Uint8Array(offset);
    let at = 0;
    for (const chunk of chunks) {
        out.set(chunk, at);
        at += chunk.length;
    }
    return out;
}

// Minimal reader used by tests and by nothing at runtime.
export function listZipEntries(zip) {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const decoder = new TextDecoder();
    const entries = [];
    let eocd = -1;
    for (let i = zip.length - 22; i >= 0; i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error("not a zip");
    const count = view.getUint16(eocd + 10, true);
    let at = view.getUint32(eocd + 16, true);
    for (let n = 0; n < count; n++) {
        if (view.getUint32(at, true) !== 0x02014b50)
            throw new Error("bad central directory");
        const nameLen = view.getUint16(at + 28, true);
        const extraLen = view.getUint16(at + 30, true);
        const commentLen = view.getUint16(at + 32, true);
        const localOffset = view.getUint32(at + 42, true);
        const name = decoder.decode(zip.subarray(at + 46, at + 46 + nameLen));
        const localNameLen = view.getUint16(localOffset + 26, true);
        const localExtraLen = view.getUint16(localOffset + 28, true);
        const size = view.getUint32(localOffset + 18, true);
        const dataStart = localOffset + 30 + localNameLen + localExtraLen;
        entries.push({ name, data: zip.subarray(dataStart, dataStart + size) });
        at += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
}
