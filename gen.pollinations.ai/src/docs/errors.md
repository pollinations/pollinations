## Errors

All errors return JSON with a consistent shape:

```json
{
  "status": 400,
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Description of what went wrong"
  }
}
```

| Status | Meaning |
|--------|---------|
| `400` | Invalid parameters or malformed request |
| `401` | Missing or invalid API key |
| `402` | Insufficient pollen balance |
| `403` | API key lacks required permission |
| `500` | Internal server error |
