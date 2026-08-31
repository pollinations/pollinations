import "../styles/InfoSection.css";

function InfoSection() {
    const useCases = [
        "🏙️ Urban Planning",
        "🎮 Game Design",
        "🏗️ Architecture",
        "🗺️ City Art",
        "🏘️ Real Estate",
        "📚 Education",
    ];

    const promptIdeas = [
        "isometric cyberpunk city with neon buildings and flying cars",
        "medieval fantasy town isometric pixel art style",
        "modern cityscape with glass skyscrapers isometric 3D",
        "isometric game style neighborhood with parks and trees",
        "futuristic city isometric view vibrant purple and blue colors",
        "industrial district with factories isometric detailed buildings",
    ];

    return (
        <section className="info-section">
            <div className="use-cases">
                <h3>💡 Use Cases</h3>
                <div className="use-case-grid">
                    {useCases.map((useCase, index) => (
                        <div key={index} className="use-case-item">
                            {useCase}
                        </div>
                    ))}
                </div>
            </div>

            <div className="tips-box">
                <h4>💭 Prompt Ideas</h4>
                <p>Try these creative prompts for different styles:</p>
                <div className="tips-grid">
                    {promptIdeas.map((idea, index) => (
                        <div key={index} className="tip-item">
                            "{idea}"
                        </div>
                    ))}
                </div>
            </div>

            <div className="how-it-works">
                <h4>🔧 How It Works</h4>
                <ol className="steps-list">
                    <li>
                        Upload or paste a map image (reference for inspiration)
                    </li>
                    <li>Customize the prompt to describe your desired style</li>
                    <li>
                        Click "Generate" - Pollinations AI creates the isometric
                        view
                    </li>
                    <li>
                        Wait 30-60 seconds for the nanobanana model to generate
                    </li>
                    <li>Download your unique isometric artwork!</li>
                </ol>
            </div>
        </section>
    );
}

export default InfoSection;
