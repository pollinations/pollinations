## OCR

Extract structured content from documents and images with a Mistral OCR-compatible API. Returns Markdown with layout and bounding boxes for embedded images.

| Endpoint | Description |
|----------|-------------|
| `POST /v1/ocr` | Mistral-style OCR: document in, structured Markdown out |

**Input:** Pass a document via `document_url` (PDF or image URL) or `image_url` (base64 data URL). Set `include_image_base64: true` to embed extracted images as base64 in `pages[].images[].image_base64`. Use `pages` to restrict processing to specific 0-based page indices.

**Output:** `pages[]` carries the page `index`, `markdown`, detected `images` (with `top_left_x/y` and `bottom_right_x/y` bounding boxes), and `dimensions`. `usage_info` reports `pages_processed` and `doc_size_bytes`.

**Billing:** Input is billed per processed page (image-input tokens); the returned Markdown is billed as completion text tokens.

**OCR models:** {{OCR_MODELS}}

```bash
curl -X POST "https://gen.pollinations.ai/v1/ocr" \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mistral-ocr",
    "document": {
      "type": "document_url",
      "document_url": "https://example.com/invoice.pdf"
    },
    "include_image_base64": false
  }'
```
