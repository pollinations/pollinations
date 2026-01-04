import { useState } from "react";
import Footer from "./components/Footer";
import Header from "./components/Header";
import InfoSection from "./components/InfoSection";
import LoadingSpinner from "./components/LoadingSpinner";
import PromptEditor from "./components/PromptEditor";
import ResultDisplay from "./components/ResultDisplay";
import UploadSection from "./components/UploadSection";
import "./App.css";

function App() {
    const [selectedFile, setSelectedFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [locationDescription, setLocationDescription] = useState("");
    const [generatedImage, setGeneratedImage] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [prompt, setPrompt] = useState(
        "isometric 3D city view with detailed buildings, streets, and urban architecture. Vibrant colors, clear architectural details, game style.",
    );

    const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY || "";
    const handleImageUpload = (file) => {
        if (file?.type.startsWith("image/")) {
            setSelectedFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result);
            };
            reader.readAsDataURL(file);
            setGeneratedImage(null);
            setError(null);
        } else {
            setError("Please select a valid image file");
        }
    };

    const handlePaste = (event) => {
        const items = event.clipboardData.items;
        for (const item of items) {
            if (item.type.indexOf("image") !== -1) {
                const blob = item.getAsFile();
                handleImageUpload(blob);
            }
        }
    };

    const generateIsometric = async () => {
        if (!selectedFile) {
            setError("Please upload or paste a map image first!");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const reader = new FileReader();
            const imageBase64 = await new Promise((resolve, reject) => {
                reader.onloadend = () => {
                    const base64 = reader.result.split(",")[1]; // Get base64 part only
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(selectedFile);
            });

            // Step 2: Upload to ImgBB (supports CORS)
            const formData = new FormData();
            formData.append("image", imageBase64);

            const uploadResponse = await fetch(
                `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
                {
                    method: "POST",
                    body: formData,
                },
            );

            if (!uploadResponse.ok) {
                const errorText = await uploadResponse.text();
                console.error("Upload error:", errorText);
                throw new Error("Failed to upload image to ImgBB");
            }

            const uploadData = await uploadResponse.json();

            if (!uploadData.success || !uploadData.data.url) {
                throw new Error("No image URL returned from ImgBB");
            }

            const imageUrl = uploadData.data.url;

            // Step 3: Build prompt
            let fullPrompt = `Using this location as a landmark, create it as an isometric image (buildings only) with a game-style theme park aesthetic. ${prompt}`;

            if (locationDescription && locationDescription.trim() !== "") {
                fullPrompt += ` Location context: ${locationDescription}.`;
            }

            const encodedPrompt = encodeURIComponent(fullPrompt);
            const encodedImageUrl = encodeURIComponent(imageUrl);
            const seed = Math.floor(Math.random() * 999999999);

            // Step 4: Generate with nanobanana model
            const apiUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${seed}&model=nanobanana&image=${encodedImageUrl}&referrer=isometricmap&nologo=true&enhance=true`;

            setGeneratedImage(apiUrl);

            setTimeout(() => {
                setIsLoading(false);
            }, 6000);
        } catch (err) {
            console.error("Full error details:", err);
            setError(
                `Failed to generate image: ${err.message}. Please try again.`,
            );
            setIsLoading(false);
        }
    };

    const downloadImage = async () => {
        if (!generatedImage) return;

        try {
            const response = await fetch(generatedImage);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `isometric-map-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Download error:", err);
            setError("Failed to download image");
        }
    };

    const resetApp = () => {
        setSelectedFile(null);
        setImagePreview(null);
        setLocationDescription("");
        setGeneratedImage(null);
        setError(null);
        setIsLoading(false);
    };

    return (
        <div className="app-container" onPaste={handlePaste}>
            <Header />

            <main>
                <UploadSection
                    imagePreview={imagePreview}
                    onImageUpload={handleImageUpload}
                    locationDescription={locationDescription}
                    setLocationDescription={setLocationDescription}
                />

                {selectedFile && (
                    <PromptEditor
                        prompt={prompt}
                        setPrompt={setPrompt}
                        onGenerate={generateIsometric}
                        isLoading={isLoading}
                        error={error}
                    />
                )}

                {isLoading && <LoadingSpinner />}

                {generatedImage && !isLoading && (
                    <ResultDisplay
                        generatedImage={generatedImage}
                        onDownload={downloadImage}
                        onReset={resetApp}
                        onLoadComplete={() => setIsLoading(false)}
                        onError={() => {
                            setError("Image failed to load. Please try again.");
                            setIsLoading(false);
                        }}
                    />
                )}

                <InfoSection />
            </main>

            <Footer />
        </div>
    );
}

export default App;
