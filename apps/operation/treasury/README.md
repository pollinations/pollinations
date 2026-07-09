# Treasury

Treasury is the raw operations viewer for OP data.

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

Data contracts live in [`tinybird/README.md`](./tinybird/README.md).

Current planning:

- [`tinybird/`](./tinybird/) — current OP Tinybird datasource and pipe definitions.

Audit/support notes:

- `AUDIT-OVH-REGIME-2026-07-08.md`
- `MANUAL-DASHBOARD-USAGE-AUDIT.md`

Historical superseded plans live in `archive/`.
