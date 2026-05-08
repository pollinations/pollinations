import { useState, useEffect, useRef, useCallback } from 'react';

export const useTypewriter = (content, isStreaming, baseSpeed = 10, onComplete) => {
  const [displayedContent, setDisplayedContent] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  const contentRef = useRef(content);
  const timeoutRef = useRef(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!isStreaming) {
      setDisplayedContent(content);
      setIsTyping(false);
      return;
    }

    if (displayedContent === content) {
      setIsTyping(false);
      if (onCompleteRef.current) onCompleteRef.current();
      return;
    }

    setIsTyping(true);

    const animate = () => {
      setDisplayedContent(prev => {
        const currentLength = prev.length;
        const targetLength = contentRef.current.length;

        if (currentLength >= targetLength) {
          setIsTyping(false);
          if (onCompleteRef.current) onCompleteRef.current();
          return prev;
        }

        const distance = targetLength - currentLength;
        let step = 1;
        
        if (distance > 100) step = 10;
        else if (distance > 50) step = 5;
        else if (distance > 20) step = 3;
        else if (distance > 10) step = 2;

        const nextLength = Math.min(currentLength + step, targetLength);
        return contentRef.current.slice(0, nextLength);
      });

      const distance = contentRef.current.length - displayedContent.length;
      const delay = distance > 20 ? Math.max(1, baseSpeed / 2) : baseSpeed;

      timeoutRef.current = setTimeout(animate, delay);
    };

    timeoutRef.current = setTimeout(animate, baseSpeed);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [content, isStreaming, displayedContent, baseSpeed]);

  return { displayedContent, isTyping };
};