import { useState } from "react";
import InputBox from "./components/InputBox";
import OutputSection from "./components/OutputSection";
import ImageDisplay from "./components/ImageDisplay";

export default function App() {
  const [oppositePrompt, setOppositePrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loadingText, setLoadingText] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);

  return (
    <div className="min-h-screen text-white bg-gradient-to-br from-indigo-900 via-purple-800 to-pink-600">
      <header className="sticky top-0 z-20 backdrop-blur bg-black/20 border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-4xl">🎭</span>
            <span className="font-semibold tracking-tight">Opposite Prompt Generator - Semantic Inversion Tool</span>
          </div>
          <div className="text-sm opacity-80">Pollinations.ai</div>
        </div>
      </header>

      <main className="px-4">
        <div className="max-w-2xl mx-auto mt-8 bg-black/20 backdrop-blur-lg rounded-3xl shadow-2xl p-6 md:p-8 border border-white/10">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-300">
              Opposite Prompt Generator
            </h1>
            <p className="text-purple-200 max-w-md mx-auto">
              Transform any image prompt into its semantic opposite and visualize the result
            </p>
          </div>

          <InputBox
            setOppositePrompt={setOppositePrompt}
            setImageUrl={setImageUrl}
            setLoadingText={setLoadingText}
            setLoadingImage={setLoadingImage}
            loadingText={loadingText}
            loadingImage={loadingImage}
          />

          <OutputSection oppositePrompt={oppositePrompt} loading={loadingText} />

          <ImageDisplay imageUrl={imageUrl} loading={loadingImage} />
        </div>
      </main>

      <footer className="mt-10 pb-6 text-center text-white/70 text-sm">
        <p>Built with React + Tailwind</p>
      </footer>
    </div>
  );
}
