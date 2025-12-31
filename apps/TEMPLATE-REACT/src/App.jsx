import { useState } from "react";
import "./App.css";

// Array of sentence templates for generating readable text
const sentences = [
    "The quick brown fox jumps over the lazy dog.",
    "In a world of endless possibilities, innovation drives progress forward.",
    "Sunlight streams through the window, casting long shadows on the floor.",
    "The gentle breeze carries the sweet scent of blooming flowers.",
    "Time flows like a river, constantly moving and never stopping.",
    "Knowledge is the key that unlocks countless doors of opportunity.",
    "Creativity flourishes in the garden of imagination and wonder.",
    "Mountains stand tall against the horizon, reaching for the sky.",
    "Music fills the air with melodies that touch the soul.",
    "Dreams take flight on the wings of determination and hope.",
];

function TextGenerator() {
    const [paragraphs, setParagraphs] = useState(1);
    const [generatedText, setGeneratedText] = useState("");

    const generateText = () => {
        const result = [];
        for (let i = 0; i < paragraphs; i++) {
            const paragraph = [];
            // Generate 4-8 sentences per paragraph
            const sentenceCount = Math.floor(Math.random() * 5) + 4;
            for (let j = 0; j < sentenceCount; j++) {
                const randomIndex = Math.floor(
                    Math.random() * sentences.length,
                );
                paragraph.push(sentences[randomIndex]);
            }
            result.push(paragraph.join(" "));
        }
        setGeneratedText(result.join("\n\n"));
    };

    return (
        <div className="generator-section">
            <h2>Text Generator</h2>
            <div className="controls">
                <label>
                    Number of Paragraphs:
                    <input
                        type="number"
                        min="1"
                        max="10"
                        value={paragraphs}
                        onChange={(e) =>
                            setParagraphs(parseInt(e.target.value, 10))
                        }
                    />
                </label>
                <button type="button" onClick={generateText}>Generate Text</button>
            </div>
            {generatedText && (
                <div className="output">
                    <textarea readOnly value={generatedText} rows={10} />
                    <button
                        type="button"
                        onClick={() =>
                            navigator.clipboard.writeText(generatedText)
                        }
                    >
                        Copy Text
                    </button>
                </div>
            )}
        </div>
    );
}

function ImageGenerator() {
    const [width, setWidth] = useState(400);
    const [height, setHeight] = useState(300);
    const [imageUrl, setImageUrl] = useState("");

    const generateImage = () => {
        setImageUrl(`https://picsum.photos/${width}/${height}`);
    };

    return (
        <div className="generator-section">
            <h2>Image Generator</h2>
            <div className="controls">
                <label>
                    Width:
                    <input
                        type="number"
                        min="100"
                        max="1000"
                        value={width}
                        onChange={(e) => setWidth(parseInt(e.target.value, 10))}
                    />
                </label>
                <label>
                    Height:
                    <input
                        type="number"
                        min="100"
                        max="1000"
                        value={height}
                        onChange={(e) =>
                            setHeight(parseInt(e.target.value, 10))
                        }
                    />
                </label>
                <button type="button" onClick={generateImage}>Generate Image</button>
            </div>
            {imageUrl && (
                <div className="output">
                    <img src={imageUrl} alt="Generated placeholder" />
                    <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(imageUrl)}
                    >
                        Copy URL
                    </button>
                </div>
            )}
        </div>
    );
}

function App() {
    return (
        <div className="app">
            <h1>Placeholder Generator</h1>
            <TextGenerator />
            <ImageGenerator />
        </div>
    );
}

export default App;
