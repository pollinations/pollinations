// These choices follow Gen's video handlers; capabilities decide reference inputs.
export function videoOptions(id: string, capabilities: readonly string[]) {
    const ratios = ["16:9", "9:16"];
    if (id === "minimax/minimax-h3") ratios.splice(1);
    else if (id.startsWith("x-ai/")) ratios.push("1:1", "4:3", "3:4");
    else if (
        id.startsWith("minimax/") ||
        id.startsWith("bytedance/") ||
        id.startsWith("heygen/") ||
        id === "alibaba/happyhorse-1.1"
    ) {
        ratios.push("1:1", "4:3", "3:4", "21:9");
        if (
            id === "alibaba/happyhorse-1.1" ||
            id === "bytedance/seedance-1-pro-fast"
        )
            ratios.push("9:21");
    } else if (id === "alibaba/wan-2.7" || id === "alibaba/wan-3.0")
        ratios.push("1:1", "4:3", "3:4");
    const optionalSound =
        id.startsWith("google/veo-") ||
        id.startsWith("bytedance/seedance-2.") ||
        id === "alibaba/wan-3.0";
    return {
        ratios: id === "minimax/minimax-h3" ? ratios : ["", ...ratios],
        sound: optionalSound
            ? "optional"
            : capabilities.includes("audio_output")
              ? "on"
              : "off",
        defaultSound: !id.startsWith("google/veo-"),
        exclusiveReferences:
            id === "alibaba/wan-2.7" ||
            id === "alibaba/wan-3.0" ||
            id === "minimax/minimax-h3-max",
    } as const;
}

export function reproducibleApiUrl(url: string) {
    const request = new URL(url);
    request.searchParams.set("key", "YOUR_API_KEY");
    return request.toString();
}
