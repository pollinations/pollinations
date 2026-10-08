// Minimal, dependency-free ZIP writer (stored entries, no compression):
// enough to export the Pi workspace exactly as the agent wrote it.

function crc32(bytes) {
    // Standard CRC-32 (IEEE 802.3), table-driven.
    let table = crc32.table;
    if (!table) {
        table = crc32.table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            }
            table[n] = c >>> 0;
        }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

export function buildZip(entries) {
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBytes = encoder.encode(entry.path);
        const data = entry.bytes;
        const crc = crc32(data);

        const local = new Uint8Array(30 + nameBytes.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true); // local file header signature
        lv.setUint16(4, 20, true); // version needed
        lv.setUint16(6, 0, true); // flags
        lv.setUint16(8, 0, true); // stored
        lv.setUint16(10, 0, true); // mod time
        lv.setUint16(12, 0x21, true); // mod date (1996-01-01)
        lv.setUint32(14, crc, true);
        lv.setUint32(18, data.length, true);
        lv.setUint32(22, data.length, true);
        lv.setUint16(26, nameBytes.length, true);
        lv.setUint16(28, 0, true);
        local.set(nameBytes, 30);

        chunks.push(local, data);
        central.push({ nameBytes, crc, size: data.length, offset });
        offset += local.length + data.length;
    }

    const centralStart = offset;
    for (const c of central) {
        const rec = new Uint8Array(46 + c.nameBytes.length);
        const v = new DataView(rec.buffer);
        v.setUint32(0, 0x02014b50, true); // central directory signature
        v.setUint16(4, 20, true); // version made by
        v.setUint16(6, 20, true); // version needed
        v.setUint16(8, 0, true); // flags
        v.setUint16(10, 0, true); // stored
        v.setUint16(12, 0, true); // mod time
        v.setUint16(14, 0x21, true); // mod date
        v.setUint32(16, c.crc, true);
        v.setUint32(20, c.size, true);
        v.setUint32(24, c.size, true);
        v.setUint16(28, c.nameBytes.length, true);
        v.setUint32(42, c.offset, true);
        rec.set(c.nameBytes, 46);
        chunks.push(rec);
        offset += rec.length;
    }

    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); // end of central directory
    ev.setUint16(8, central.length, true); // entries on this disk
    ev.setUint16(10, central.length, true); // total entries
    ev.setUint32(12, offset - centralStart, true); // central dir size
    ev.setUint32(16, centralStart, true); // central dir offset
    chunks.push(end);

    return new Blob(chunks, { type: "application/zip" });
}
