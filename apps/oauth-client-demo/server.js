import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const port = 8789;
const page = await readFile(new URL("./index.html", import.meta.url));

createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(page);
}).listen(port, () => {
    console.log(`OAuth demo: http://localhost:${port}`);
});
