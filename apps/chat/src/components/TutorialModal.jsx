import React, { useRef, useEffect, memo } from 'react';
import PropTypes from 'prop-types';
import { useTutorial } from '../hooks/useTutorial';
import './TutorialModal.css';

const ANIMATION_TIMING = {
  TOOLTIP_MOVE: 400,
  CONTENT_FADE: 200,
  HIGHLIGHT_PULSE: 2000,
};

const TutorialOverlay = memo(({ highlightRect, isTransitioning }) => {
  const generateClipPath = (rect) => {
    if (!rect) return 'none';
    
    const { top, left, width, height } = rect;
    const right = left + width;
    const bottom = top + height;
    
    return `polygon(
      0% 0%,
      0% 100%,
      ${left}px 100%,
      ${left}px ${top}px,
      ${right}px ${top}px,
      ${right}px ${bottom}px,
      ${left}px ${bottom}px,
      ${left}px 100%,
      100% 100%,
      100% 0%
    )`;
  };

  return (
    <>
      <div 
        className={`tutorial-overlay-backdrop ${isTransitioning ? 'transitioning' : ''}`}
        style={{
          clipPath: highlightRect ? generateClipPath(highlightRect) : 'none',
        }}
        aria-hidden="true"
      />
      
      {highlightRect && (
        <div
          className={`tutorial-highlight-ring ${isTransitioning ? 'transitioning' : ''}`}
          style={{
            top: `${highlightRect.top}px`,
            left: `${highlightRect.left}px`,
            width: `${highlightRect.width}px`,
            height: `${highlightRect.height}px`,
          }}
          aria-hidden="true"
        />
      )}
    </>
  );
});

TutorialOverlay.displayName = 'TutorialOverlay';

TutorialOverlay.propTypes = {
  highlightRect: PropTypes.shape({
    top: PropTypes.number.isRequired,
    left: PropTypes.number.isRequired,
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired,
  }),
  isTransitioning: PropTypes.bool,
};

const TutorialArrow = memo(({ direction, visible }) => {
  if (!visible || direction === 'none') return null;
  
  return (
    <div 
      className={`tutorial-arrow tutorial-arrow-${direction}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 12"
        className="tutorial-arrow-svg"
        preserveAspectRatio="none"
      >
        <path
          d="M0,12 L12,0 L24,12"
          fill="currentColor"
          stroke="var(--tutorial-border-color)"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
});

TutorialArrow.displayName = 'TutorialArrow';

TutorialArrow.propTypes = {
  direction: PropTypes.oneOf(['top', 'bottom', 'left', 'right', 'none']),
  visible: PropTypes.bool,
};

const TutorialStepIcon = memo(({ icon, animate }) => {
  return (
    <div className={`tutorial-step-icon ${animate ? 'animate' : ''}`}>
      <span className="tutorial-step-icon-content" role="img" aria-hidden="true">
        {icon}
      </span>
    </div>
  );
});

TutorialStepIcon.displayName = 'TutorialStepIcon';

TutorialStepIcon.propTypes = {
  icon: PropTypes.string.isRequired,
  animate: PropTypes.bool,
};

const TutorialProgressDots = memo(({ currentStep, totalSteps, onDotClick, disabled }) => {
  return (
    <div 
      className="tutorial-progress-dots"
      role="tablist"
      aria-label="Tutorial progress"
    >
      {Array.from({ length: totalSteps }, (_, index) => {
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;
        
        return (
          <button
            key={index}
            className={`tutorial-progress-dot ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
            onClick={() => !disabled && onDotClick(index)}
            disabled={disabled}
            role="tab"
            aria-selected={isActive}
            aria-label={`Step ${index + 1} of ${totalSteps}${isCompleted ? ' (completed)' : ''}`}
            tabIndex={isActive ? 0 : -1}
          >
            <span className="tutorial-progress-dot-inner" />
          </button>
        );
      })}
    </div>
  );
});

TutorialProgressDots.displayName = 'TutorialProgressDots';

TutorialProgressDots.propTypes = {
  currentStep: PropTypes.number.isRequired,
  totalSteps: PropTypes.number.isRequired,
  onDotClick: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

const TutorialExample = memo(({ example }) => {
  if (!example) return null;
  
  return (
    <div className="tutorial-example-box">
      <div className="tutorial-example-header">
        <span className="tutorial-example-icon">💡</span>
        <span className="tutorial-example-label">Try this command</span>
      </div>
      <div className="tutorial-example-content">
        <code className="tutorial-example-code">{example}</code>
      </div>
    </div>
  );
});

TutorialExample.displayName = 'TutorialExample';

TutorialExample.propTypes = {
  example: PropTypes.string,
};

const TutorialShortcuts = memo(({ shortcuts }) => {
  if (!shortcuts || shortcuts.length === 0) return null;
  
  return (
    <div className="tutorial-shortcuts-box">
      <div className="tutorial-shortcuts-header">
        <span className="tutorial-shortcuts-icon">⌨️</span>
        <span className="tutorial-shortcuts-label">Keyboard Shortcuts</span>
      </div>
      <div className="tutorial-shortcuts-list">
        {shortcuts.map((shortcut, index) => (
          <div key={index} className="tutorial-shortcut-row">
            <div className="tutorial-shortcut-keys">
              {shortcut.keys.map((key, keyIndex) => (
                <React.Fragment key={keyIndex}>
                  <kbd className="tutorial-kbd">{key}</kbd>
                  {keyIndex < shortcut.keys.length - 1 && (
                    <span className="tutorial-key-separator">+</span>
                  )}
                </React.Fragment>
              ))}
            </div>
            <span className="tutorial-shortcut-action">{shortcut.action}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

TutorialShortcuts.displayName = 'TutorialShortcuts';

TutorialShortcuts.propTypes = {
  shortcuts: PropTypes.arrayOf(PropTypes.shape({
    keys: PropTypes.arrayOf(PropTypes.string).isRequired,
    action: PropTypes.string.isRequired,
  })),
};

const TutorialContent = memo(({ step, currentStep, totalSteps, visible }) => {
  return (
    <div className={`tutorial-content ${visible ? 'visible' : 'hidden'}`}>
      <div className="tutorial-content-header">
        <TutorialStepIcon icon={step.icon} animate={visible} />
        <div className="tutorial-content-meta">
          <span className="tutorial-step-counter">
            Step {currentStep + 1} of {totalSteps}
          </span>
          <h2 className="tutorial-title">{step.title}</h2>
        </div>
      </div>
      
      <div className="tutorial-description">
        <p>{step.content}</p>
      </div>
      
      <TutorialExample example={step.example} />
      <TutorialShortcuts shortcuts={step.shortcuts} />
    </div>
  );
});

TutorialContent.displayName = 'TutorialContent';

TutorialContent.propTypes = {
  step: PropTypes.shape({
    icon: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    content: PropTypes.string.isRequired,
    example: PropTypes.string,
    shortcuts: PropTypes.array,
  }).isRequired,
  currentStep: PropTypes.number.isRequired,
  totalSteps: PropTypes.number.isRequired,
  visible: PropTypes.bool,
};

const TutorialActions = memo(({ 
  isFirstStep, 
  isLastStep, 
  onPrev, 
  onNext, 
  onSkip, 
  disabled 
}) => {
  return (
    <div className="tutorial-actions">
      {isFirstStep ? (
        <button
          className="tutorial-btn tutorial-btn-ghost"
          onClick={onSkip}
          disabled={disabled}
          type="button"
        >
          Skip tutorial
        </button>
      ) : (
        <button
          className="tutorial-btn tutorial-btn-secondary"
          onClick={onPrev}
          disabled={disabled}
          type="button"
        >
          <svg 
            className="tutorial-btn-icon tutorial-btn-icon-left" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </button>
      )}
      
      <button
        className="tutorial-btn tutorial-btn-primary"
        onClick={onNext}
        disabled={disabled}
        type="button"
      >
        {isLastStep ? (
          <>
            Get Started
            <svg 
              className="tutorial-btn-icon tutorial-btn-icon-right" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </>
        ) : (
          <>
            Next
            <svg 
              className="tutorial-btn-icon tutorial-btn-icon-right" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </>
        )}
      </button>
    </div>
  );
});

TutorialActions.displayName = 'TutorialActions';

TutorialActions.propTypes = {
  isFirstStep: PropTypes.bool.isRequired,
  isLastStep: PropTypes.bool.isRequired,
  onPrev: PropTypes.func.isRequired,
  onNext: PropTypes.func.isRequired,
  onSkip: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

const TutorialTooltip = memo(({
  step,
  currentStep,
  totalSteps,
  position,
  animationState,
  isFirstStep,
  isLastStep,
  isCentered,
  onPrev,
  onNext,
  onSkip,
  onDotClick,
  onClose,
}) => {
  const tooltipRef = useRef(null);
  
  useEffect(() => {
    if (tooltipRef.current && animationState.contentVisible) {
      tooltipRef.current.focus();
    }
  }, [currentStep, animationState.contentVisible]);
  
  const tooltipStyle = {
    transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
    width: `${position.width}px`,
  };
  
  return (
    <div
      ref={tooltipRef}
      className={`tutorial-tooltip ${isCentered ? 'centered' : ''} ${animationState.isTransitioning ? 'transitioning' : ''}`}
      style={tooltipStyle}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-dialog-title"
      aria-describedby="tutorial-dialog-description"
      tabIndex={-1}
    >
      <button
        className="tutorial-close-btn"
        onClick={onClose}
        aria-label="Close tutorial"
        type="button"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      
      <TutorialContent
        step={step}
        currentStep={currentStep}
        totalSteps={totalSteps}
        visible={animationState.contentVisible}
      />
      
      <div className="tutorial-footer">
        <TutorialProgressDots
          currentStep={currentStep}
          totalSteps={totalSteps}
          onDotClick={onDotClick}
          disabled={animationState.isTransitioning}
        />
        
        <TutorialActions
          isFirstStep={isFirstStep}
          isLastStep={isLastStep}
          onPrev={onPrev}
          onNext={onNext}
          onSkip={onSkip}
          disabled={animationState.isTransitioning}
        />
      </div>
      
      <TutorialArrow
        direction={position.arrowDirection}
        visible={!isCentered}
      />
    </div>
  );
});

TutorialTooltip.displayName = 'TutorialTooltip';

TutorialTooltip.propTypes = {
  step: PropTypes.object.isRequired,
  currentStep: PropTypes.number.isRequired,
  totalSteps: PropTypes.number.isRequired,
  position: PropTypes.shape({
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
    width: PropTypes.number.isRequired,
    arrowDirection: PropTypes.string.isRequired,
  }).isRequired,
  animationState: PropTypes.shape({
    isTransitioning: PropTypes.bool.isRequired,
    contentVisible: PropTypes.bool.isRequired,
    transitionProgress: PropTypes.number,
  }).isRequired,
  isFirstStep: PropTypes.bool.isRequired,
  isLastStep: PropTypes.bool.isRequired,
  isCentered: PropTypes.bool.isRequired,
  onPrev: PropTypes.func.isRequired,
  onNext: PropTypes.func.isRequired,
  onSkip: PropTypes.func.isRequired,
  onDotClick: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

const TutorialModal = ({ isOpen, onClose }) => {
  const {
    currentStep,
    steps,
    currentStepData,
    highlightRect,
    tooltipPosition,
    animationState,
    isFirstStep,
    isLastStep,
    totalSteps,
    isCentered,
    handleNext,
    handlePrev,
    handleSkip,
    handleDotClick,
  } = useTutorial(isOpen, onClose);
  
  if (!isOpen) return null;
  
  if (!currentStepData) {
    console.error('TutorialModal: No step data available');
    return null;
  }
  
  return (
    <div className="tutorial-modal-container" aria-hidden={!isOpen}>
      <TutorialOverlay
        highlightRect={highlightRect}
        isTransitioning={animationState.isTransitioning}
      />
      
      <TutorialTooltip
        step={currentStepData}
        currentStep={currentStep}
        totalSteps={totalSteps}
        position={tooltipPosition}
        animationState={animationState}
        isFirstStep={isFirstStep}
        isLastStep={isLastStep}
        isCentered={isCentered}
        onPrev={handlePrev}
        onNext={handleNext}
        onSkip={handleSkip}
        onDotClick={handleDotClick}
        onClose={onClose}
      />
    </div>
  );
};

TutorialModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default TutorialModal;
