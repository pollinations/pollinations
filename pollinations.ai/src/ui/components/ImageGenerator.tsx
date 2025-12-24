import { useState, useEffect } from "react";
import { generateImage } from "../../services/pollinationsAPI";
import { DEFAULTS } from "../../api.config";

interface ImageGeneratorProps
    extends React.ImgHTMLAttributes<HTMLImageElement> {
    prompt: string;
    width?: number;
    height?: number;
    seed?: number;
    model?: string;
    nologo?: boolean;
    alt?: string;
    className?: string;
}

export function ImageGenerator({
    prompt,
    width = DEFAULTS.IMAGE_WIDTH,
    height = DEFAULTS.IMAGE_HEIGHT,
    seed = DEFAULTS.SEED,
    model = DEFAULTS.IMAGE_MODEL,
    nologo = true,
    alt = "Generated image",
    className = "",
    ...props
}: ImageGeneratorProps) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<any>(null);

    useEffect(() => {
        if (!prompt) return;

        const controller = new AbortController();
        setLoading(true);
        setError(null);

        generateImage(
            prompt,
            { width, height, seed, model, nologo },
            controller.signal
        )
            .then((url) => {
                if (!controller.signal.aborted) {
                    setImageUrl(url);
                }
            })
            .catch((err) => {
                if (err.name !== "AbortError" && !controller.signal.aborted) {
                    setError(err);
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => controller.abort();
    }, [prompt, width, height, seed, model, nologo]);

    if (loading) {
        return (
            <div
                className={`${className} flex items-center justify-center bg-input-background`}
                style={{ width, height }}
                {...props}
            >
                <span className="text-xs text-text-caption">...</span>
            </div>
        );
    }

    if (error || !imageUrl) {
        return (
            <div
                className={`${className} flex items-center justify-center bg-input-background`}
                style={{ width, height }}
                {...props}
            >
                <span className="text-xs text-text-caption">✗</span>
            </div>
        );
    }

    return (
        <img
            src={imageUrl}
            alt={alt}
            width={width}
            height={height}
            className={className}
            {...props}
        />
    );
}
