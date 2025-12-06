import { motion } from "motion/react";
import { useState } from "react";

interface SceneAreaProps {
    imageUrl: string;
    text: string;
}

export function SceneArea({ imageUrl, text }: SceneAreaProps) {
    const [imageError, setImageError] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);

    // Fallback image URL for when main image fails
    const fallbackImageUrl = "/api/image/prompt/fantasy%20rpg%20medieval%20castle%20atmospheric%20digital%20art?width=1024&height=768&model=flux&seed=fallback";

    const displayImageUrl = imageError ? fallbackImageUrl : (imageUrl || fallbackImageUrl);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="relative rounded-lg overflow-hidden border-4 border-[#d4a76a] shadow-2xl"
        >
            {/* Hidden img element for error handling */}
            <img
                src={imageUrl}
                alt=""
                style={{ display: 'none' }}
                onLoad={() => {
                    setImageLoaded(true);
                    setImageError(false);
                }}
                onError={() => {
                    console.warn('Scene image failed to load:', imageUrl);
                    setImageError(true);
                    setImageLoaded(true);
                }}
            />

            <div
                className="h-64 md:h-96 bg-cover bg-center relative"
                style={{ backgroundImage: `url(${displayImageUrl})` }}
            >
                {/* Loading indicator */}
                {!imageLoaded && (
                    <div className="absolute inset-0 bg-[#2c1e12] flex items-center justify-center">
                        <div className="text-[#d4a76a] text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#d4a76a] mx-auto mb-2"></div>
                            <p className="text-sm">Loading scene...</p>
                        </div>
                    </div>
                )}

                {/* Error indicator */}
                {imageError && imageLoaded && (
                    <div className="absolute top-2 right-2 bg-yellow-600/80 text-white px-2 py-1 rounded text-xs">
                        Using fallback image
                    </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
            </div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#2c1e12] to-transparent"
            >
                <div className="bg-[#3a2817]/95 rounded p-4 border border-[#d4a76a]/50 backdrop-blur-sm max-h-40 overflow-y-auto">
                    <p className="text-[#f5e6d3] leading-relaxed whitespace-pre-wrap">{text}</p>
                </div>
            </motion.div>
        </motion.div>
    );
}
