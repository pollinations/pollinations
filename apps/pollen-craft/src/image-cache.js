const DEFAULT_MAX_ENTRIES = 24;
const DEFAULT_MAX_BYTES = 48 * 1024 * 1024;

export function createImageCache({
    maxEntries = DEFAULT_MAX_ENTRIES,
    maxBytes = DEFAULT_MAX_BYTES,
    createObjectURL = globalThis.URL?.createObjectURL?.bind(globalThis.URL),
    revokeObjectURL = globalThis.URL?.revokeObjectURL?.bind(globalThis.URL),
    onEvict = null,
} = {}) {
    const entries = new Map();
    let totalBytes = 0;

    function remove(key, reason) {
        const entry = entries.get(key);
        if (!entry) return false;
        entries.delete(key);
        totalBytes -= entry.size;
        try {
            onEvict?.(key, entry, reason);
        } finally {
            revokeObjectURL?.(entry.url);
        }
        return true;
    }

    function set(key, value, size = value?.size) {
        if (typeof key !== "string" || !key)
            throw new TypeError("A cache key is required.");
        const url =
            typeof value === "string" ? value : createObjectURL?.(value);
        const entrySize = Number.isFinite(size) ? Math.max(0, size) : 0;
        if (!url) throw new TypeError("An image URL could not be created.");
        if (entries.has(key)) remove(key, "replace");
        entries.set(key, { url, size: entrySize });
        totalBytes += entrySize;
        while (entries.size > maxEntries || totalBytes > maxBytes) {
            const oldestKey = entries.keys().next().value;
            remove(oldestKey, "evict");
        }
        return url;
    }

    function get(key) {
        const entry = entries.get(key);
        if (!entry) return null;
        entries.delete(key);
        entries.set(key, entry);
        return entry;
    }

    function peek(key) {
        return entries.get(key) ?? null;
    }

    function clear() {
        for (const key of [...entries.keys()]) remove(key, "clear");
    }

    return {
        get,
        peek,
        set,
        delete: (key) => remove(key, "delete"),
        clear,
        has: (key) => entries.has(key),
        get size() {
            return entries.size;
        },
        get bytes() {
            return totalBytes;
        },
    };
}
