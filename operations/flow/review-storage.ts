import type { StorageAdapter } from "@pollinations/sdk/react";

// The SDK still owns its session format and lifecycle. This adapter confines
// the example app to this review tab and lets Restart discard only its copy.
const prefix = "flow:example:";
export const exampleStorage: StorageAdapter = {
    getItem: (key) => sessionStorage.getItem(prefix + key),
    setItem: (key, value) => sessionStorage.setItem(prefix + key, value),
    removeItem: (key) => sessionStorage.removeItem(prefix + key),
};
export function clearExampleStorage() {
    for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith(prefix)) sessionStorage.removeItem(key);
    }
}
