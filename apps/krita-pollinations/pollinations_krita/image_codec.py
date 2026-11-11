"""Pixel <-> PNG conversion for Krita's raw BGRA Node.pixelData buffers.

Krita stores U8/RGBA node pixels as packed BGRA bytes, which is exactly the
in-memory layout of Qt's QImage.Format_ARGB32 on every platform Krita ships
for (all little-endian). That equivalence is what lets this module convert
without touching Krita's own API, so it can be unit tested without Krita.
"""
from PyQt5.QtCore import QBuffer, QByteArray, QIODevice, Qt
from PyQt5.QtGui import QImage

PIXEL_FORMAT = QImage.Format_ARGB32


def pixels_to_png(data, width, height):
    """Encode a raw BGRA pixel buffer (as returned by Node.pixelData) to PNG bytes.

    Raises ValueError if the buffer is too short or Qt cannot encode it.
    """
    if len(data) < width * height * 4:
        raise ValueError("Pixel buffer is smaller than width * height * 4 bytes.")
    image = QImage(bytes(data), width, height, PIXEL_FORMAT)
    if image.isNull():
        raise ValueError("Qt could not interpret the pixel buffer as an image.")
    buffer = QByteArray()
    device = QBuffer(buffer)
    device.open(QIODevice.WriteOnly)
    try:
        if not image.save(device, "PNG"):
            raise ValueError("Qt could not encode the image as PNG.")
    finally:
        device.close()
    return bytes(buffer)


def png_to_pixels(data, width, height):
    """Decode generated image bytes to a raw BGRA pixel buffer sized to (width, height).

    Models can return PNG or JPEG bytes, so the format is auto-detected
    rather than forced. The source is scaled to fit exactly, since a model's
    fixed resolution presets rarely match the target canvas or selection
    pixel-for-pixel. Raises ValueError if Qt cannot decode the data.
    """
    image = QImage()
    if not image.loadFromData(data):
        raise ValueError("Qt could not decode the generated image data.")
    if image.width() != width or image.height() != height:
        image = image.scaled(width, height, Qt.IgnoreAspectRatio, Qt.SmoothTransformation)
    image = image.convertToFormat(PIXEL_FORMAT)
    size = width * height * 4
    return bytes(image.constBits().asstring(size))
