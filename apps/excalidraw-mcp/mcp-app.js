// The view that server.ts serves for create_view: upstream's widget, built by
// esm.sh from the same pinned commit instead of upstream's Vite dist/ file.
const UPSTREAM =
    "excalidraw/excalidraw-mcp@157aa23ceb1976008aadc89eb05e3444060f09d6";

// "*" keeps the widget's imports bare, so this import map pins them to the
// versions in upstream's lockfile, except zod: esm.sh's build of zod 4.3's
// "zod/v4" entry drops the named exports the SDK imports, while 4.2.1's keeps
// them.
export const MCP_APP_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Excalidraw</title>
<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@19.0.0",
    "react/jsx-runtime": "https://esm.sh/react@19.0.0/jsx-runtime",
    "react-dom": "https://esm.sh/react-dom@19.0.0?deps=react@19.0.0",
    "react-dom/client": "https://esm.sh/react-dom@19.0.0/client?deps=react@19.0.0",
    "@excalidraw/excalidraw": "https://esm.sh/@excalidraw/excalidraw@0.18.0?deps=react@19.0.0,react-dom@19.0.0",
    "@modelcontextprotocol/ext-apps/react": "https://esm.sh/@modelcontextprotocol/ext-apps@0.4.2/react?deps=react@19.0.0,react-dom@19.0.0,@modelcontextprotocol/sdk@1.25.2,zod@4.2.1",
    "morphdom": "https://esm.sh/morphdom@2.7.8"
  }
}
</script>
<link rel="stylesheet" href="https://esm.sh/gh/${UPSTREAM}/src/global.css">
</head>
<body>
<script type="module" src="https://esm.sh/*gh/${UPSTREAM}/src/mcp-entry.tsx"></script>
</body>
</html>
`;
