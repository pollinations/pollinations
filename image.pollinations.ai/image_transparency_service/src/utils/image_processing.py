def load_image(image_file):
    """Load an image from a file and convert it to RGBA format."""
    image = Image.open(io.BytesIO(image_file.read())).convert("RGBA")
    return image

def save_image_to_bytes(image, format="PNG"):
    """Save an image to bytes in the specified format."""
    output_io = io.BytesIO()
    image.save(output_io, format=format)
    output_io.seek(0)
    return output_io.getvalue()