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
# Ratios this close are treated as equal so a larger near-ratio size can win
# over a smaller exact one.
ASPECT_RATIO_TOLERANCE = 0.05


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

    target_pixels = target_w * target_h
    best: tuple[float, bool, int, int, int] | None = None

    # The loop only builds valid sizes: the width is a multiple of 8 and the
    # height is a multiple of _height_step, so width * height is always a
    # multiple of 65536.
    for candidate_w in range(MIN_DIMENSION, MAX_DIMENSION + 1, SIDE_MULTIPLE):
        step = _height_step(candidate_w)
        first_h = ((MIN_DIMENSION + step - 1) // step) * step
        last_h = min(MAX_DIMENSION, max_pixels // candidate_w)
        for candidate_h in range(first_h, last_h + 1, step):
            pixels = candidate_w * candidate_h
            # Compare integer cross products before dividing so exactly 5%
            # stays inside the tolerance.
            target_cross_product = target_w * candidate_h
            aspect_error = (
                abs(candidate_w * target_h - target_cross_product)
                / target_cross_product
            )
            if aspect_error <= ASPECT_RATIO_TOLERANCE:
                aspect_error = 0.0
            # Among equally good ratios, prefer the smallest size that keeps
            # the target pixel count, or the largest below it if none fits.
            score = (
                aspect_error,
                pixels < target_pixels,
                abs(pixels - target_pixels),
                candidate_w,
                candidate_h,
            )
            if best is None or score < best:
                best = score

    if best is None:
        raise ValueError(f"No valid size for {width}x{height}")

    return best[3], best[4]
