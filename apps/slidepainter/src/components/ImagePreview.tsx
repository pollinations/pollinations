import type React from 'react';

interface ImagePreviewProps {
  imageUrl: string | null;
  isGenerating: boolean;
  error?: string | null;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({
  imageUrl,
  isGenerating,
  error,
}) => {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex items-center justify-center min-h-0">
        {isGenerating ? (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4" />
            <p className="text-gray-400 text-sm">Generating image...</p>
          </div>
        ) : error ? (
          <div className="text-center max-w-md px-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt="Generated slide"
            className="max-w-full max-h-full object-contain"
            loading="lazy"
          />
        ) : (
          <p className="text-sm text-gray-500 opacity-60">No image</p>
        )}
      </div>
    </div>
  );
};

export default ImagePreview;
