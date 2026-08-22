import { getContainer } from "@cloudflare/containers";
import { PythonContainer } from "./container.js";
import { createWorker } from "./worker.js";

export { PythonContainer };

export default createWorker({ getContainerImpl: getContainer });
