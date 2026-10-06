import { createWorker } from "./worker.js";

export default createWorker({ fetchImpl: fetch });
