import { createImagePrompt } from "./prompt";
import type { ComicImageOptions } from "./types";

const DEFAULT_ENDPOINT = "https://gen.pollinations.ai/image";
const ORIGINAL_CATGPT =
  "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/apps/catgpt/images/original-catgpt.png";
const SELFIE_CATGPT = "https://media.pollinations.ai/a84b58d293d69f35";

export function buildComicImageUrl(
  question: string,
  reply: string,
  uploadedImageUrl: string | null = null,
  opts: ComicImageOptions = {},
): string {
  const prompt = createImagePrompt(question, reply, !!uploadedImageUrl);
  const params = new URLSearchParams({
    height: String(opts.height ?? 1024),
    width: String(opts.width ?? 1024),
    model: opts.imageModel ?? "nanobanana",
  });
  if (opts.apiKey) params.set("key", opts.apiKey);

  if (uploadedImageUrl) {
    params.set("enhance", "false");
    params.set("image", `${uploadedImageUrl},${SELFIE_CATGPT}`);
  } else {
    params.set("enhance", "true");
    params.set("image", ORIGINAL_CATGPT);
  }

  const base = opts.endpoint ?? DEFAULT_ENDPOINT;
  return `${base}/${encodeURIComponent(prompt)}?${params}`;
}

export async function pickImageModel(
  apiKey: string | undefined,
  endpoint = "https://gen.pollinations.ai/image/models",
): Promise<{ model: "nanobanana" | "gptimage"; isPremium: boolean }> {
  try {
    const res = await fetch(endpoint, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (!res.ok) return { model: "gptimage", isPremium: false };
    const models = (await res.json()) as Array<{ name: string }>;
    const names = models.map((m) => m.name);
    if (names.includes("nanobanana")) {
      return { model: "nanobanana", isPremium: true };
    }
    return { model: "gptimage", isPremium: false };
  } catch {
    return { model: "gptimage", isPremium: false };
  }
}
