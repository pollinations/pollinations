import React from 'react';
import PropTypes from 'prop-types';
import { formatStreamingMessage } from '../utils/markdown';
import { useTypewriter } from '../hooks/useTypewriter';
import './TypewriterEffect.css';

const TypewriterEffect = ({ content, isStreaming, onComplete }) => {
  const { displayedContent, isTyping } = useTypewriter(content, isStreaming, 10, onComplete);

  const html = formatStreamingMessage(displayedContent);

  return (
    <div className="typewriter-container" aria-live="polite">
      <div 
        className="typewriter-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {isTyping && <span className="typewriter-cursor" aria-hidden="true"></span>}
    </div>
  );
};

TypewriterEffect.propTypes = {
  content: PropTypes.string.isRequired,
  isStreaming: PropTypes.bool,
  onComplete: PropTypes.func
};

TypewriterEffect.defaultProps = {
  isStreaming: false,
  onComplete: null
};

export default TypewriterEffect;