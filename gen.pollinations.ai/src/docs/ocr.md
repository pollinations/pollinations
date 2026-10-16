## OCR

Extract structured content from documents and images. Returns Markdown with layout and bounding boxes for embedded images.

`POST /alpha/ocr` is experimental: the request and response currently follow Mistral's OCR API, but the path and shape may change without a version bump.

| Endpoint | Description |
|----------|-------------|
| `POST /alpha/ocr` | Document in, structured Markdown out |

**Input:** Pass a document via `document_url` (PDF or image URL) or `image_url` (base64 data URL). `document_url` must be a public https URL that the upstream provider fetches; private hosts and embedded credentials are rejected. Every request re-reads the document — an OCR response is stored only for the request that produced it and is never served to a later request. Set `include_image_base64: true` to embed extracted images as base64 in `pages[].images[].image_base64`. Use `pages` to restrict processing to specific 0-based page indices.

**Output:** `pages[]` carries the page `index`, `markdown`, detected `images` (with `top_left_x/y` and `bottom_right_x/y` bounding boxes), and `dimensions`. `usage_info` reports `pages_processed` and `doc_size_bytes`.

**Billing:** $0.004 per page reported in `usage_info.pages_processed`. The returned Markdown is included in that per-page price and is not billed separately.

**OCR models:** {{OCR_MODELS}}

```bash
curl -X POST "https://gen.pollinations.ai/alpha/ocr" \
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
