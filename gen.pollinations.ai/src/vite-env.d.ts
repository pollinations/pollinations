declare module "*.md?raw" {
    const content: string;
    export default content;
}

declare module "*.svg?raw" {
    const content: string;
    export default content;
}

declare module "*.css?raw" {
    const content: string;
    export default content;
}

declare module "*.wasm" {
    const wasmModule: {
        readonly default: WebAssembly.Module;
        readonly [key: string]:
            | CallableFunction
            | WebAssembly.Module
            | undefined;
    };
    export = wasmModule;
}
