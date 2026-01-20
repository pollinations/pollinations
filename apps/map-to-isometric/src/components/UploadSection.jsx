import React, { useState } from 'react';
import '../styles/UploadSection.css';

function UploadSection({ imagePreview, onImageUpload, locationDescription, setLocationDescription }) {
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      onImageUpload(file);
    }
  };

  return (
    <section className="upload-section">
      <div className="upload-box">
        <input
          type="file"
          id="file-input"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <label htmlFor="file-input" className="upload-button">
          📁 Upload Map Image
        </label>
        <p className="hint">or paste from clipboard (Ctrl+V / Cmd+V)</p>
        <p className="tip">
          💡 Try screenshots from Google Maps, OpenStreetMap, or any map service
        </p>
      </div>

      {imagePreview && (
        <div className="preview-box">
          <h3>Map Reference</h3>
          <img src={imagePreview} alt="Map preview" className="preview-image" />
          
          <div className="location-input">
            <label htmlFor="location-desc">
              <strong>📍 Describe your map location:</strong>
              <span className="hint-text">(This helps the AI understand your map)</span>
            </label>
            <input
              id="location-desc"
              type="text"
              placeholder="e.g., Mumbai Marine Drive coastal area, Manhattan downtown, Tokyo city center..."
              value={locationDescription || ''}
              onChange={(e) => setLocationDescription(e.target.value)}
              className="location-input-field"
            />
          </div>
          
          <p className="info-text">
            ℹ️ The AI will create an isometric view based on your map and description
          </p>
        </div>
      )}
    </section>
  );
}

export default UploadSection;
