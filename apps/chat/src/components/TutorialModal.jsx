import React, { useState } from 'react';
import './TutorialModal.css';

const TutorialModal = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: 'Welcome to Pollinations Chat! 👋',
      icon: '🌸',
      content: (
        <>
          <p>Pollinations Chat is your AI-powered creative assistant. You can have conversations, generate images, and create videos all in one place.</p>
          <p>Let's take a quick tour to get you started!</p>
        </>
      )
    },
    {
      title: 'Chat with AI 💬',
      icon: '🤖',
      content: (
        <>
          <p>Simply type your message in the input box at the bottom and press Enter or click the send button.</p>
          <p>You can ask questions, get help with tasks, or have creative conversations!</p>
          <div className="tutorial-tip">
            <strong>Tip:</strong> Use the model selector to switch between different AI models.
          </div>
        </>
      )
    },
    {
      title: 'Generate Images 🖼️',
      icon: '🎨',
      content: (
        <>
          <p>To generate an image, click the <strong>+</strong> button and select "Image Generation", or type:</p>
          <div className="tutorial-command">/imagine a beautiful sunset over mountains</div>
          <p>The AI will create an image based on your description!</p>
        </>
      )
    },
    {
      title: 'Generate Videos 🎬',
      icon: '🎥',
      content: (
        <>
          <p>To generate a video, click the <strong>+</strong> button and select "Video Generation", or type:</p>
          <div className="tutorial-command">/video a cat playing with a ball of yarn</div>
          <p>Video generation may take a minute, so please be patient!</p>
        </>
      )
    },
    {
      title: "You're All Set! 🎉",
      icon: '✨',
      content: (
        <>
          <p>That's everything you need to know to get started!</p>
          <p>Feel free to explore and create. Have fun with Pollinations Chat!</p>
          <div className="tutorial-tip">
            <strong>Keyboard shortcuts:</strong>
            <ul>
              <li><kbd>Ctrl</kbd> + <kbd>K</kbd> - Focus input</li>
              <li><kbd>Ctrl</kbd> + <kbd>N</kbd> - New chat</li>
              <li><kbd>Ctrl</kbd> + <kbd>B</kbd> - Toggle sidebar</li>
            </ul>
          </div>
        </>
      )
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  if (!isOpen) return null;

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  return (
    <div className="tutorial-modal-overlay" onClick={onClose}>
      <div className="tutorial-modal" onClick={e => e.stopPropagation()}>
        <button className="tutorial-close-btn" onClick={onClose} aria-label="Close tutorial">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        
        <div className="tutorial-icon">{step.icon}</div>
        <h2 className="tutorial-title">{step.title}</h2>
        <div className="tutorial-content">{step.content}</div>
        
        <div className="tutorial-progress">
          {steps.map((_, index) => (
            <div
              key={index}
              className={`tutorial-progress-dot ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
              onClick={() => setCurrentStep(index)}
            />
          ))}
        </div>
        
        <div className="tutorial-actions">
          {!isFirstStep && (
            <button className="tutorial-btn tutorial-btn-secondary" onClick={handlePrev}>
              Back
            </button>
          )}
          {isFirstStep && (
            <button className="tutorial-btn tutorial-btn-skip" onClick={handleSkip}>
              Skip Tutorial
            </button>
          )}
          <button className="tutorial-btn tutorial-btn-primary" onClick={handleNext}>
            {isLastStep ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TutorialModal;
