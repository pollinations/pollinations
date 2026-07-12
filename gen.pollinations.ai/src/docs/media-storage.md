## Media Storage

Content-addressed media storage. Upload and retrieve images, audio, and video by content hash.

Base URL: https://media.pollinations.ai

| Endpoint | Description |
|----------|-------------|
| `POST /upload` | Upload a file, receive a content-addressed URL |
| `GET /{hash}` | Retrieve a previously uploaded file |
| `GET /{hash}/metadata` | Get file metadata as JSON |

Upload requires API key; retrieval is public.

```bash
curl -X POST "https://media.pollinations.ai/upload" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F file=@path/to/image.png
```
