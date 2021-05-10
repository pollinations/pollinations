import Debug from "debug";
import { memo } from "react";
const debug = Debug("memoryUsage")

export default () => {

    const formatMemoryUsage = (data) => `${Math.round(data / 1024 / 1024 * 100) / 100} MB`

    const memoryData = process.memoryUsage()
    debug("rss",`${formatMemoryUsage(memoryData.rss)} -> Resident Set Size - total memory allocated for the process execution`);
    debug("heapTotal", `${formatMemoryUsage(memoryData.heapTotal)} -> total size of the allocated heap`);
    debug("heapUsed", `${formatMemoryUsage(memoryData.heapUsed)} -> actual memory used during the execution`);
    debug("external", `${formatMemoryUsage(memoryData.external)} -> V8 external memory`);

}

