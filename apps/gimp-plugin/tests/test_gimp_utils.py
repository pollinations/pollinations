from pollinations_core.gimp_utils import (
    add_image_bytes_as_new_layer,
    export_drawable_or_selection_to_png_bytes,
)


def test_export_drawable_fallback():
    # Outside GIMP environment, returns non-empty PNG byte stub
    data = export_drawable_or_selection_to_png_bytes(None, None)
    assert isinstance(data, bytes)
    assert len(data) > 0
    assert data.startswith(b"\x89PNG")


def test_add_image_bytes_as_new_layer_fallback():
    img, layer = add_image_bytes_as_new_layer(None, b"fake_bytes", layer_name="Test Layer")
    assert img == "mock_image"
    assert layer == "mock_layer"
