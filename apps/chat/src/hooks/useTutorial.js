import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

const DEFAULT_TUTORIAL_STEPS = [
  {
    title: 'Welcome to Pollinations',
    content: 'Your all-in-one AI creative studio. Chat with advanced language models, generate stunning images, create videos, and write code—all in one seamless interface. Let\'s take a quick tour to help you get started!',
    target: null,
    position: 'center',
    icon: '🌸',
  },
  {
    title: 'Choose Your AI Model',
    content: 'Click here to switch between different AI models. Each model has unique strengths—some excel at creative writing, others at coding or analytical tasks. Experiment to find the perfect fit for your needs.',
    target: '.model-chip',
    position: 'bottom',
    icon: '🧠',
  },
  {
    title: 'Attach Files & More',
    content: 'The plus button opens your creative toolkit. Upload images for analysis, attach documents for context, or access special features like the code canvas. Your files integrate seamlessly into the conversation.',
    target: '.attach-menu-wrapper .input-icon-btn',
    position: 'top',
    icon: '➕',
  },
  {
    title: 'Generate AI Images',
    content: 'Transform your ideas into stunning visuals! Simply type /imagine followed by your description, and watch as AI brings your vision to life. Be descriptive for best results.',
    target: '#messageInput',
    position: 'top',
    icon: '🎨',
    example: '/imagine a serene Japanese garden at sunset with cherry blossoms',
  },
  {
    title: 'Create AI Videos',
    content: 'Bring your stories to motion! Use /video with a descriptive prompt to generate short AI videos. Perfect for visualizing concepts, creating content, or just having fun.',
    target: '#messageInput',
    position: 'top',
    icon: '🎬',
    example: '/video a majestic eagle soaring through clouds',
  },
  {
    title: 'Keyboard Shortcuts',
    content: 'Boost your productivity with these handy shortcuts. Power users love these time-savers! You\'re all set to start creating. Have fun exploring!',
    target: null,
    position: 'center',
    icon: '⚡',
    shortcuts: [
      { keys: ['Ctrl', 'K'], action: 'Focus chat input' },
      { keys: ['Ctrl', 'N'], action: 'Start new chat' },
      { keys: ['Ctrl', 'B'], action: 'Toggle sidebar' },
      { keys: ['Ctrl', '/'], action: 'Show all shortcuts' },
    ],
  },
];

const TUTORIAL_CONFIG = {
  TOOLTIP_WIDTH: 400,
  TOOLTIP_CENTER_WIDTH: 480,
  VIEWPORT_MARGIN: 20,
  HIGHLIGHT_PADDING: 12,
  TRANSITION_DURATION: 400,
  CONTENT_FADE_DURATION: 200,
  DEBOUNCE_TIME: 100,
  MOBILE_BREAKPOINT: 768,
  EASING: 'cubic-bezier(0.4, 0, 0.2, 1)',
};

export const useTutorial = (isOpen, onClose, customSteps = null) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [previousStep, setPreviousStep] = useState(0);
  const [highlightRect, setHighlightRect] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({
    x: 0,
    y: 0,
    width: TUTORIAL_CONFIG.TOOLTIP_WIDTH,
    arrowDirection: 'none',
  });
  const [animationState, setAnimationState] = useState({
    isTransitioning: false,
    contentVisible: true,
    transitionProgress: 1,
  });
  const [isInitialized, setIsInitialized] = useState(false);

  const timeoutRef = useRef(null);
  const animationFrameRef = useRef(null);
  const isMountedRef = useRef(true);
  const debounceRef = useRef(null);

  const steps = useMemo(() => {
    return customSteps || DEFAULT_TUTORIAL_STEPS;
  }, [customSteps]);

  const currentStepData = useMemo(() => {
    return steps[currentStep] || steps[0];
  }, [steps, currentStep]);

  const viewport = useMemo(() => {
    if (typeof window === 'undefined') {
      return { width: 1024, height: 768, isMobile: false };
    }
    const width = window.innerWidth;
    const height = window.innerHeight;
    return {
      width,
      height,
      isMobile: width <= TUTORIAL_CONFIG.MOBILE_BREAKPOINT,
    };
  }, []);

  const clearAllTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  const safeSetState = useCallback((setter, value) => {
    if (isMountedRef.current) {
      setter(value);
    }
  }, []);

  const calculateCenterPosition = useCallback(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
    const isMobile = vw <= TUTORIAL_CONFIG.MOBILE_BREAKPOINT;
    const width = isMobile 
      ? vw - (TUTORIAL_CONFIG.VIEWPORT_MARGIN * 2)
      : TUTORIAL_CONFIG.TOOLTIP_CENTER_WIDTH;
    
    return {
      x: (vw - width) / 2,
      y: vh * 0.35,
      width,
      arrowDirection: 'none',
    };
  }, []);

  const calculateTooltipPosition = useCallback((targetRect, preferredPosition) => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
    const isMobile = vw <= TUTORIAL_CONFIG.MOBILE_BREAKPOINT;
    
    const tooltipWidth = isMobile 
      ? vw - (TUTORIAL_CONFIG.VIEWPORT_MARGIN * 2) 
      : TUTORIAL_CONFIG.TOOLTIP_WIDTH;
    
    const tooltipHeight = 320;
    const margin = TUTORIAL_CONFIG.VIEWPORT_MARGIN;
    const gap = 20;
    
    const spaceAbove = targetRect.top - margin;
    const spaceBelow = vh - targetRect.bottom - margin;
    
    let x, y, arrowDirection;
    
    if (preferredPosition === 'top' && spaceAbove >= tooltipHeight + gap) {
      x = isMobile ? margin : Math.max(margin, Math.min(
        targetRect.left + (targetRect.width / 2) - (tooltipWidth / 2),
        vw - tooltipWidth - margin
      ));
      y = targetRect.top - tooltipHeight - gap;
      arrowDirection = 'bottom';
    } else if (preferredPosition === 'bottom' || spaceBelow >= tooltipHeight + gap) {
      x = isMobile ? margin : Math.max(margin, Math.min(
        targetRect.left + (targetRect.width / 2) - (tooltipWidth / 2),
        vw - tooltipWidth - margin
      ));
      y = targetRect.bottom + gap;
      arrowDirection = 'top';
    } else if (spaceAbove >= tooltipHeight + gap) {
      x = isMobile ? margin : Math.max(margin, Math.min(
        targetRect.left + (targetRect.width / 2) - (tooltipWidth / 2),
        vw - tooltipWidth - margin
      ));
      y = targetRect.top - tooltipHeight - gap;
      arrowDirection = 'bottom';
    } else {
      x = (vw - tooltipWidth) / 2;
      y = (vh - tooltipHeight) / 2;
      arrowDirection = 'none';
    }
    
    x = Math.max(margin, Math.min(x, vw - tooltipWidth - margin));
    y = Math.max(margin, Math.min(y, vh - tooltipHeight - margin));
    
    return { x, y, width: tooltipWidth, arrowDirection };
  }, []);

  const calculateHighlightRect = useCallback((element) => {
    if (!element) return null;
    
    const rect = element.getBoundingClientRect();
    const padding = TUTORIAL_CONFIG.HIGHLIGHT_PADDING;
    
    return {
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + (padding * 2),
      height: rect.height + (padding * 2),
    };
  }, []);

  const updatePositions = useCallback((animate = true) => {
    const step = steps[currentStep];
    if (!step) return;
    
    if (!step.target) {
      const centerPos = calculateCenterPosition();
      
      if (animate && isInitialized) {
        safeSetState(setAnimationState, {
          isTransitioning: true,
          contentVisible: false,
          transitionProgress: 0,
        });
        
        timeoutRef.current = setTimeout(() => {
          safeSetState(setHighlightRect, null);
          safeSetState(setTooltipPosition, centerPos);
          
          timeoutRef.current = setTimeout(() => {
            safeSetState(setAnimationState, {
              isTransitioning: false,
              contentVisible: true,
              transitionProgress: 1,
            });
          }, TUTORIAL_CONFIG.TRANSITION_DURATION);
        }, TUTORIAL_CONFIG.CONTENT_FADE_DURATION);
      } else {
        safeSetState(setHighlightRect, null);
        safeSetState(setTooltipPosition, centerPos);
        safeSetState(setAnimationState, {
          isTransitioning: false,
          contentVisible: true,
          transitionProgress: 1,
        });
      }
      return;
    }
    
    const element = document.querySelector(step.target);
    
    if (!element) {
      console.warn(`Tutorial target not found: ${step.target}`);
      const centerPos = calculateCenterPosition();
      safeSetState(setHighlightRect, null);
      safeSetState(setTooltipPosition, centerPos);
      return;
    }
    
    const rect = element.getBoundingClientRect();
    const newHighlightRect = calculateHighlightRect(element);
    const newTooltipPos = calculateTooltipPosition(rect, step.position);
    
    if (animate && isInitialized) {
      safeSetState(setAnimationState, {
        isTransitioning: true,
        contentVisible: false,
        transitionProgress: 0,
      });
      
      timeoutRef.current = setTimeout(() => {
        safeSetState(setHighlightRect, newHighlightRect);
        safeSetState(setTooltipPosition, newTooltipPos);
        
        timeoutRef.current = setTimeout(() => {
          safeSetState(setAnimationState, {
            isTransitioning: false,
            contentVisible: true,
            transitionProgress: 1,
          });
        }, TUTORIAL_CONFIG.TRANSITION_DURATION);
      }, TUTORIAL_CONFIG.CONTENT_FADE_DURATION);
    } else {
      safeSetState(setHighlightRect, newHighlightRect);
      safeSetState(setTooltipPosition, newTooltipPos);
      safeSetState(setAnimationState, {
        isTransitioning: false,
        contentVisible: true,
        transitionProgress: 1,
      });
    }
  }, [
    currentStep, 
    steps, 
    isInitialized,
    calculateCenterPosition, 
    calculateHighlightRect, 
    calculateTooltipPosition,
    safeSetState,
  ]);

  const debouncedUpdatePositions = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      updatePositions(false);
    }, TUTORIAL_CONFIG.DEBOUNCE_TIME);
  }, [updatePositions]);

  const handleNext = useCallback(() => {
    if (animationState.isTransitioning) return;
    
    if (currentStep < steps.length - 1) {
      setPreviousStep(currentStep);
      setCurrentStep(prev => prev + 1);
    } else {
      onClose();
    }
  }, [currentStep, steps.length, animationState.isTransitioning, onClose]);

  const handlePrev = useCallback(() => {
    if (animationState.isTransitioning) return;
    
    if (currentStep > 0) {
      setPreviousStep(currentStep);
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep, animationState.isTransitioning]);

  const handleSkip = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleDotClick = useCallback((index) => {
    if (animationState.isTransitioning) return;
    if (index === currentStep) return;
    if (index < 0 || index >= steps.length) return;
    
    setPreviousStep(currentStep);
    setCurrentStep(index);
  }, [currentStep, steps.length, animationState.isTransitioning]);

  const handleKeyDown = useCallback((event) => {
    if (!isOpen) return;
    
    switch (event.key) {
      case 'ArrowRight':
      case 'Enter':
        event.preventDefault();
        handleNext();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        handlePrev();
        break;
      case 'Escape':
        event.preventDefault();
        handleSkip();
        break;
      case 'Tab':
        event.preventDefault();
        break;
      default:
        break;
    }
  }, [isOpen, handleNext, handlePrev, handleSkip]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearAllTimers();
    };
  }, [clearAllTimers]);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setPreviousStep(0);
      setIsInitialized(false);
      
      animationFrameRef.current = requestAnimationFrame(() => {
        updatePositions(false);
        safeSetState(setIsInitialized, true);
      });
    } else {
      clearAllTimers();
      setIsInitialized(false);
    }
  }, [isOpen, updatePositions, safeSetState, clearAllTimers]);

  useEffect(() => {
    if (isOpen && isInitialized) {
      updatePositions(true);
    }
  }, [currentStep, isOpen, isInitialized, updatePositions]);

  useEffect(() => {
    if (!isOpen) return;
    
    window.addEventListener('resize', debouncedUpdatePositions);
    window.addEventListener('scroll', debouncedUpdatePositions, true);
    
    return () => {
      window.removeEventListener('resize', debouncedUpdatePositions);
      window.removeEventListener('scroll', debouncedUpdatePositions, true);
    };
  }, [isOpen, debouncedUpdatePositions]);

  useEffect(() => {
    if (!isOpen) return;
    
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  useEffect(() => {
    if (isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  return {
    currentStep,
    previousStep,
    steps,
    currentStepData,
    highlightRect,
    tooltipPosition,
    animationState,
    isInitialized,
    config: TUTORIAL_CONFIG,
    isFirstStep: currentStep === 0,
    isLastStep: currentStep === steps.length - 1,
    totalSteps: steps.length,
    isCentered: !currentStepData?.target,
    handleNext,
    handlePrev,
    handleSkip,
    handleDotClick,
    updatePositions,
  };
};

export default useTutorial;