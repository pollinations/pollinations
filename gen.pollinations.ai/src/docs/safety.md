## Safety

Optional safety checking runs on text input before generation. Omitted, `false`, or `0` means off.

Use `safe` as a query parameter or JSON body field, or send the same value in the `Pollinations-Safe` header.

Values: `privacy` redacts personal information like names, email, phone, address, IP, URLs, and usernames. `secrets` redacts keys and passwords. `sexual`, `violence`, and `shield` block matching requests. Aliases: `true` = `privacy,secrets`, `nsfw` = `sexual,violence`.

```bash
curl "https://gen.pollinations.ai/text/email%20me%20at%20a%40example.com?safe=privacy" \
  -H "Authorization: Bearer YOUR_API_KEY"

curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Pollinations-Safe: privacy" \
  -d '{"model":"openai","messages":[{"role":"user","content":"email me at a@example.com"}]}'
```

Large requests check the latest 50,000 text characters, across up to 25 text parts, in one safety call.

Blocked requests return `400` with `error.type: "safety_error"`. Safety service failures return `503`. Check `X-Safety-Applied`, `X-Safety-Redacted`, and `X-Safety-Status` headers.
