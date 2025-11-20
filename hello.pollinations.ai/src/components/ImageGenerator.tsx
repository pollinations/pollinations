import { useImageGeneration } from "../hooks/useImageGeneration";
import { API, DEFAULTS } from "../config/api";

interface ImageGeneratorProps extends React.ImgHTMLAttributes<HTMLImageElement> {
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
    const { imageUrl, loading, error } = useImageGeneration({
        prompt,
        width,
        height,
        seed,
        model,
        nologo,
        alt,
    });

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

// Helper function to generate image URL (for use in other contexts)
// Helper function to generate image URL (for use in other contexts)
interface GenerateImageUrlOptions {
    prompt: string;
    width?: number;
    height?: number;
    seed?: number;
    model?: string;
    nologo?: boolean;
}

export function generateImageUrl({
    prompt,
    width = DEFAULTS.IMAGE_WIDTH,
    height = DEFAULTS.IMAGE_HEIGHT,
    seed = DEFAULTS.SEED,
    model = DEFAULTS.IMAGE_MODEL,
    nologo = true,
}: GenerateImageUrlOptions) {
    const baseUrl = `${API.IMAGE_GENERATION}/${encodeURIComponent(prompt)}`;
    const params = new URLSearchParams({
        model: model,
        width: width.toString(),
        height: height.toString(),
        seed: seed.toString(),
        nologo: nologo.toString(),
    });
    return `${baseUrl}?${params.toString()}`;
}
