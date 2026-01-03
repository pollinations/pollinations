import { useState, useEffect } from "react";
import {
  Upload,
  Sparkles,
  Download,
  Loader2,
  Box,
  Droplet,
  ShoppingBag,
  Package,
  Palette,
  Moon,
  Sun,
  Eye,
} from "lucide-react";

type StyleOption = {
  id: string;
  label: string;
  description: string;
  gradient: string;
  emoji: string;
};

type PackagingType = {
  id: string;
  label: string;
  icon: typeof Box;
  prompt: string;
};

const styleOptions: StyleOption[] = [
  {
    id: "minimalist",
    label: "Minimalist",
    description: "Clean, simple, modern",
    gradient: "from-slate-400 to-slate-600",
    emoji: "✨",
  },
  {
    id: "vintage",
    label: "Vintage",
    description: "Retro, classic aesthetic",
    gradient: "from-amber-500 to-orange-600",
    emoji: "📻",
  },
  {
    id: "luxury",
    label: "Luxury",
    description: "Premium, elegant design",
    gradient: "from-yellow-400 to-amber-600",
    emoji: "👑",
  },
  {
    id: "eco-friendly",
    label: "Eco-friendly",
    description: "Natural, sustainable look",
    gradient: "from-green-400 to-emerald-600",
    emoji: "🌿",
  },
  {
    id: "japanese",
    label: "Japanese",
    description: "Zen, refined simplicity",
    gradient: "from-rose-400 to-pink-600",
    emoji: "🎌",
  },
];

const packagingTypes: PackagingType[] = [
  { id: "box", label: "Box", icon: Box, prompt: "product box packaging" },
  { id: "bottle", label: "Bottle", icon: Droplet, prompt: "bottle packaging" },
  { id: "bag", label: "Bag", icon: ShoppingBag, prompt: "bag packaging" },
  { id: "can", label: "Can", icon: Package, prompt: "can packaging" },
];
const POLLINATIONS_API = "https://image.pollinations.ai/prompt";
const CLOUDINARY_CLOUD_NAME = "pollinations"; // Your cloud name
const CLOUDINARY_UPLOAD_PRESET = "pollinations-image"; // Your unsigned preset
const CLOUDINARY_API_KEY = "939386723511927"; // Cloudinary public API key

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_DISPLAY_SIZE = 10 * 1024 * 1024;
const VALID_FILE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const UPLOAD_TIMEOUT = 30000; // 30 seconds

const handleError = (error: unknown, fallbackMessage: string): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return fallbackMessage;
};

const validateFile = (
  file: File | null,
  maxSize: number
): { isValid: boolean; error?: string } => {
  if (!file) {
    return { isValid: false, error: "No file provided" };
  }

  if (!VALID_FILE_TYPES.includes(file.type)) {
    return {
      isValid: false,
      error: "Invalid file type. Please upload a JPEG, PNG, or WebP image.",
    };
  }

  if (file.size > maxSize) {
    const sizeMB = Math.round(maxSize / (1024 * 1024));
    return {
      isValid: false,
      error: `File size exceeds ${sizeMB}MB limit. Please choose a smaller image.`,
    };
  }

  return { isValid: true };
};
function App() {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string>("minimalist");
  const [customStyle, setCustomStyle] = useState<string>("");
  const [brandName, setBrandName] = useState<string>("");
  const [packagingType, setPackagingType] = useState<string>("box");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];

    if (!uploadedFile) {
      return;
    }

    const validation = validateFile(uploadedFile, MAX_DISPLAY_SIZE);
    if (!validation.isValid) {
      alert(validation.error);
      return;
    }

    setFile(uploadedFile);

    try {
      const reader = new FileReader();

      reader.onloadend = () => {
        const result = reader.result as string;
        setUploadedImage(result);
        localStorage.setItem("lastUploadedImage", result);
      };

      reader.onerror = () => {
        console.error("Failed to read file");
        alert("Failed to read the image file. Please try again.");
        setFile(null);
      };

      reader.readAsDataURL(uploadedFile);
    } catch (error) {
      console.error("Error handling image upload:", error);
      const errorMessage = handleError(
        error,
        "An error occurred while processing the image. Please try again."
      );
      alert(errorMessage);
      setFile(null);
    }
  };
  const uploadToCloudinary = async (file: File): Promise<string> => {
    const validation = validateFile(file, MAX_FILE_SIZE);
    if (!validation.isValid) {
      throw new Error(validation.error || "File validation failed");
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    if (CLOUDINARY_API_KEY) {
      formData.append("api_key", CLOUDINARY_API_KEY);
    }

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
          method: "POST",
          body: formData,
          signal: AbortSignal.timeout(UPLOAD_TIMEOUT),
        }
      );

      if (!response.ok) {
        let errorMessage = "Upload failed";
        try {
          const errorData = await response.json();
          errorMessage =
            errorData.error?.message ||
            `HTTP ${response.status}: ${response.statusText}`;
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (!data.secure_url) {
        throw new Error(
          "Invalid response from Cloudinary - no secure URL received"
        );
      }

      return data.secure_url;
    } catch (error) {
      console.error("Cloudinary upload failed:", error);

      if (error instanceof Error) {
        if (error.name === "TimeoutError") {
          throw new Error(
            "Upload timed out. Please check your internet connection and try again."
          );
        }
        if (error.name === "TypeError" && error.message.includes("fetch")) {
          throw new Error(
            "Network error. Please check your internet connection and try again."
          );
        }
        throw error;
      }

      throw new Error("An unexpected error occurred during upload");
    }
  };

  const generatePackaging = async () => {
    if (!uploadedImage && !file) {
      alert("Please upload an image first!");
      return;
    }

    if (file && file.size > MAX_FILE_SIZE) {
      alert(
        `Image too large! Please use an image under ${
          MAX_FILE_SIZE / (1024 * 1024)
        }MB.`
      );
      return;
    }

    setIsGenerating(true);
    setGeneratedImage(null);
    setImageLoaded(false);

    try {
      let uploadedUrl: string = "";

      if (file) {
        try {
          uploadedUrl = await uploadToCloudinary(file);
        } catch (cloudinaryError) {
          console.warn(
            "Cloudinary upload failed, using local image:",
            cloudinaryError
          );
          uploadedUrl = uploadedImage || "";
        }
      } else {
        uploadedUrl = uploadedImage || "";
      }

      if (!uploadedUrl) {
        throw new Error("No valid image URL available");
      }

      const style = customStyle.trim() || selectedStyle;
      const selectedPackaging = packagingTypes.find(
        (p) => p.id === packagingType
      );

      const prompt = `
Create a high-quality, realistic ${
        selectedPackaging?.prompt || "product packaging"
      } design 
for a consumer product displayed in a professional studio scene. 
The packaging should follow a ${style} style, with thoughtful composition, accurate shadows, and appealing lighting.
Include the uploaded product image integrated naturally on the box or label.

Guidelines:
• Emphasize visual clarity and brand appeal. 
• Use realistic textures (paper, plastic, or metal as appropriate).
• Include printed label area with product name, logo, and minimal text.
• Show it from an angle suitable for e-commerce display.
• Keep proportions and perspective correct.
• Use ${style} color palette and design principles.
${brandName.trim() ? ` Brand name: "${brandName}".` : ""}
      `.trim();

      const encodedPrompt = encodeURIComponent(prompt);
      const imageUrl = `${POLLINATIONS_API}/${encodedPrompt}?model=nanobanana&image=${encodeURIComponent(
        uploadedUrl
      )}&referrer=pollinations.github.io&quality=high`;

      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";

        img.onload = () => {
          setGeneratedImage(imageUrl);
          localStorage.setItem("lastGeneratedImage", imageUrl);
          localStorage.setItem("lastPrompt", prompt);
          setImageLoaded(true);
          resolve();
        };

        img.onerror = (error) => {
          console.error("Image generation failed:", error);
          reject(
            new Error(
              "Failed to generate image. The AI service may be temporarily unavailable. Please try again later "
            )
          );
        };

        img.src = imageUrl;
      });
    } catch (error) {
      console.error("Error in generatePackaging:", error);

      const errorMessage = handleError(
        error,
        "An unexpected error occurred. Please try again."
      );
      alert(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadImage = async () => {
    if (!generatedImage) {
      console.warn("No generated image available for download");
      return;
    }

    try {
      const response = await fetch(generatedImage, {
        headers: {
          Accept: "image/*",
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch image: ${response.status} ${response.statusText}`
        );
      }

      const blob = await response.blob();

      // Validate the blob is actually an image
      if (!blob.type.startsWith("image/")) {
        throw new Error("Downloaded file is not a valid image");
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `packaging-mockup-${Date.now()}.png`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);

      let errorMessage = "Failed to download image.";
      if (error instanceof Error) {
        if (error.name === "TimeoutError") {
          errorMessage =
            "Download timed out. Please check your internet connection and try again.";
        } else if (error.name === "TypeError") {
          errorMessage =
            "Network error during download. Please check your connection.";
        } else {
          errorMessage = `Download failed: ${error.message}`;
        }
      }

      alert(
        `${errorMessage} Please try right-clicking and saving the image manually.`
      );
    }
  };

  const isDark = theme === "dark";

  return (
    <div
      className={`min-h-screen transition-all duration-500 ${
        isDark
          ? "bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900"
          : "bg-gradient-to-br from-blue-50 via-white to-teal-50"
      }`}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className={`absolute -top-40 -left-40 w-80 h-80 rounded-full blur-3xl opacity-20 ${
            isDark ? "bg-blue-500" : "bg-blue-300"
          }`}
        ></div>
        <div
          className={`absolute top-1/2 -right-40 w-80 h-80 rounded-full blur-3xl opacity-20 ${
            isDark ? "bg-teal-500" : "bg-teal-300"
          }`}
        ></div>
        <div
          className={`absolute -bottom-40 left-1/2 w-60 h-60 rounded-full blur-3xl opacity-15 ${
            isDark ? "bg-purple-500" : "bg-purple-300"
          }`}
        ></div>
      </div>

      <div className="relative container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-2xl ${
                  isDark
                    ? "bg-gradient-to-br from-blue-500 to-teal-500"
                    : "bg-gradient-to-br from-blue-400 to-teal-400"
                } shadow-lg`}
              >
                <Palette className="w-8 h-8 text-white" />
              </div>
              <h1
                className={`text-4xl md:text-5xl font-bold ${
                  isDark ? "text-white" : "text-gray-900"
                }`}
              >
                AI Packaging Designer
              </h1>
            </div>
            <p
              className={`text-lg ml-16 ${
                isDark ? "text-gray-300" : "text-gray-600"
              }`}
            >
              Transform products into professional packaging mockups
            </p>
          </div>
          <button
            onClick={toggleTheme}
            className={`group px-6 py-3 rounded-2xl font-medium transition-all duration-300 shadow-lg hover:shadow-xl ${
              isDark
                ? "bg-gradient-to-r from-amber-400 to-orange-500 text-white hover:scale-105"
                : "bg-gradient-to-r from-slate-700 to-slate-900 text-white hover:scale-105"
            }`}
          >
            <div className="flex items-center gap-2">
              {isDark ? (
                <>
                  <Sun className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-5 h-5 group-hover:-rotate-12 transition-transform duration-300" />
                  <span>Dark Mode</span>
                </>
              )}
            </div>
          </button>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <div
            className={`rounded-3xl shadow-2xl p-8 backdrop-blur-sm border transition-all duration-300 ${
              isDark
                ? "bg-gray-800/50 border-gray-700/50"
                : "bg-white/70 border-white/50"
            }`}
          >
            <div className="space-y-8">
              <div>
                <h2
                  className={`text-xl font-bold mb-4 flex items-center gap-3 ${
                    isDark ? "text-white" : "text-gray-900"
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold shadow-lg">
                    1
                  </div>
                  Upload Product Image
                </h2>

                <label
                  className={`group block relative overflow-hidden w-full border-3 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 ${
                    uploadedImage
                      ? isDark
                        ? "border-teal-500/50 bg-teal-500/5"
                        : "border-teal-400/50 bg-teal-50/50"
                      : isDark
                      ? "border-gray-600 hover:border-blue-500 bg-gray-700/30"
                      : "border-gray-300 hover:border-blue-400 bg-gray-50/50"
                  }`}
                >
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  {uploadedImage ? (
                    <div className="space-y-3">
                      <div className="relative inline-block">
                        <img
                          src={uploadedImage}
                          alt="Uploaded product"
                          className="max-h-56 mx-auto rounded-xl shadow-2xl ring-4 ring-white/20"
                        />
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      </div>
                      <p
                        className={`text-sm font-medium ${
                          isDark ? "text-gray-300" : "text-gray-600"
                        }`}
                      >
                        Click to change image
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div
                        className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 ${
                          isDark
                            ? "bg-gradient-to-br from-blue-500 to-teal-500"
                            : "bg-gradient-to-br from-blue-400 to-teal-400"
                        } shadow-lg group-hover:scale-110 transition-transform duration-300`}
                      >
                        <Upload className="w-8 h-8 text-white" />
                      </div>
                      <p
                        className={`text-lg font-semibold ${
                          isDark ? "text-white" : "text-gray-900"
                        }`}
                      >
                        Click to upload product image
                      </p>
                      <p
                        className={`text-sm ${
                          isDark ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        PNG or JPG up to 10MB
                      </p>
                    </div>
                  )}
                </label>
              </div>

              <div>
                <h2
                  className={`text-xl font-bold mb-4 flex items-center gap-3 ${
                    isDark ? "text-white" : "text-gray-900"
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white text-sm font-bold shadow-lg">
                    2
                  </div>
                  Packaging Type
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {packagingTypes.map((type) => {
                    const Icon = type.icon;
                    const isSelected = packagingType === type.id;
                    return (
                      <button
                        key={type.id}
                        onClick={() => setPackagingType(type.id)}
                        className={`group relative p-5 rounded-xl transition-all duration-300 ${
                          isSelected
                            ? isDark
                              ? "bg-gradient-to-br from-teal-500 to-blue-600 shadow-xl scale-105"
                              : "bg-gradient-to-br from-teal-400 to-blue-500 shadow-xl scale-105"
                            : isDark
                            ? "bg-gray-700/50 hover:bg-gray-700 shadow-lg hover:scale-105"
                            : "bg-white/80 hover:bg-white shadow-lg hover:scale-105"
                        }`}
                      >
                        <Icon
                          className={`w-7 h-7 mx-auto mb-2 transition-transform duration-300 ${
                            isSelected
                              ? "text-white scale-110"
                              : isDark
                              ? "text-gray-300 group-hover:text-white"
                              : "text-gray-600 group-hover:text-gray-900"
                          }`}
                        />
                        <p
                          className={`text-sm font-bold ${
                            isSelected
                              ? "text-white"
                              : isDark
                              ? "text-gray-200"
                              : "text-gray-700"
                          }`}
                        >
                          {type.label}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <h2
                  className={`text-xl font-bold mb-4 flex items-center gap-3 ${
                    isDark ? "text-white" : "text-gray-900"
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white text-sm font-bold shadow-lg">
                    3
                  </div>
                  Design Style
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {styleOptions.map((style) => {
                    const isSelected =
                      selectedStyle === style.id && !customStyle;
                    return (
                      <button
                        key={style.id}
                        onClick={() => {
                          setSelectedStyle(style.id);
                          setCustomStyle("");
                        }}
                        className={`group relative p-4 rounded-xl text-left transition-all duration-300 overflow-hidden ${
                          isSelected
                            ? "shadow-2xl scale-105"
                            : isDark
                            ? "bg-gray-700/50 hover:bg-gray-700 shadow-lg hover:scale-105"
                            : "bg-white/80 hover:bg-white shadow-lg hover:scale-105"
                        }`}
                      >
                        {isSelected && (
                          <div
                            className={`absolute inset-0 bg-gradient-to-br ${style.gradient} opacity-90`}
                          ></div>
                        )}
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-2xl">{style.emoji}</span>
                            <p
                              className={`font-bold ${
                                isSelected
                                  ? "text-white"
                                  : isDark
                                  ? "text-gray-100"
                                  : "text-gray-800"
                              }`}
                            >
                              {style.label}
                            </p>
                          </div>
                          <p
                            className={`text-xs ${
                              isSelected
                                ? "text-white/90"
                                : isDark
                                ? "text-gray-400"
                                : "text-gray-500"
                            }`}
                          >
                            {style.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {/* <div className="mt-4">
                  <label className={`block text-sm font-semibold mb-2 ${
                    isDark ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                     describe your product for better result:
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setdescription(e.target.value)}
                    placeholder="e.g., A stainless steel water bottle, 1L, vacuum insulated"
                    className={`w-full px-4 py-3 rounded-xl font-medium transition-all duration-300 focus:scale-[1.02] focus:shadow-xl ${
                      isDark
                        ? 'bg-gray-700/50 border-2 border-gray-600 text-white placeholder-gray-400 focus:border-teal-500'
                        : 'bg-white/80 border-2 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400'
                    }`}
                  />
                </div> */}

                <div className="mt-4">
                  <label
                    className={`block text-sm font-semibold mb-2 ${
                      isDark ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    Or describe your custom style:
                  </label>
                  <input
                    type="text"
                    value={customStyle}
                    onChange={(e) => setCustomStyle(e.target.value)}
                    placeholder="e.g., futuristic cyberpunk style"
                    className={`w-full px-4 py-3 rounded-xl font-medium transition-all duration-300 focus:scale-[1.02] focus:shadow-xl ${
                      isDark
                        ? "bg-gray-700/50 border-2 border-gray-600 text-white placeholder-gray-400 focus:border-teal-500"
                        : "bg-white/80 border-2 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400"
                    }`}
                  />
                </div>
              </div>

              <div>
                <h2
                  className={`text-xl font-bold mb-4 flex items-center gap-3 ${
                    isDark ? "text-white" : "text-gray-900"
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white text-sm font-bold shadow-lg">
                    4
                  </div>
                  Brand Details
                </h2>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Enter brand name or slogan (optional)"
                  className={`w-full px-4 py-3 rounded-xl font-medium transition-all duration-300 focus:scale-[1.02] focus:shadow-xl ${
                    isDark
                      ? "bg-gray-700/50 border-2 border-gray-600 text-white placeholder-gray-400 focus:border-orange-500"
                      : "bg-white/80 border-2 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-400"
                  }`}
                />
              </div>

              <button
                onClick={generatePackaging}
                disabled={isGenerating || !uploadedImage}
                className={`group relative w-full py-5 rounded-2xl font-bold text-lg transition-all duration-300 shadow-2xl overflow-hidden ${
                  isGenerating || !uploadedImage
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:scale-105 hover:shadow-3xl"
                }`}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-teal-500 to-blue-500 bg-size-200 animate-gradient"></div>
                <div className="relative flex items-center justify-center gap-3 text-white">
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span>Generating Magic...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                      <span>Generate Packaging</span>
                    </>
                  )}
                </div>
              </button>
            </div>
          </div>

          <div
            className={`rounded-3xl shadow-2xl p-8 backdrop-blur-sm border transition-all duration-300 ${
              isDark
                ? "bg-gray-800/50 border-gray-700/50"
                : "bg-white/70 border-white/50"
            }`}
          >
            <h2
              className={`text-2xl font-bold mb-6 flex items-center gap-3 ${
                isDark ? "text-white" : "text-gray-900"
              }`}
            >
              <Sparkles
                className={isDark ? "text-teal-400" : "text-blue-500"}
              />
              Generated Mockup
            </h2>

            <div
              className={`relative rounded-2xl p-8 min-h-[500px] flex items-center justify-center transition-all duration-300 ${
                isDark ? "bg-gray-900/50" : "bg-gray-50/50"
              }`}
            >
              {isGenerating ? (
                <div className="text-center space-y-6">
                  <div className="relative">
                    <Loader2
                      className={`w-20 h-20 mx-auto animate-spin ${
                        isDark ? "text-teal-400" : "text-blue-500"
                      }`}
                    />
                    <div
                      className={`absolute inset-0 blur-2xl opacity-50 ${
                        isDark ? "bg-teal-500" : "bg-blue-500"
                      }`}
                    ></div>
                  </div>
                  <div>
                    <p
                      className={`text-xl font-bold mb-2 ${
                        isDark ? "text-white" : "text-gray-900"
                      }`}
                    >
                      Creating your packaging design...
                    </p>
                    <p
                      className={`text-sm ${
                        isDark ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      AI is working its magic
                    </p>
                  </div>
                </div>
              ) : generatedImage ? (
                <div
                  className={`w-full space-y-4 ${
                    imageLoaded ? "animate-fadeIn" : ""
                  }`}
                >
                  <div className="relative group">
                    <img
                      src={generatedImage}
                      alt="Generated packaging"
                      className="w-full rounded-2xl shadow-2xl ring-4 ring-white/10 transition-transform duration-300 group-hover:scale-[1.02]"
                      onLoad={() => setImageLoaded(true)}
                    />
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  </div>
                  <button
                    onClick={downloadImage}
                    className="group w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300 flex items-center justify-center gap-3"
                  >
                    <Download className="w-6 h-6 group-hover:translate-y-1 transition-transform" />
                    Download High Resolution
                  </button>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <div
                    className={`w-24 h-24 mx-auto rounded-3xl flex items-center justify-center mb-4 ${
                      isDark
                        ? "bg-gradient-to-br from-teal-500 to-blue-600"
                        : "bg-gradient-to-br from-blue-400 to-teal-400"
                    } shadow-2xl`}
                  >
                    <Sparkles className="w-12 h-12 text-white animate-pulse" />
                  </div>
                  <p
                    className={`text-xl font-bold ${
                      isDark ? "text-white" : "text-gray-900"
                    }`}
                  >
                    Your masterpiece will appear here
                  </p>
                  <p
                    className={`text-sm ${
                      isDark ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    Upload an image and click Generate to start creating
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          className={`mt-8 rounded-3xl shadow-2xl p-8 backdrop-blur-sm border transition-all duration-300 ${
            isDark
              ? "bg-gradient-to-br from-gray-800/50 to-gray-900/50 border-gray-700/50"
              : "bg-gradient-to-br from-white/70 to-blue-50/50 border-white/50"
          }`}
        >
          <h3
            className={`text-2xl font-bold mb-6 text-center ${
              isDark ? "text-white" : "text-gray-900"
            }`}
          >
            How It Works
          </h3>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              {
                num: 1,
                title: "Upload",
                desc: "Add your product photo",
                gradient: "from-blue-500 to-blue-600",
                icon: Upload,
              },
              {
                num: 2,
                title: "Customize",
                desc: "Choose style & type",
                gradient: "from-teal-500 to-teal-600",
                icon: Palette,
              },
              {
                num: 3,
                title: "Generate",
                desc: "AI creates mockup",
                gradient: "from-purple-500 to-pink-600",
                icon: Sparkles,
              },
              {
                num: 4,
                title: "Download",
                desc: "Save your design",
                gradient: "from-green-500 to-emerald-600",
                icon: Download,
              },
            ].map((step) => {
              const StepIcon = step.icon;
              return (
                <div key={step.num} className="text-center space-y-3 group">
                  <div
                    className={`w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br ${step.gradient} flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform duration-300`}
                  >
                    <StepIcon className="w-8 h-8 text-white" />
                  </div>
                  <p
                    className={`font-bold text-lg ${
                      isDark ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {step.title}
                  </p>
                  <p
                    className={`text-sm ${
                      isDark ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {step.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div
          className={`mt-8 rounded-3xl shadow-2xl p-8 backdrop-blur-sm border transition-all duration-300 ${
            isDark
              ? "bg-gradient-to-br from-gray-800/50 to-gray-900/50 border-gray-700/50"
              : "bg-gradient-to-br from-white/70 to-purple-50/50 border-white/50"
          }`}
        >
          <div className="text-center mb-8">
            <h3
              className={`text-2xl font-bold mb-2 ${
                isDark ? "text-white" : "text-gray-900"
              }`}
            >
              Inspiration Gallery
            </h3>
            <p
              className={`text-sm ${
                isDark ? "text-gray-400" : "text-gray-600"
              }`}
            >
              Explore stunning packaging designs created by our AI
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Luxury bottle",
                style: "luxury",
                type: "box",
                image:
                  "https://res.cloudinary.com/dwzvfzqs7/image/upload/v1759939221/yv0fx8tfo40gzg9xj9o8.jpg",
                gradient: "from-slate-400 to-slate-600",
              },
              {
                title: "Luxury Camera",
                style: "luxury",
                type: "bottle",
                image:
                  "https://res.cloudinary.com/dwzvfzqs7/image/upload/v1759939178/p6bjg0grgyzsh5bmh9sj.jpg",
                gradient: "from-yellow-400 to-amber-600",
              },
              {
                title: "Bag pakaging",
                style: "eco-friendly",
                type: "bag",
                image:
                  "https://res.cloudinary.com/dwzvfzqs7/image/upload/v1759939305/vod3vhtinuzfenmoll0m.jpg",
                gradient: "from-green-400 to-emerald-600",
              },
            ].map((example, index) => (
              <div
                key={index}
                className={`group relative rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 cursor-pointer ${
                  isDark ? "bg-gray-700/30" : "bg-white/80"
                }`}
              >
                <div className="relative h-64 overflow-hidden">
                  <img
                    src={example.image}
                    alt={example.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>

                  <div className="absolute top-3 right-3">
                    <div
                      className={`px-3 py-1 rounded-full text-xs font-bold text-white backdrop-blur-md bg-gradient-to-r ${example.gradient} shadow-lg`}
                    >
                      {example.style}
                    </div>
                  </div>

                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="bg-white/90 backdrop-blur-sm px-6 py-3 rounded-full shadow-2xl">
                      <div className="flex items-center gap-2 text-gray-900 font-bold">
                        <Eye className="w-5 h-5" />
                        <span>View Example</span>
                      </div>
                    </div>
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h4 className="text-white font-bold text-lg mb-1">
                      {example.title}
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/80 bg-white/10 backdrop-blur-sm px-2 py-1 rounded-full">
                        {example.type}
                      </span>
                      <span className="text-xs text-white/80">
                        Click to try this style
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  className={`p-4 border-t ${
                    isDark ? "border-gray-600/50" : "border-gray-200"
                  }`}
                >
                  <button
                    onClick={() => {
                      setSelectedStyle(example.style);
                      setPackagingType(example.type);
                      setCustomStyle("");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className={`w-full py-2 rounded-lg font-semibold text-sm transition-all duration-300 ${
                      isDark
                        ? "bg-gradient-to-r from-teal-500 to-blue-600 text-white hover:shadow-lg"
                        : "bg-gradient-to-r from-blue-500 to-teal-500 text-white hover:shadow-lg"
                    }`}
                  >
                    Use This Style
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer
        className={`mt-16 py-8 text-center border-t transition-all duration-300 ${
          isDark
            ? "border-gray-700/50 bg-gray-900/30"
            : "border-gray-200/50 bg-white/30"
        }`}
      >
        <div className="container mx-auto px-4">
          <p
            className={`text-lg font-medium ${
              isDark ? "text-gray-300" : "text-gray-600"
            }`}
          >
            Made with 💜 by{" "}
            <a
              href="https://pollinations.ai"
              target="_blank"
              rel="noopener noreferrer"
              className={`font-bold transition-all duration-300 hover:scale-105 inline-block ${
                isDark
                  ? "text-teal-400 hover:text-teal-300"
                  : "text-blue-600 hover:text-blue-700"
              }`}
            >
              pollinations.ai
            </a>
          </p>
        </div>
      </footer>

      <style>{`
        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }
        .bg-size-200 {
          background-size: 200% 200%;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.6s ease-out;
        }
      `}</style>
    </div>
  );
}

export default App;
