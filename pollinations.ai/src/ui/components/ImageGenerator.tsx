import { useEffect, useState } from "react";
import { DEFAULTS } from "../../api.config";
import { useAuth } from "../../hooks/useAuth";
import { generateImage } from "../../services/pollinationsAPI";

interface ImageGeneratorProps
    extends React.ImgHTMLAttributes<HTMLImageElement> {
    prompt: string;
    width?: number;
    height?: number;
    seed?: number;
    model?: string;
    alt?: string;
    className?: string;
}

export function ImageGenerator({
    prompt,
    width = DEFAULTS.IMAGE_WIDTH,
    height = DEFAULTS.IMAGE_HEIGHT,
    seed = DEFAULTS.SEED,
    model = DEFAULTS.IMAGE_MODEL,
    alt = "Generated image",
    className = "",
    ...props
}: ImageGeneratorProps) {
    const { apiKey } = useAuth();
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!prompt) return;

        let objectUrl: string | null = null;
        setLoading(true);
        setError(null);

        generateImage(prompt, { width, height, seed, model, apiKey })
            .then((url) => {
                objectUrl = url;
                setImageUrl(url);
            })
            .catch(setError)
            .finally(() => setLoading(false));

        return () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [prompt, width, height, seed, model, apiKey]);

    if (loading) {
        return (
            <div
                className={`${className} flex items-center justify-center bg-white`}
                style={{ width, height }}
                {...props}
            >
                <span className="text-xs text-subtle">...</span>
            </div>
        );
    }

    if (error || !imageUrl) {
        return (
            <div
                className={`${className} flex items-center justify-center bg-white`}
                style={{ width, height }}
                {...props}
            >
                <span className="text-xs text-subtle">✗</span>
            </div>
        );
    }

    return (
        <img
            src={imageUrl}
            alt={alt}
            width={width}
            height={height}
            loading="lazy"
            className={className}
            {...props}
        />
    );
}
