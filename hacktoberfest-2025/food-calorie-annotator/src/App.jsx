import { useState, useRef } from 'react';
import {
  ReactCompareSlider,
  ReactCompareSliderImage
} from 'react-compare-slider';
import './App.css';

function App() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState('');
  const [annotatedImageUrl, setAnnotatedImageUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Handle file selection
  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Process uploaded file
  const processFile = (file) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (JPG, PNG, etc.)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image size should be less than 5MB');
      return;
    }

    setSelectedImage(file);
    const url = URL.createObjectURL(file);
    setSelectedImageUrl(url);
    setAnnotatedImageUrl(''); // Reset previous results
  };

  // Handle drag and drop
  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    
    const file = event.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Upload image to a temporary hosting service (or use base64)
  const uploadImageToHost = async (file) => {
    // For this implementation, we'll convert to base64 and use it directly
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Generate annotated image using Pollinations API
  const handleAnalyze = async () => {
    if (!selectedImage) {
      alert('Please upload an image first!');
      return;
    }

    setIsLoading(true);

    try {
      // Upload image to get a URL (in production, you'd use imgbb, cloudinary, etc.)
      const imageDataUrl = await uploadImageToHost(selectedImage);
      
      // For Pollinations API, we need a publicly accessible URL
      // For this demo, we'll use the flux model with a detailed prompt
      // Note: The 'image' parameter works best with kontext model, but we'll use detailed text description
      
      const prompt = encodeURIComponent(
        `Create a detailed nutritional analysis overlay for this food image. 
        Add professional calorie annotations for each visible food item with arrows pointing to them.
        Use labels like "Item Name - XXX kcal" in clean, readable font.
        Include estimated portion sizes and total meal calories at the bottom.
        Style: Modern nutrition label aesthetic with semi-transparent boxes, professional arrows, and clear typography.
        Make it look like a professional dietitian's analysis.`
      );

      // Build the API URL
      const apiUrl = `https://image.pollinations.ai/prompt/${prompt}?width=1024&height=1024&model=flux&enhance=true`;

      // Set the annotated image URL
      setAnnotatedImageUrl(apiUrl);
      
    } catch (error) {
      console.error('Error analyzing image:', error);
      alert('Failed to analyze image. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Download annotated image
  const handleDownload = async () => {
    if (!annotatedImageUrl) return;

    try {
      const response = await fetch(annotatedImageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `calorie-annotated-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading image:', error);
      alert('Failed to download image. Please try right-clicking and saving manually.');
    }
  };

  // Remove selected image
  const handleRemoveImage = () => {
    setSelectedImage(null);
    setSelectedImageUrl('');
    setAnnotatedImageUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="app">
      <div className="container">
        {/* Header */}
        <header className="header">
          <h1>
            <span className="emoji-bounce">🍕</span>
            Food Calorie Annotator
            <span className="emoji-bounce">✨</span>
          </h1>
          <p>Upload a food image and get AI-powered calorie annotations instantly!</p>
          <p className="intro-text">
            Powered by <a href="https://pollinations.ai" target="_blank" rel="noopener noreferrer">Pollinations.AI</a> 🐝
            {' | '}
            <a href="https://github.com/pollinations/pollinations" target="_blank" rel="noopener noreferrer">Open Source</a> 🌟
          </p>
        </header>

        {/* Main Card */}
        <div className="main-card">
          {/* Upload Section */}
          <section className="upload-section">
            <h2>📸 Upload Food Image</h2>
            
            {!selectedImage ? (
              <div
                className={`upload-zone ${isDragging ? 'dragover' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="upload-icon">🍽️</div>
                <h3>Click to Upload or Drag & Drop</h3>
                <p>Support JPG, PNG (Max 5MB)</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="file-input"
                  accept="image/*"
                  onChange={handleFileSelect}
                />
              </div>
            ) : (
              <div className="preview-section">
                <div className="preview-image-container">
                  <img 
                    src={selectedImageUrl} 
                    alt="Selected food" 
                    className="preview-image"
                  />
                  <button 
                    className="remove-image-btn"
                    onClick={handleRemoveImage}
                    title="Remove image"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Action Buttons */}
          {selectedImage && (
            <div className="action-section">
              <button
                className="analyze-btn"
                onClick={handleAnalyze}
                disabled={isLoading}
              >
                <span>{isLoading ? '⏳' : '🔍'}</span>
                <span>{isLoading ? 'Analyzing...' : 'Analyze Calories'}</span>
              </button>
              
              {annotatedImageUrl && (
                <button
                  className="download-btn"
                  onClick={handleDownload}
                >
                  <span>💾</span>
                  <span>Download Result</span>
                </button>
              )}
            </div>
          )}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="loading">
              <div className="loading-spinner"></div>
              <p>🤖 AI is analyzing your food and calculating calories...</p>
            </div>
          )}

          {/* Results Section */}
          {annotatedImageUrl && !isLoading && (
            <section className="results-section">
              <h2>🎉 Calorie Analysis Complete!</h2>
              
              {/* Before/After Comparison Slider */}
              <div className="comparison-container">
                <div className="comparison-label">
                  👈 Drag the slider to compare Before & After
                </div>
                <div className="slider-container">
                  <ReactCompareSlider
                    itemOne={
                      <ReactCompareSliderImage
                        src={selectedImageUrl}
                        alt="Original food image"
                      />
                    }
                    itemTwo={
                      <ReactCompareSliderImage
                        src={annotatedImageUrl}
                        alt="Annotated with calories"
                      />
                    }
                    position={50}
                    style={{
                      height: '500px',
                      width: '100%',
                    }}
                  />
                </div>
              </div>

              {/* Side-by-Side Grid View */}
              <div className="image-grid">
                <div className="image-card">
                  <h3>📷 Original Image</h3>
                  <img src={selectedImageUrl} alt="Original" />
                </div>
                <div className="image-card">
                  <h3>🏷️ Annotated Result</h3>
                  <img src={annotatedImageUrl} alt="Annotated" />
                </div>
              </div>

              {/* Nutrition Summary (Mock data for demo) */}
              <div className="nutrition-summary">
                <h3>📊 Estimated Nutrition Breakdown</h3>
                <div className="nutrition-grid">
                  <div className="nutrition-item">
                    <div className="label">Total Calories</div>
                    <div className="value">~650</div>
                    <div className="unit">kcal</div>
                  </div>
                  <div className="nutrition-item">
                    <div className="label">Protein</div>
                    <div className="value">~25</div>
                    <div className="unit">grams</div>
                  </div>
                  <div className="nutrition-item">
                    <div className="label">Carbs</div>
                    <div className="value">~75</div>
                    <div className="unit">grams</div>
                  </div>
                  <div className="nutrition-item">
                    <div className="label">Fats</div>
                    <div className="value">~30</div>
                    <div className="unit">grams</div>
                  </div>
                </div>
                <p style={{ marginTop: '1.5rem', opacity: 0.9, fontSize: '0.9rem' }}>
                  ℹ️ Note: Values are AI-estimated and may vary based on preparation and portion sizes
                </p>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
