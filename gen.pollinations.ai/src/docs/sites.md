## Sites

Free static hosting at `https://<name>.pollinations.app` for Pollinations accounts.

### Publish with polli

```bash
npm install -g @pollinations/cli
polli auth login
npm run build
polli sites deploy ./dist --name my-app   # → https://my-app.pollinations.app
polli sites list
polli sites delete my-app
```

Deploying the same name again replaces the site and uploads only changed files.

### Publish from code or an agent

Send small sites inline, up to 5 MB per request:

```bash
curl -X PUT https://gen.pollinations.ai/account/sites/my-app \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"files": [{"file": "index.html", "data": "<h1>Hello</h1>"}]}'
```

- Binary files take `"encoding": "base64"`. Bigger sites upload in two steps; see the site endpoints under [Account](#tag/account).
- The SDK's `deploySite(name, files)` and the `deploySite` tool of the [Pollinations MCP server](#tag/mcp-servers) send the same request.
- API keys need the `sites` account permission.

### Rules and limits

- A site is a folder of static files with an `index.html`. Unknown paths serve `index.html`, so single-page apps route on the client.
- Names are 3–32 lowercase letters, digits and hyphens. They start with a letter, end with a letter or digit, and cannot contain `--`; a few, such as `www` and `admin`, are reserved. The first deploy claims the name; deleting the site frees it.
- 5 sites per account; 200 MB and 1,000 files per site; 25 MB per file.
- Sites are public: never put an API key in one. To call Pollinations from a site, let visitors sign in with their own Pollen ([Connect User Wallets](#tag/connect-user-wallets)).
