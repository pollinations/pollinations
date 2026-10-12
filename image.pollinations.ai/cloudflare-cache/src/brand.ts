import {
    PhotonImage,
    resize,
    SamplingFilter,
    watermark,
} from "@cf-wasm/photon";
// The package's "module" and "browser" fields name files it does not ship
import { dump, insert, TagValues } from "piexif-ts/dist/piexif.js";
import blackLockup from "../assets/lockup-horizontal-black.png";
import whiteLockup from "../assets/lockup-horizontal-white.png";

// The VM's post-processing (createAndReturnImages.ts, imageOperations.ts and
// writeExifMetadata.ts) with photon instead of sharp: resize to the exact
// size, the outlined lockup in the bottom-right corner, one JPEG at sharp's
// default quality 80, then Make and the UserComment JSON in EXIF. origin.ts
// loads this module only for a generation.

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

/** Bytes as a binary string, the form piexif-ts reads and writes */
function binary(bytes: Uint8Array): string {
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return text;
}

/**
 * sharp's withExifMerge wrote Make and, in IFD0, a UserComment of "ASCII"
 * and three NULs, then the JSON's UTF-8 bytes. The same value goes into the
 * Exif IFD, as gen's writeExifMetadata.ts places it.
 */
function withExif(jpeg: Uint8Array, metadata: { model: string }): Uint8Array {
    const comment = new TextEncoder().encode(JSON.stringify(metadata));
    const exif = dump({
        "0th": { [TagValues.ImageIFD.Make]: metadata.model },
        Exif: {
            [TagValues.ExifIFD.UserComment]: `ASCII\0\0\0${binary(comment)}`,
        },
    });
    return Uint8Array.from(insert(exif, binary(jpeg)), (char) =>
        char.charCodeAt(0),
    );
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
        return withExif(image.get_bytes_jpeg(80), metadata);
    } finally {
        image.free();
    }
}
