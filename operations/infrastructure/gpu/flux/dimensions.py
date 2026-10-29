"""Dimension snapping for the self-hosted FLUX backend.

The quantized FLUX pipeline needs every side to be a multiple of 8 and the
pixel count to be divisible by 65536 (latent-grid alignment). Most requested
sizes do not satisfy that, so they are adjusted before generation.

Adjust by scaling the pair together instead of searching width and height
independently: the aspect ratio the caller asked for is the part they can see,
and an independent search silently turns e.g. 256x128 into 256x256.
"""

from math import gcd

MIN_DIMENSION = 64
MAX_DIMENSION = 8192
PIXEL_MULTIPLE = 65536
SIDE_MULTIPLE = 8


def is_valid_dimensions(width: int, height: int) -> bool:
    return (
        width % SIDE_MULTIPLE == 0
        and height % SIDE_MULTIPLE == 0
        and (width * height) % PIXEL_MULTIPLE == 0
    )


def _height_step(width: int) -> int:
    """Smallest height step that makes width * height divisible by 65536."""
    return PIXEL_MULTIPLE // gcd(width, PIXEL_MULTIPLE)


def nearest_valid_dimensions(
    width: float, height: float, max_pixels: int
) -> tuple[int, int]:
    """Return the closest valid size that keeps the requested aspect ratio."""
    if width > MAX_DIMENSION or height > MAX_DIMENSION:
        raise ValueError(
            f"Dimensions too large: {width}x{height}. "
            f"Maximum allowed is {MAX_DIMENSION}x{MAX_DIMENSION}"
        )
    if width < MIN_DIMENSION or height < MIN_DIMENSION:
        raise ValueError(
            f"Dimensions too small: {width}x{height}. "
            f"Minimum allowed is {MIN_DIMENSION}x{MIN_DIMENSION}"
        )

    target_w = round(width)
    target_h = round(height)
    # Scale down first when the request is above the pixel cap, exactly as the
    # previous implementation did, so the aspect ratio survives the cap.
    if target_w * target_h > max_pixels:
        scale = (max_pixels / (target_w * target_h)) ** 0.5
        target_w = max(SIDE_MULTIPLE, round(target_w * scale))
        target_h = max(SIDE_MULTIPLE, round(target_h * scale))

    ratio = target_w / target_h
    target_pixels = target_w * target_h
    best: tuple[float, float, int, int] | None = None

    low = SIDE_MULTIPLE
    high = MAX_DIMENSION
    for candidate_w in range(low, high + 1, SIDE_MULTIPLE):
        step = _height_step(candidate_w)
        ideal_h = candidate_w / ratio
        candidate_h = max(step, round(ideal_h / step) * step)
        if candidate_h > MAX_DIMENSION:
            continue
        if candidate_w * candidate_h > max_pixels:
            continue
        if not is_valid_dimensions(candidate_w, candidate_h):
            continue
        aspect_error = abs(candidate_w / candidate_h - ratio) / ratio
        pixel_error = abs(candidate_w * candidate_h - target_pixels) / target_pixels
        score = (aspect_error, pixel_error, candidate_w, candidate_h)
        if best is None or score < best:
            best = score

    if best is None:
        # No aspect-preserving size fits the caps: fall back to the largest
        # valid size under the cap closest to the request.
        candidate_w = max(
            SIDE_MULTIPLE, (target_w // SIDE_MULTIPLE) * SIDE_MULTIPLE
        )
        while candidate_w > SIDE_MULTIPLE:
            step = _height_step(candidate_w)
            candidate_h = max(
                step, (max_pixels // candidate_w) // step * step
            )
            if (
                candidate_h >= MIN_DIMENSION
                and is_valid_dimensions(candidate_w, candidate_h)
            ):
                return candidate_w, candidate_h
            candidate_w -= SIDE_MULTIPLE
        raise ValueError(f"No valid size for {width}x{height}")

    return best[2], best[3]
