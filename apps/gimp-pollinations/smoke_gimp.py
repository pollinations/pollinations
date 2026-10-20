"""Run inside GIMP's python-fu-eval batch interpreter (no network or key)."""
import importlib.util
from pathlib import Path
import sys
import struct
import zlib


def png_pixels(data):
    """Compare image data, excluding export timestamps such as PNG tIME."""
    position, compressed = 8, b""
    while position < len(data):
        size = struct.unpack(">I", data[position:position + 4])[0]
        if data[position + 4:position + 8] == b"IDAT":
            compressed += data[position + 8:position + 8 + size]
        position += size + 12
    return zlib.decompress(compressed)

directory = Path(__file__).resolve().parent
sys.path.insert(0, str(directory))
spec = importlib.util.spec_from_file_location("pollinations_plugin", directory / "pollinations-gimp.py")
plugin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plugin)
Gimp = plugin.Gimp
image = Gimp.Image.new(80, 60, Gimp.ImageBaseType.RGB)
try:
    layer = Gimp.Layer.new(image, "Source", 60, 40, Gimp.ImageType.RGBA_IMAGE, 100, Gimp.LayerMode.NORMAL)
    image.insert_layer(layer, None, 0)
    layer.set_offsets(10, 8)
    layer.fill(Gimp.FillType.WHITE)
    Gimp.Image.select_rectangle(image, Gimp.ChannelOps.REPLACE, 20, 18, 24, 16)
    before = plugin.export_source(layer)
    data, bounds = before
    assert data.startswith(b"\x89PNG"), "source is not PNG"
    assert bounds == (20, 18, 24, 16), bounds
    result = plugin.insert_result(data, image, bounds)
    assert len(image.get_layers()) == 2
    assert result.get_width() == 24 and result.get_height() == 16
    assert result.get_offsets()[1:] == (20, 18)
    assert layer.get_name() == "Source"
    after = plugin.export_source(layer)
    assert after[1] == before[1], "selection changed"
    assert png_pixels(after[0]) == png_pixels(before[0]), "source pixels changed"
    Gimp.Selection.none(image)
    assert plugin.export_source(layer)[1] == (10, 8, 60, 40)
    print("PASS: native GIMP export, selection bounds, new layer, offsets, unchanged source, whole-layer export", flush=True)
finally:
    image.delete()
