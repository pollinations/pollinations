// These choices follow Gen's video handlers; capabilities decide reference inputs.
// An unset ratio becomes 1024x1024, which these handlers turn into 1:1.
const SQUARE_WITHOUT_RATIO = new Set([
    "alibaba/happyhorse-1.1",
    "alibaba/wan-2.7",
    "alibaba/wan-3.0",
    "bytedance/seedance-1-pro-fast",
    "heygen/heygen-video-1",
    "kandinskylab/kandinsky-6.0-lite",
    "kwaivgi/kling-v3.0-std",
    "prunaai/p-video",
]);

export function videoOptions(id: string, capabilities: readonly string[]) {
    const ratios = ["16:9", "9:16"];
    // Fixed ratio, or no ratio at all (mirelo adds sound to a source video).
    const noAuto = id === "minimax/minimax-h3" || id === "mirelo/sfx-2.0";
    if (id === "minimax/minimax-h3") ratios.splice(1);
    else if (id === "mirelo/sfx-2.0") ratios.splice(0);
    else if (id === "kwaivgi/kling-v3.0-std" || id === "alibaba/wan-2.2-fast")
        ratios.push("1:1");
    else if (
        id.startsWith("x-ai/") ||
        id === "alibaba/wan-2.7" ||
        id === "alibaba/wan-3.0" ||
        id === "kandinskylab/kandinsky-6.0-lite" ||
        id === "prunaai/p-video"
    )
        ratios.push("1:1", "4:3", "3:4");
    else if (
        id.startsWith("minimax/") ||
        id.startsWith("bytedance/") ||
        id.startsWith("heygen/") ||
        id === "alibaba/happyhorse-1.1" ||
        id === "black-forest-labs/flux-3-max"
    ) {
        ratios.push("1:1", "4:3", "3:4", "21:9");
        if (id === "alibaba/happyhorse-1.1") ratios.push("9:21");
    }
    const optionalSound =
        id.startsWith("google/veo-") ||
        id.startsWith("bytedance/seedance-2.") ||
        id === "alibaba/wan-3.0" ||
        id === "black-forest-labs/flux-3-max" ||
        id === "kandinskylab/kandinsky-6.0-lite" ||
        // Gen's Kling handler only adds audio when audio=true is sent.
        id === "kwaivgi/kling-v3.0-std";
    const list = noAuto ? ratios : ["", ...ratios];
    return {
        ratios: list,
        defaultRatio:
            SQUARE_WITHOUT_RATIO.has(id) || id.startsWith("x-ai/")
                ? "16:9"
                : (list[0] ?? ""),
        sound: optionalSound
            ? "optional"
            : capabilities.includes("audio_output")
              ? "on"
              : "off",
        // Kling bills audio extra, so Play leaves it off.
        defaultSound:
            !id.startsWith("google/veo-") && id !== "kwaivgi/kling-v3.0-std",
        exclusiveReferences:
            id === "alibaba/wan-2.7" ||
            id === "alibaba/wan-3.0" ||
            id === "minimax/minimax-h3-max",
    } as const;
}
