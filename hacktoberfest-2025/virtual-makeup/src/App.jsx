import { useState, useRef } from "react";
import {
  Upload,
  Sparkles,
  Download,
  RefreshCw,
  Image as ImageIcon,
  Camera,
  Zap,
  Wand2,
} from "lucide-react";

const CLOUDINARY_CLOUD_NAME = "pollinations";
const CLOUDINARY_UPLOAD_PRESET = "pollinations-image";
const CLOUDINARY_API_KEY = "939386723511927";

const MAKEUP_STYLES = [
  {
    id: "natural",
    name: "Natural",
    prompt:
      "Apply natural everyday makeup with nude lipstick, subtle eyeshadow, light mascara, and natural blush. Keep the look fresh and minimal.",
    gradient: "from-amber-50 to-orange-50",
    icon: "🌿",
  },
  {
    id: "dramatic",
    name: "Dramatic",
    prompt:
      "Apply bold evening makeup with red lipstick, smokey eyes with dark eyeshadow, winged eyeliner, dramatic lashes, and contoured cheeks.",
    gradient: "from-red-50 to-orange-50",
    icon: "🔥",
  },
  {
    id: "kbeauty",
    name: "K-Beauty",
    prompt:
      "Apply K-beauty makeup with gradient lips in coral pink, aegyo sal under eyes, straight eyebrows, dewy skin, and soft peachy blush.",
    gradient: "from-cyan-50 to-blue-50",
    icon: "✨",
  },
  {
    id: "vintage",
    name: "Vintage",
    prompt:
      "Apply vintage 1950s makeup with bold red lips, dramatic winged eyeliner, defined eyebrows, pale foundation, and rosy cheeks.",
    gradient: "from-emerald-50 to-teal-50",
    icon: "💎",
  },
];

function App() {
  const [uploadedImage, setUploadedImage] = useState(null);
  const [makeupImage, setMakeupImage] = useState(null);
  const [selectedStyle, setSelectedStyle] = useState("natural");
  const [customPrompt, setCustomPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sliderValue, setSliderValue] = useState(50);
  const [useCustom, setUseCustom] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setUploadedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImage(e.target?.result);
        setMakeupImage(null);
        setSliderValue(50);
        setImageLoaded(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadToCloudinary = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    formData.append("api_key", CLOUDINARY_API_KEY);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body: formData }
    );

    const data = await response.json();
    return data.secure_url;
  };

  const applyMakeup = async () => {
    if (!uploadedImage || !uploadedFile) return;

    setIsLoading(true);
    setImageLoaded(false);
    try {
      const prompt = useCustom
        ? customPrompt
        : MAKEUP_STYLES.find((s) => s.id === selectedStyle)?.prompt || "";

      const encodedPrompt = encodeURIComponent(prompt);

      const cloudinaryUrl = await uploadToCloudinary(uploadedFile);

      const encodedImageURL = encodeURIComponent(cloudinaryUrl);

      const randomSeed = Math.floor(Math.random() * 1000000);

      const apiUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=nanobanana&image=${encodedImageURL}&referrer=virtualmakeuptryon&width=1024&height=1024&nologo=true&enhance=true&seed=${randomSeed}`;

      const img = new Image();
      img.onload = () => {
        setMakeupImage(apiUrl);
        setImageLoaded(true);
        setIsLoading(false);
      };
      img.onerror = () => {
        setIsLoading(false);
      };
      img.src = apiUrl;
    } catch (error) {
      console.error("Error applying makeup:", error);
      setIsLoading(false);
    }
  };

  const downloadImage = async () => {
    if (!makeupImage) return;

    try {
      const response = await fetch(makeupImage);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `makeup-result-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading image:", error);
    }
  };

  const resetApp = () => {
    setUploadedImage(null);
    setMakeupImage(null);
    setSelectedStyle("natural");
    setCustomPrompt("");
    setUseCustom(false);
    setSliderValue(50);
    setImageLoaded(false);
    setUploadedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div
          className="absolute -bottom-40 -left-40 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "1s" }}
        ></div>
        <div
          className="absolute top-1/2 left-1/2 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "2s" }}
        ></div>
      </div>

      <header className="relative border-b border-white/10 backdrop-blur-xl bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-ping"></div>
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 via-emerald-400 to-orange-400 bg-clip-text text-transparent">
                  Virtual Makeup Studio
                </h1>
                <p className="text-sm text-slate-400">
                  AI-powered beauty transformation
                </p>
              </div>
            </div>
            {uploadedImage && (
              <button
                onClick={resetApp}
                className="flex items-center gap-2 px-5 py-2.5 text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/10 hover:border-white/20"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline font-medium">New Photo</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!uploadedImage ? (
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 rounded-full mb-6 border border-cyan-500/20">
                <span className="text-sm font-medium text-cyan-400">
                  Powered by Pollinations AI
                </span>
              </div>
              <h2 className="text-5xl font-bold text-white mb-4">
                Transform Your Look
              </h2>
              <p className="text-xl text-slate-400">
                Upload your photo and try on stunning makeup styles instantly
              </p>
            </div>

            <label htmlFor="file-upload" className="block cursor-pointer group">
              <input
                ref={fileInputRef}
                id="file-upload"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <div className="relative border-2 border-dashed border-white/20 rounded-3xl p-16 hover:border-cyan-400/50 bg-white/5 hover:bg-white/10 backdrop-blur-sm transition-all duration-300 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="relative flex flex-col items-center">
                  <div className="relative mb-6">
                    <div className="w-24 h-24 bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 backdrop-blur-xl border border-white/10">
                      <Camera className="w-12 h-12 text-cyan-400" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-emerald-400 rounded-full flex items-center justify-center">
                      <Upload className="w-3 h-3 text-white" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">
                    Upload Your Selfie
                  </h3>
                  <p className="text-slate-400 mb-6 text-center max-w-md">
                    Drag and drop your photo here, or click to browse your files
                  </p>
                  <div className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 text-white rounded-xl font-semibold shadow-lg shadow-cyan-500/25 group-hover:shadow-xl group-hover:shadow-cyan-500/40 transition-all">
                    <Upload className="w-5 h-5" />
                    <span>Choose Photo</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-6">
                    Supports JPG, PNG, WEBP up to 10MB
                  </p>
                </div>
              </div>
            </label>

            <div className="grid md:grid-cols-3 gap-4 mt-12">
              {[
                {
                  icon: Zap,
                  title: "Instant Results",
                  desc: "AI-powered processing in seconds",
                },
                {
                  icon: Sparkles,
                  title: "Multiple Styles",
                  desc: "Choose from preset or custom looks",
                },
                {
                  icon: Download,
                  title: "Save Results",
                  desc: "Download your transformed photos",
                },
              ].map((feature, idx) => (
                <div
                  key={idx}
                  className="p-6 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 hover:border-white/20 transition-all flex flex-col items-center text-center"
                >
                  <feature.icon className="w-8 h-8 text-cyan-400 mb-3" />
                  <h4 className="text-white font-semibold mb-2">
                    {feature.title}
                  </h4>
                  <p className="text-sm text-slate-400">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 rounded-xl flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-cyan-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white">
                    Choose Your Style
                  </h3>
                </div>

                <div className="flex items-center gap-3 mb-6">
                  <button
                    onClick={() => setUseCustom(false)}
                    className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all ${
                      !useCustom
                        ? "bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-lg shadow-cyan-500/25"
                        : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/10"
                    }`}
                  >
                    Preset Styles
                  </button>
                  <button
                    onClick={() => setUseCustom(true)}
                    className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all ${
                      useCustom
                        ? "bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-lg shadow-cyan-500/25"
                        : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/10"
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {!useCustom ? (
                  <div className="grid grid-cols-2 gap-4">
                    {MAKEUP_STYLES.map((style) => (
                      <button
                        key={style.id}
                        onClick={() => setSelectedStyle(style.id)}
                        className={`relative p-6 rounded-2xl border-2 transition-all duration-300 group overflow-hidden ${
                          selectedStyle === style.id
                            ? "border-cyan-400 bg-slate-800 scale-105 shadow-lg shadow-cyan-500/20"
                            : "border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <div
                          className={`absolute inset-0 bg-gradient-to-br ${
                            style.gradient
                          } opacity-0 ${
                            selectedStyle !== style.id
                              ? "group-hover:opacity-20"
                              : ""
                          } transition-opacity`}
                        ></div>
                        <div className="relative">
                          <div className="text-3xl mb-2">{style.icon}</div>
                          <span className="font-bold text-white text-lg">
                            {style.name}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="relative">
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="Describe your dream makeup style... ✨&#10;&#10;Example: 'Apply golden eyeshadow with nude lips, bronzed cheeks, and natural glow'"
                      className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent resize-none h-40 text-white placeholder-slate-500"
                    />
                  </div>
                )}

                <button
                  onClick={applyMakeup}
                  disabled={isLoading || (useCustom && !customPrompt.trim())}
                  className="w-full mt-6 py-4 bg-gradient-to-r from-cyan-500 via-emerald-500 to-orange-500 text-white rounded-2xl font-bold shadow-lg shadow-cyan-500/25 hover:shadow-xl hover:shadow-cyan-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3 group"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-6 h-6 animate-spin" />
                      <span className="text-lg">Transforming...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                      <span className="text-lg">Apply Makeup Magic</span>
                    </>
                  )}
                </button>
              </div>

              {makeupImage && imageLoaded && (
                <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-orange-500/20 to-amber-500/20 rounded-xl flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-orange-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white">
                      Compare Results
                    </h3>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between text-sm font-medium text-slate-400 mb-3">
                        <span>Before</span>
                        <span className="text-cyan-400">{sliderValue}%</span>
                        <span>After</span>
                      </div>
                      <div className="relative">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={sliderValue}
                          onChange={(e) =>
                            setSliderValue(Number(e.target.value))
                          }
                          className="w-full h-3 bg-gradient-to-r from-slate-700 via-cyan-500 to-emerald-500 rounded-full appearance-none cursor-pointer slider"
                        />
                      </div>
                    </div>

                    <button
                      onClick={downloadImage}
                      className="w-full py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl font-bold hover:shadow-lg hover:shadow-orange-500/25 transition-all flex items-center justify-center gap-3 group"
                    >
                      <Download className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
                      <span className="text-lg">Download Result</span>
                    </button>

                    <button
                      onClick={applyMakeup}
                      className="w-full py-3 bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 rounded-2xl font-semibold transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Try Again</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10">
              <div className="aspect-square rounded-2xl overflow-hidden bg-slate-800/50 relative shadow-2xl">
                {makeupImage && imageLoaded ? (
                  <div className="relative w-full h-full">
                    <img
                      src={uploadedImage}
                      alt="Before"
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ clipPath: `inset(0 ${100 - sliderValue}% 0 0)` }}
                    />
                    <img
                      src={makeupImage}
                      alt="After"
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ clipPath: `inset(0 0 0 ${sliderValue}%)` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-gradient-to-b from-cyan-400 via-emerald-400 to-orange-400 shadow-lg shadow-cyan-500/50"
                      style={{ left: `${sliderValue}%` }}
                    >
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-gradient-to-br from-cyan-400 to-emerald-400 rounded-full shadow-xl shadow-cyan-500/50 flex items-center justify-center border-4 border-white/20">
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      </div>
                    </div>

                    <div className="absolute top-4 left-4 px-3 py-1.5 bg-slate-900/80 backdrop-blur-sm rounded-lg border border-white/20">
                      <span className="text-xs font-bold text-white">
                        BEFORE
                      </span>
                    </div>
                    <div className="absolute top-4 right-4 px-3 py-1.5 bg-gradient-to-r from-cyan-500/80 to-emerald-500/80 backdrop-blur-sm rounded-lg border border-white/20">
                      <span className="text-xs font-bold text-white">
                        AFTER
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="relative w-full h-full">
                    <img
                      src={uploadedImage}
                      alt="Uploaded"
                      className="w-full h-full object-cover"
                    />
                    {isLoading && (
                      <div className="absolute inset-0 bg-slate-900/90 flex items-center justify-center backdrop-blur-sm">
                        <div className="text-center">
                          <div className="relative mb-6">
                            <div className="w-20 h-20 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mx-auto"></div>
                            <Sparkles className="w-8 h-8 text-cyan-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                          </div>
                          <p className="text-white font-bold text-xl mb-2">
                            Creating Magic...
                          </p>
                          <p className="text-slate-400 text-sm">
                            This may take a few seconds
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="relative mt-16 pb-8 text-center">
        <div className="inline-flex items-center gap-2 px-6 py-3 bg-white/5 backdrop-blur-sm rounded-full border border-white/10">
          <span className="text-sm text-slate-400">
            Powered by{" "}
            <span className="text-white font-semibold">Pollinations AI</span> •
            Hacktoberfest 2025
          </span>
        </div>
      </footer>

      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: linear-gradient(135deg, #06b6d4, #10b981);
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(6, 182, 212, 0.4);
          border: 3px solid rgba(255, 255, 255, 0.2);
        }

        .slider::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: linear-gradient(135deg, #06b6d4, #10b981);
          cursor: pointer;
          border: 3px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 4px 12px rgba(6, 182, 212, 0.4);
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
}

export default App;
