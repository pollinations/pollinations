import { getSandbox, Sandbox } from "@cloudflare/sandbox";
import { createWorker } from "./worker.js";

export { Sandbox };

export default createWorker({ getSandboxImpl: getSandbox });
