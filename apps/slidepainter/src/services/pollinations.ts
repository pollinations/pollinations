// Pollinations API Service

import type { ImageGenerationResponse, PollinationsRequest } from "./types";

const POLLINATIONS_API_BASE = "https://gen.pollinations.ai";
const MEDIA_API_BASE = "https://media.pollinations.ai";
const DEFAULT_CONFIG = {
    model: "gptimage" as const,
    enhance: true,
    nologo: true,
};

export class PollinationsService {
    private token: string | null = null;

    setToken(token: string | null): void {
        this.token = token;
    }

    async generateImageFromPrompt(
        sectionPrompt: string,
        projectPrompt?: string,
        options?: Partial<PollinationsRequest>,
        inputImageUrl?: string,
    ): Promise<ImageGenerationResponse> {
        try {
            const finalPrompt = projectPrompt
                ? `${projectPrompt}\n\n${sectionPrompt}`
                : sectionPrompt;

            if (!options?.width || !options?.height) {
                throw new Error(
                    "Width and height must be specified for image generation",
                );
            }

            const seed = options.seed ?? Math.floor(Math.random() * 1000000);
            const payload: PollinationsRequest = {
                prompt: finalPrompt,
                model: options?.model || DEFAULT_CONFIG.model,
                width: options.width,
                height: options.height,
                enhance: options?.enhance ?? DEFAULT_CONFIG.enhance,
                nologo: options?.nologo ?? DEFAULT_CONFIG.nologo,
                seed,
                ...(inputImageUrl && { imageUrl: inputImageUrl }),
            };

            // Build GET URL: https://gen.pollinations.ai/image/{prompt}
            const encodedPrompt = encodeURIComponent(payload.prompt);
            const url = new URL(
                `${POLLINATIONS_API_BASE}/image/${encodedPrompt}`,
            );

            url.searchParams.set(
                "model",
                payload.model || DEFAULT_CONFIG.model,
            );
            url.searchParams.set("width", payload.width.toString());
            url.searchParams.set("height", payload.height.toString());
            url.searchParams.set(
                "enhance",
                (payload.enhance ?? DEFAULT_CONFIG.enhance).toString(),
            );
            url.searchParams.set(
                "nologo",
                (payload.nologo ?? DEFAULT_CONFIG.nologo).toString(),
            );
            url.searchParams.set("seed", seed.toString());

            if (payload.imageUrl && this.isValidUrl(payload.imageUrl)) {
                url.searchParams.set("imageUrl", payload.imageUrl);
            }

            const token = this.getToken();

            // Publishable keys (pk_) use query param, Secret keys (sk_) use Authorization header
            const headers: HeadersInit = {};
            if (token) {
                if (token.startsWith("pk_")) {
                    url.searchParams.set("key", token);
                } else {
                    headers["Authorization"] = `Bearer ${token}`;
                }
            }

            const response = await fetch(url.toString(), {
                method: "GET",
                headers,
                signal: AbortSignal.timeout(300000), // 5 minute timeout
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(
                    `API error: ${response.status} ${response.statusText}`,
                    errorText,
                );

                if (response.status === 500) {
                    throw new Error(
                        `Backend overloaded (500) - Wait a few seconds and try again`,
                    );
                } else if (response.status === 401) {
                    throw new Error(
                        `Authentication failed (401) - Check your API key`,
                    );
                } else if (response.status === 403) {
                    throw new Error(
                        `Insufficient pollen balance (403) - Check https://enter.pollinations.ai`,
                    );
                } else {
                    throw new Error(
                        `Pollinations API error: ${response.status} ${response.statusText}`,
                    );
                }
            }

            const generatedUrl = url.toString();
            const mediaUrl = token
                ? await this.uploadGeneratedImage(await response.blob(), {
                      prompt: finalPrompt,
                      model: payload.model || DEFAULT_CONFIG.model,
                      parents: inputImageUrl ? [inputImageUrl] : [],
                  })
                : null;

            const result: ImageGenerationResponse = {
                url: mediaUrl || generatedUrl,
                provider: "pollinations",
                seed,
                cached: false,
            };

            return result;
        } catch (error) {
            console.error("Pollinations generation failed:", error);
            throw error;
        }
    }

    private isValidUrl(urlString: string): boolean {
        try {
            const url = new URL(urlString);
            return url.protocol === "http:" || url.protocol === "https:";
        } catch {
            return false;
        }
    }

    private getToken(): string | null {
        return (
            this.token ||
            import.meta.env.VITE_POLLINATIONS_AI_TOKEN_2 ||
            import.meta.env.VITE_POLLINATIONS_AI_TOKEN ||
            null
        );
    }

    private appendCatalogFields(
        form: FormData,
        fields: {
            prompt: string;
            model: string;
            parents: string[];
        },
    ): void {
        form.append("visibility", "private");
        form.append(
            "source",
            fields.parents.length > 0 ? "edit" : "generation",
        );
        form.append("tags", JSON.stringify(["slidepainter", "slide"]));
        form.append("prompt", fields.prompt);
        form.append("model", fields.model);
        if (fields.parents.length > 0) {
            form.append("parents", JSON.stringify(fields.parents));
        }
    }

    private async uploadGeneratedImage(
        blob: Blob,
        fields: {
            prompt: string;
            model: string;
            parents: string[];
        },
    ): Promise<string | null> {
        const token = this.getToken();
        if (!token) return null;

        try {
            const form = new FormData();
            form.append("file", blob, `slidepainter-${Date.now()}.png`);
            this.appendCatalogFields(form, fields);

            const uploadResponse = await fetch(`${MEDIA_API_BASE}/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: form,
                signal: AbortSignal.timeout(60000),
            });
            if (!uploadResponse.ok) return null;

            const data = (await uploadResponse.json()) as {
                id?: string;
                url?: string;
            };
            return (
                data.url || (data.id ? `${MEDIA_API_BASE}/${data.id}` : null)
            );
        } catch (error) {
            console.warn("SlidePainter media catalog upload failed:", error);
            return null;
        }
    }
}
