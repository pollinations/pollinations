import { motion } from "motion/react";
import { useEffect, useState } from "react";

interface SceneAreaProps {
    imageUrl: string;
}

export function SceneArea({ imageUrl }: SceneAreaProps) {
    const [imageError, setImageError] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);

    // Reset loading state when imageUrl changes
    useEffect(() => {
        setImageLoaded(false);
        setImageError(false);
    }, []);

    const displayImageUrl = imageError ? "" : imageUrl || "";

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="relative rounded-lg overflow-hidden border-4 border-[#d4a76a] shadow-2xl"
        >
            {/* Hidden img element for error handling */}
            {imageUrl && (
                <img
                    src={imageUrl}
                    alt=""
                    style={{ display: "none" }}
                    onLoad={() => {
                        setImageLoaded(true);
                        setImageError(false);
                    }}
                    onError={() => {
                        console.warn("Scene image failed to load:", imageUrl);
                        setImageError(true);
                        setImageLoaded(true);
                    }}
                />
            )}

            <div
                className="h-72 md:h-[28rem] bg-cover bg-center relative transition-all duration-700"
                style={{
                    backgroundImage: displayImageUrl
                        ? `url(${displayImageUrl})`
                        : undefined,
                }}
            >
                {/* Loading indicator */}
                {!imageLoaded && (
                    <div className="absolute inset-0 bg-[#2c1e12] flex items-center justify-center">
                        <div className="text-[#d4a76a] text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#d4a76a] mx-auto mb-2" />
                            <p className="text-sm">Loading scene...</p>
                        </div>
                    </div>
                )}

                {/* Error state */}
                {imageError && imageLoaded && (
                    <div className="absolute inset-0 bg-[#2c1e12] flex items-center justify-center">
                        <p className="text-[#b8a389] text-sm italic">
                            The scene shimmers but refuses to materialize...
                        </p>
                    </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-[#2c1e12]/60 via-transparent to-transparent" />
            </div>
        </motion.div>
    );
}
