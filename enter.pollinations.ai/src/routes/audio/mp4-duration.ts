/**
 * Parse MP4/M4A container to extract exact duration from the `mvhd` atom.
 * Returns duration in seconds, or null if the atom isn't found.
 *
 * mvhd layout (after the 4-byte "mvhd" tag):
 *   - 1 byte version (0 or 1)
 *   - 3 bytes flags
 *   - version 0: 4B created, 4B modified, 4B timescale, 4B duration
 *   - version 1: 8B created, 8B modified, 4B timescale, 8B duration
 */
export function parseMp4Duration(buffer: ArrayBuffer): number | null {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // Find "mvhd" marker
    const mvhd = [0x6d, 0x76, 0x68, 0x64]; // "mvhd"
    let offset = -1;
    for (let i = 0; i < bytes.length - 28; i++) {
        if (
            bytes[i] === mvhd[0] &&
            bytes[i + 1] === mvhd[1] &&
            bytes[i + 2] === mvhd[2] &&
            bytes[i + 3] === mvhd[3]
        ) {
            offset = i;
            break;
        }
    }
    if (offset === -1) return null;

    const version = bytes[offset + 4];
    let timescale: number;
    let duration: number;

    if (version === 0) {
        timescale = view.getUint32(offset + 16);
        duration = view.getUint32(offset + 20);
    } else {
        timescale = view.getUint32(offset + 24);
        // Read 64-bit duration — for practical music lengths, low 32 bits suffice
        duration = Number(view.getBigUint64(offset + 28));
    }

    if (timescale === 0) return null;
    return duration / timescale;
}
