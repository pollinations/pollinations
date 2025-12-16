import Debug from "debug";
import throttle from "lodash.throttle";

const debug = Debug("memoryUsage");

export default throttle(() => {
    const formatMemoryUsage = (data) =>
        `${Math.round((data / 1024 / 1024) * 100) / 100} MB`;

    // More explicit Node.js environment check
    const memoryData = (typeof process !== 'undefined' && 
                       typeof process.memoryUsage === 'function' && 
                       process.versions?.node) ? process.memoryUsage() : undefined;
    debug(
        "rss",
        `${formatMemoryUsage(memoryData?.rss)} -> total memory allocated for the process execution`,
    );
    debug(
        "heapTotal",
        `${formatMemoryUsage(memoryData?.heapTotal)} -> total size of the allocated heap`,
    );
    debug(
        "heapUsed",
        `${formatMemoryUsage(memoryData?.heapUsed)} -> actual memory used during the execution`,
    );
    debug(
        "external",
        `${formatMemoryUsage(memoryData?.external)} -> V8 external memory`,
    );
}, 30000);
