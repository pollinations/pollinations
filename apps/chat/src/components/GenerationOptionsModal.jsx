import React, { useState } from 'react';
import './GenerationOptionsModal.css';

const GenerationOptionsModal = ({ isOpen, onClose, mode, onGenerate }) => {
  // Image generation defaults
  const [imageOptions, setImageOptions] = useState({
    width: 1024,
    height: 1024,
    seed: 42,
    enhance: false,
    nologo: false,
    nofeed: false,
    safe: false,
    quality: 'medium',
    negative_prompt: 'worst quality, blurry',
    guidance_scale: 7.5,
    transparent: false
  });

  // Video generation defaults
  const [videoOptions, setVideoOptions] = useState({
    seed: 42,
    nologo: false,
    nofeed: false,
    duration: 4,
    aspectRatio: '16:9',
    audio: false
  });

  const handleImageOptionChange = (key, value) => {
    // Prevent setting NaN values
    if (typeof value === 'number' && isNaN(value)) {
      return;
    }
    setImageOptions(prev => ({ ...prev, [key]: value }));
  };

  const handleVideoOptionChange = (key, value) => {
    // Prevent setting NaN values
    if (typeof value === 'number' && isNaN(value)) {
      return;
    }
    setVideoOptions(prev => ({ ...prev, [key]: value }));
  };

  const handleRandomSeed = () => {
    const randomSeed = Math.floor(Math.random() * 2147483647);
    if (mode === 'imagine') {
      handleImageOptionChange('seed', randomSeed);
    } else if (mode === 'video') {
      handleVideoOptionChange('seed', randomSeed);
    }
  };

  const handleApply = () => {
    if (mode === 'imagine') {
      onGenerate(imageOptions);
    } else if (mode === 'video') {
      onGenerate(videoOptions);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="generation-options-overlay" onClick={onClose}>
      <div className="generation-options-modal" onClick={(e) => e.stopPropagation()}>
        <div className="generation-options-header">
          <h2>{mode === 'imagine' ? 'Image' : 'Video'} Generation Options</h2>
          <button className="generation-options-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        
        <div className="generation-options-body">
          {mode === 'imagine' && (
            <>
              <div className="option-group">
                <label className="option-label">
                  <span>Width</span>
                  <input
                    type="number"
                    min="256"
                    max="2048"
                    step="64"
                    value={imageOptions.width}
                    onChange={(e) => handleImageOptionChange('width', parseInt(e.target.value))}
                    className="option-input"
                  />
                </label>
              </div>

              <div className="option-group">
                <label className="option-label">
                  <span>Height</span>
                  <input
                    type="number"
                    min="256"
                    max="2048"
                    step="64"
                    value={imageOptions.height}
                    onChange={(e) => handleImageOptionChange('height', parseInt(e.target.value))}
                    className="option-input"
                  />
                </label>
              </div>

              <div className="option-group">
                <label className="option-label">
                  <span>Seed</span>
                  <div className="seed-input-group">
                    <input
                      type="number"
                      min="0"
                      max="2147483647"
                      value={imageOptions.seed}
                      onChange={(e) => handleImageOptionChange('seed', parseInt(e.target.value))}
                      className="option-input"
                    />
                    <button 
                      type="button"
                      className="random-seed-btn"
                      onClick={handleRandomSeed}
                      title="Random seed"
                    >
                      🎲
                    </button>
                  </div>
                </label>
              </div>

              <div className="option-group">
                <label className="option-label">
                  <span>Quality</span>
                  <select
                    value={imageOptions.quality}
                    onChange={(e) => handleImageOptionChange('quality', e.target.value)}
                    className="option-select"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="hd">HD</option>
                  </select>
                </label>
              </div>

              <div className="option-group">
                <label className="option-label">
                  <span>Guidance Scale</span>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    step="0.5"
                    value={imageOptions.guidance_scale}
                    onChange={(e) => handleImageOptionChange('guidance_scale', parseFloat(e.target.value))}
                    className="option-input"
                  />
                </label>
              </div>

              <div className="option-group">
                <label className="option-label">
                  <span>Negative Prompt</span>
                  <textarea
                    value={imageOptions.negative_prompt}
                    onChange={(e) => handleImageOptionChange('negative_prompt', e.target.value)}
                    className="option-textarea"
                    rows="2"
                    placeholder="What to avoid in the image..."
                  />
                </label>
              </div>

              <div className="option-group checkbox-group">
                <label className="option-checkbox">
                  <input
                    type="checkbox"
                    checked={imageOptions.enhance}
                    onChange={(e) => handleImageOptionChange('enhance', e.target.checked)}
                  />
                  <span>Enhance prompt with AI</span>
                </label>
              </div>

              <div className="option-group checkbox-group">
                <label className="option-checkbox">
                  <input
                    type="checkbox"
                    checked={imageOptions.transparent}
                    onChange={(e) => handleImageOptionChange('transparent', e.target.checked)}
                  />
                  <span>Transparent background</span>
                </label>
              </div>

              <div className="option-group checkbox-group">
                <label className="option-checkbox">
                  <input
                    type="checkbox"
                    checked={imageOptions.nologo}
                    onChange={(e) => handleImageOptionChange('nologo', e.target.checked)}
                  />
                  <span>Remove watermark</span>
                </label>
              </div>

              <div className="option-group checkbox-group">
                <label className="option-checkbox">
                  <input
                    type="checkbox"
                    checked={imageOptions.nofeed}
                    onChange={(e) => handleImageOptionChange('nofeed', e.target.checked)}
                  />
                  <span>Don't add to public feed</span>
                </label>
              </div>

              <div className="option-group checkbox-group">
                <label className="option-checkbox">
                  <input
                    type="checkbox"
                    checked={imageOptions.safe}
                    onChange={(e) => handleImageOptionChange('safe', e.target.checked)}
                  />
                  <span>Enable safety filters</span>
                </label>
              </div>
            </>
          )}

          {mode === 'video' && (
            <>
              <div className="option-group">
                <label className="option-label">
                  <span>Seed</span>
                  <div className="seed-input-group">
                    <input
                      type="number"
                      min="0"
                      max="2147483647"
                      value={videoOptions.seed}
                      onChange={(e) => handleVideoOptionChange('seed', parseInt(e.target.value))}
                      className="option-input"
                    />
                    <button 
                      type="button"
                      className="random-seed-btn"
                      onClick={handleRandomSeed}
                      title="Random seed"
                    >
                      🎲
                    </button>
                  </div>
                </label>
              </div>

              <div className="option-group">
                <label className="option-label">
                  <span>Duration (seconds)</span>
                  <input
                    type="number"
                    min="2"
                    max="10"
                    value={videoOptions.duration}
                    onChange={(e) => handleVideoOptionChange('duration', parseInt(e.target.value))}
                    className="option-input"
                  />
                </label>
              </div>

              <div className="option-group">
                <label className="option-label">
                  <span>Aspect Ratio</span>
                  <select
                    value={videoOptions.aspectRatio}
                    onChange={(e) => handleVideoOptionChange('aspectRatio', e.target.value)}
                    className="option-select"
                  >
                    <option value="16:9">16:9 (Landscape)</option>
                    <option value="9:16">9:16 (Portrait)</option>
                  </select>
                </label>
              </div>

              <div className="option-group checkbox-group">
                <label className="option-checkbox">
                  <input
                    type="checkbox"
                    checked={videoOptions.audio}
                    onChange={(e) => handleVideoOptionChange('audio', e.target.checked)}
                  />
                  <span>Enable audio (veo only)</span>
                </label>
              </div>

              <div className="option-group checkbox-group">
                <label className="option-checkbox">
                  <input
                    type="checkbox"
                    checked={videoOptions.nologo}
                    onChange={(e) => handleVideoOptionChange('nologo', e.target.checked)}
                  />
                  <span>Remove watermark</span>
                </label>
              </div>

              <div className="option-group checkbox-group">
                <label className="option-checkbox">
                  <input
                    type="checkbox"
                    checked={videoOptions.nofeed}
                    onChange={(e) => handleVideoOptionChange('nofeed', e.target.checked)}
                  />
                  <span>Don't add to public feed</span>
                </label>
              </div>
            </>
          )}
        </div>

        <div className="generation-options-footer">
          <button className="options-btn options-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="options-btn options-btn-primary" onClick={handleApply}>
            Apply Options
          </button>
        </div>
      </div>
    </div>
  );
};

export default GenerationOptionsModal;
