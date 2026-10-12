import {
    PhotonImage,
    resize,
    SamplingFilter,
    watermark,
} from "@cf-wasm/photon";
import blackLockup from "../assets/lockup-horizontal-black.png";
import whiteLockup from "../assets/lockup-horizontal-white.png";
import { GLIB_ASCII } from "./glib-ascii.ts";

// The VM's post-processing (createAndReturnImages.ts, imageOperations.ts and
// writeExifMetadata.ts) with photon instead of sharp: resize to the exact
// size, the outlined lockup in the bottom-right corner, one JPEG at sharp's
// default quality 80, then the Exif segment sharp wrote. origin.ts loads this
// module only for a generation.

const LOGO_ASPECT_RATIO = 1024 / 126;

export type LogoPlacement = {
    width: number;
    height: number;
    left: number;
    top: number;
    outline: number;
};

/** The VM's getLogoPlacement: readable without dominating the image */
export function getLogoPlacement(width: number, height: number): LogoPlacement {
    const shortSide = Math.min(width, height);
    const margin = Math.max(
        1,
        Math.min(
            Math.max(10, Math.min(20, Math.round(shortSide * 0.015))),
            Math.floor(width / 8),
            Math.floor(height / 8),
        ),
    );
    const availableWidth = Math.max(1, width - margin * 2);
    const availableHeight = Math.max(1, height - margin * 2);
    const desiredHeight = Math.max(
        16,
        Math.min(28, Math.round(shortSide * 0.025)),
    );
    const logoHeight = Math.max(
        1,
        Math.min(
            desiredHeight,
            availableHeight,
            Math.max(1, Math.floor(availableWidth / LOGO_ASPECT_RATIO)),
        ),
    );
    const logoWidth = Math.min(
        availableWidth,
        Math.max(1, Math.round(logoHeight * LOGO_ASPECT_RATIO)),
    );

    return {
        width: logoWidth,
        height: logoHeight,
        left: width - logoWidth - margin,
        top: height - logoHeight - margin,
        outline: logoHeight >= 24 ? 2 : 1,
    };
}

// Per isolate: the decoded lockups, and the black and white pair resized to
// each logo size (a few, as the logo is 16 to 28 px high)
let lockups: PhotonImage[] | undefined;
const resizedLockups = new Map<string, PhotonImage[]>();

/** Eight black copies at the outline offsets, then the white lockup on top */
function addLogo(image: PhotonImage) {
    const placement = getLogoPlacement(image.get_width(), image.get_height());
    const size = `${placement.width}x${placement.height}`;
    if (!resizedLockups.has(size)) {
        lockups ??= [blackLockup, whiteLockup].map((png) =>
            PhotonImage.new_from_byteslice(new Uint8Array(png)),
        );
        const resized = lockups.map((lockup) =>
            resize(
                lockup,
                placement.width,
                placement.height,
                SamplingFilter.Lanczos3,
            ),
        );
        resizedLockups.set(size, resized);
    }
    const [black, white] = resizedLockups.get(size);
    for (const x of [-1, 0, 1]) {
        for (const y of [-1, 0, 1]) {
            if (x === 0 && y === 0) continue;
            const left = placement.left + x * placement.outline;
            const top = placement.top + y * placement.outline;
            watermark(image, black, BigInt(left), BigInt(top));
        }
    }
    watermark(image, white, BigInt(placement.left), BigInt(placement.top));
}

/**
 * GLib 2.81.1's g_str_to_ascii, which libvips 8.15.3 (sharp 0.33.5) applied
 * to Make and UserComment: a character outside ASCII becomes its entry in
 * GLib's default transliteration table (glib-ascii.ts, generated from
 * gtranslit-data.h), else "?". That table has no two-character entries, and
 * the VM never set a locale that would pick another table.
 */
const toAscii = (text: string) =>
    Array.from(text, (char) =>
        char.codePointAt(0) < 0x80 ? char : (GLIB_ASCII[char] ?? "?"),
    ).join("");

const SHORT = 3;

/**
 * The Exif APP1 segment that libvips and libexif wrote for sharp's
 * withExifMerge, byte for byte. Little-endian TIFF:
 * - IFD0 at 8: Make, Orientation 1, X/YResolution 72/1, ResolutionUnit 2
 *   (inches), YCbCrPositioning 1, the Exif IFD's offset, and UserComment
 *   ("ASCII", three NULs, then the text)
 * - the values longer than 4 bytes from 110, in libexif's order, each padded
 *   to an even length (Make is always "sana", so it is one of them)
 * - the Exif IFD: ExifVersion 0210, ComponentsConfiguration YCbCr,
 *   FlashpixVersion 0100, ColorSpace uncalibrated, and the pixel size
 */
function exifSegment(
    width: number,
    height: number,
    make: string,
    comment: string,
) {
    const bytes = (text: string) =>
        Uint8Array.from(toAscii(text), (char) => char.charCodeAt(0));
    const makeBytes = bytes(`${make}\0`);
    const commentBytes = bytes(`ASCII\0\0\0${comment}`);
    const even = (length: number) => length + (length & 1);
    const makeAt = 126;
    const commentAt = makeAt + even(makeBytes.length);
    const exifAt = commentAt + even(commentBytes.length);
    const tiff = new Uint8Array(exifAt + 78);
    const view = new DataView(tiff.buffer);
    const ifd = (at: number, entries: number[][]) => {
        view.setUint16(at, entries.length, true);
        entries.forEach(([tag, type, count, ...value], i) => {
            const entry = at + 2 + 12 * i;
            view.setUint16(entry, tag, true);
            view.setUint16(entry + 2, type, true);
            view.setUint32(entry + 4, count, true);
            if (value.length > 1) tiff.set(value, entry + 8);
            else if (type === SHORT) view.setUint16(entry + 8, value[0], true);
            else view.setUint32(entry + 8, value[0], true);
        });
    };
    tiff.set([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]);
    ifd(8, [
        [0x010f, 2, makeBytes.length, makeAt],
        [0x0112, SHORT, 1, 1],
        [0x011a, 5, 1, 110],
        [0x011b, 5, 1, 118],
        [0x0128, SHORT, 1, 2],
        [0x0213, SHORT, 1, 1],
        [0x8769, 4, 1, exifAt],
        [0x9286, 7, commentBytes.length, commentAt],
    ]);
    tiff.set([72, 0, 0, 0, 1, 0, 0, 0, 72, 0, 0, 0, 1, 0, 0, 0], 110);
    tiff.set(makeBytes, makeAt);
    tiff.set(commentBytes, commentAt);
    ifd(exifAt, [
        [0x9000, 7, 4, ...bytes("0210")],
        [0x9101, 7, 4, 1, 2, 3, 0],
        [0xa000, 7, 4, ...bytes("0100")],
        [0xa001, SHORT, 1, 0xffff],
        [0xa002, 4, 1, width],
        [0xa003, 4, 1, height],
    ]);
    const segment = new Uint8Array(10 + tiff.length);
    const length = segment.length - 2;
    segment.set([0xff, 0xe1, length >> 8, length & 0xff, ...bytes("Exif\0\0")]);
    segment.set(tiff, 10);
    return segment;
}

/** The JPEG with the VM's Exif segment right after its start marker */
function withExif(
    jpeg: Uint8Array,
    width: number,
    height: number,
    metadata: { model: string },
) {
    const segment = exifSegment(
        width,
        height,
        metadata.model,
        JSON.stringify(metadata),
    );
    const output = new Uint8Array(jpeg.length + segment.length);
    output.set(jpeg.subarray(0, 2));
    output.set(segment, 2);
    output.set(jpeg.subarray(2), 2 + segment.length);
    return output;
}

/**
 * Gen's image as the branded JPEG of exactly width x height. Throws sharp's
 * error for a body that is not an image.
 */
export function brand(
    input: Uint8Array,
    width: number,
    height: number,
    metadata: { model: string },
): Uint8Array {
    // A wasm panic leaves photon unusable, so sizes sharp rejects throw first
    for (const [name, value] of Object.entries({ width, height })) {
        if (!Number.isInteger(value) || value <= 0) {
            throw new Error(
                `Expected positive integer for ${name} but received ${value} of type number`,
            );
        }
    }
    let decoded: PhotonImage;
    try {
        decoded = PhotonImage.new_from_byteslice(input);
    } catch {
        throw new Error("Input buffer contains unsupported image format");
    }
    let image: PhotonImage;
    try {
        image = resize(decoded, width, height, SamplingFilter.Lanczos3);
    } finally {
        decoded.free();
    }
    try {
        try {
            addLogo(image);
        } catch (error) {
            // As on the VM: the image goes out without the logo
            console.error(
                JSON.stringify({
                    adapter: "image",
                    error: "logo",
                    type: error.name,
                }),
            );
        }
        return withExif(image.get_bytes_jpeg(80), width, height, metadata);
    } finally {
        image.free();
    }
}
