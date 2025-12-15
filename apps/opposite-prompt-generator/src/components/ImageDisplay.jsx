import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function ImageDisplay({ imageUrl, loading }) {
  const [src, setSrc] = useState(imageUrl);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setSrc(imageUrl);
    setImgError(false);
  }, [imageUrl]);

  const handleOpen = () => {
    if (!src) return;
    window.open(src, "_blank", "noopener,noreferrer");
  };

  const handleCopyUrl = async () => {
    if (!src) return;
    try {
      await navigator.clipboard.writeText(src);
      toast.success("Image URL copied");
    } catch (err) {
      console.error("Copy URL failed:", err);
      toast.error("Failed to copy URL");
    }
  };

  const handleDownload = async () => {
    if (!src) return;
    try {
      const res = await fetch(src, { mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "opposite-image.jpg";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Download started");
    } catch (err) {
      console.error("Download failed:", err);
      toast.error("Failed to download image");
    }
  };

  const handleRetry = () => {
    if (!imageUrl) return;
    const bust = (imageUrl.includes("?") ? "&" : "?") + "t=" + Date.now();
    setSrc(imageUrl + bust);
    setImgError(false);
  };

  return (
    <div className="mt-8 flex flex-col items-center w-full">
      <h2 className="text-xl font-bold mb-4 text-purple-200">🖼️ Generated Image</h2>

      {loading ? (
        <div className="relative w-80 h-80 rounded-2xl border-2 border-dashed border-white/20 bg-white/10 backdrop-blur-sm overflow-hidden">
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/10 via-white/5 to-transparent" />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-purple-200/90 text-sm">
            Generating image...
          </div>
        </div>
      ) : src && !imgError ? (
        <div className="relative group">
          <img
            src={src}
            alt="Generated opposite of your prompt"
            className="w-80 h-80 object-cover rounded-2xl shadow-2xl border border-white/30 transition-all duration-300"
            onError={() => {
              setImgError(true);
              toast.error("Image failed to load");
            }}
          />
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <button
              type="button"
              onClick={handleOpen}
              className="pointer-events-auto inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-white/10 hover:bg-white/15 border border-white/20"
              aria-label="Open image in new tab"
              title="Open"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M14 5h5v5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 14 19 5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 19h14v-8" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              Open
            </button>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="pointer-events-auto inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-white/10 hover:bg-white/15 border border-white/20"
              aria-label="Copy image URL"
              title="Copy URL"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 9h9v12H9z" stroke="currentColor" strokeWidth="1.5" />
                <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              Copy URL
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="pointer-events-auto inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-white/10 hover:bg-white/15 border border-white/20"
              aria-label="Download image"
              title="Download"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3v12" stroke="currentColor" strokeWidth="1.5" />
                <path d="m7 11 5 5 5-5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 19h14" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              Download
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center w-80 h-80 bg-white/10 backdrop-blur-sm rounded-2xl border-2 border-dashed border-white/20 text-center px-4">
          <p className="text-purple-200 italic">
            {imageUrl ? "Could not load image." : "No image yet."}
          </p>
          {imageUrl && (
            <button
              type="button"
              onClick={handleRetry}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white/10 hover:bg-white/15 border border-white/20"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
