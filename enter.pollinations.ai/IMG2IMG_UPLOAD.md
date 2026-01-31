# Image-to-Image Upload (POST /image)

Upload local image files directly for img2img generation without external hosting.

## Key Differences from GET /image
- **POST**: Accepts multipart/form-data with image file upload
- **GET**: Requires pre-hosted image URLs as query parameter
- **Same**: All query parameters (model, width, height, seed, etc.) work identically

## Supported Formats
- JPEG, PNG, WebP, GIF (max 50MB)

## Quick Example
```bash
curl -X POST https://gen.pollinations.ai/image/a%20beautiful%20sunset \
  -F "image=@reference.jpg" \
  -F "model=flux" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

See [API Documentation](https://api.pollinations.ai) for full details.