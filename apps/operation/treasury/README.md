# Treasury

Treasury is the raw operations viewer and editor for Forager data.

Run locally from the web package:

```bash
npm run dev
```

The dev server is pinned to `127.0.0.1:4180`.

Use fixtures mode for UI development without password or Tinybird access:

```text
http://127.0.0.1:4180/?fixtures=1
```

Live mode uses a password gate. Tinybird read/write tokens live only in
`secrets/web.json` and are used by the Vite server-side proxy, never by the
browser bundle.

Data contracts live in `../forager/tinybird/README.md`.
