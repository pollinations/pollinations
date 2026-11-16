import { z } from "zod";
import { fetchJson } from "../fetch.js";

// Compact public Hub facts from kreggscode's #17987, with errors left as tool errors.
const repoId = z
    .string()
    .min(1)
    .max(160)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)?$/);
const summary = (data) => ({
    id: data.id,
    task: data.pipeline_tag,
    downloads: data.downloads,
    likes: data.likes,
});
async function info(kind, id) {
    const data = await fetchJson(
        `https://huggingface.co/api/${kind}/${id.split("/").map(encodeURIComponent).join("/")}`,
    );
    return {
        ...summary(data),
        library: data.library_name,
        sdk: data.sdk,
        license:
            data.cardData?.license ??
            data.tags?.find((t) => t.startsWith("license:"))?.slice(8),
        licenseName: data.cardData?.license_name,
        licenseLink: data.cardData?.license_link,
        parameters: data.safetensors?.total,
        title: data.cardData?.title,
        lastModified: data.lastModified,
        gated: data.gated,
        disabled: data.disabled,
        stage: data.runtime?.stage,
        tags: data.tags?.slice(0, 20),
        tagsTruncated: (data.tags?.length ?? 0) > 20,
        url: `https://huggingface.co/${kind === "spaces" ? "spaces/" : ""}${id}`,
    };
}
export const hfTools = [
    [
        "hf_search_models",
        "Search public Hugging Face models by keyword and optional pipeline task, ordered by downloads. Returns at most 25 matches, not an exhaustive list. No model download or execution.",
        {
            query: z.string().trim().min(1).max(200),
            task: z.string().trim().min(1).max(64).optional(),
            limit: z.number().int().min(1).max(25).default(10),
        },
        async ({ query, task, limit }) => {
            const url = new URL("https://huggingface.co/api/models");
            url.search = new URLSearchParams({
                search: query,
                limit: String(limit),
                sort: "downloads",
                direction: "-1",
            });
            if (task) url.searchParams.set("pipeline_tag", task);
            const data = await fetchJson(url);
            if (!Array.isArray(data))
                throw new Error("Invalid Hugging Face search response");
            return { models: data.slice(0, limit).map(summary) };
        },
    ],
    [
        "hf_model_info",
        "Inspect public Hugging Face model metadata: task, library, license, parameter count, usage counts and up to 20 tags. Gated metadata is not permission to download a model.",
        { id: repoId },
        ({ id }) => info("models", id),
    ],
    [
        "hf_space_info",
        "Inspect a public Hugging Face Space's SDK, runtime stage and up to 20 tags. Does not start or execute the Space.",
        { id: repoId },
        ({ id }) => info("spaces", id),
    ],
];
