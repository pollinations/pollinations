// AbortController polyfill for Node.js versions < 16
export async function setupAbortControllerPolyfill() {
    const nodeVersion = process.versions.node;
    const majorVersion = parseInt(nodeVersion.split(".")[0], 10);

    // Show version info
    console.error(`Running on Node.js version: ${nodeVersion}`);

    // Add AbortController polyfill for Node.js versions < 16
    if (majorVersion < 16) {
        // Check if AbortController is already defined globally
        if (typeof global.AbortController === "undefined") {
            console.error("Adding AbortController polyfill for Node.js < 16");
            try {
                // Try to dynamically import a polyfill
                // First attempt to use node-abort-controller if it's installed
                try {
                    const { AbortController: AbortControllerPolyfill } =
                        await import("node-abort-controller");
                    global.AbortController = AbortControllerPolyfill;
                } catch (importError) {
                    // Create a basic implementation if the import fails
                    console.error("Using basic AbortController polyfill");

                    class AbortSignal {
                        constructor() {
                            this.aborted = false;
                            this.onabort = null;
                            this._eventListeners = {};
                        }

                        addEventListener(type, listener) {
                            if (!this._eventListeners[type]) {
                                this._eventListeners[type] = [];
                            }
                            this._eventListeners[type].push(listener);
                        }

                        removeEventListener(type, listener) {
                            if (!this._eventListeners[type]) return;
                            this._eventListeners[type] = this._eventListeners[
                                type
                            ].filter((l) => l !== listener);
                        }

                        dispatchEvent(event) {
                            if (event.type === "abort" && this.onabort) {
                                this.onabort(event);
                            }

                            if (this._eventListeners[event.type]) {
                                this._eventListeners[event.type].forEach(
                                    (listener) => listener(event),
                                );
                            }
                        }
                    }

                    global.AbortController = class AbortController {
                        constructor() {
                            this.signal = new AbortSignal();
                        }

                        abort() {
                            if (this.signal.aborted) return;
                            this.signal.aborted = true;
                            const event = { type: "abort" };
                            this.signal.dispatchEvent(event);
                        }
                    };
                }
            } catch (error) {
                console.error("Failed to add AbortController polyfill:", error);
                console.error(
                    "This package requires Node.js >= 16. Please upgrade your Node.js version.",
                );
                process.exit(1);
            }
        }
    }
}
