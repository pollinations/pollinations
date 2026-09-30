// Bundling entrypoint for the wisp-js browser client.
//
// The Wasmer SDK's dist/wisp-network.js does:
//   import { client as wisp } from "@mercuryworkshop/wisp-js/client"
// but bundling the wisp-js entrypoint directly produces a default-export UMD
// blob. This wrapper re-exposes the client namespace as the named export the
// SDK expects. (The path is relative because the wisp-js "exports" map only
// exposes the root, ./client, and ./server subpaths.)
import * as client from "../../node_modules/@mercuryworkshop/wisp-js/src/client/index.mjs";

export { client };
