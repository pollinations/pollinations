import React from 'react';
import './MediaLightbox.css';

const MediaLightbox = ({ src, alt, type = 'image', isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      <div className="lightbox-content" onClick={e => e.stopPropagation()}>
        {type === 'image' ? (
          <img src={src} alt={alt} className="lightbox-media" />
        ) : (
          <video src={src} controls autoPlay className="lightbox-media" />
        )}
      </div>
    </div>
  );
};

export default MediaLightbox;
