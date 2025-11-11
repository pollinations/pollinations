import { useState, useEffect, useCallback, useRef } from 'react';

export const useSpeech = () => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechRecognition, setSpeechRecognition] = useState(null);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const recognitionRef = useRef(null);
  const onResultRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognitionRef.current = recognition;
      setSpeechRecognition(recognition);
    }
  }, []);

  const startListening = useCallback((onResult) => {
    if (recognitionRef.current && !isListening) {
      onResultRef.current = onResult;
      recognitionRef.current.onresult = (event) => {
        let interim = '';
        let final = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            final += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }
        
        if (interim) {
          setInterimTranscript(interim);
        }
        
        if (final) {
          setIsProcessing(true);
          onResultRef.current(final);
          setIsProcessing(false);
        }
      };
      
      recognitionRef.current.onend = () => {
        if (isListening) {
          // Automatically restart if still listening
          recognitionRef.current.start();
        }
      };
      
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        setInterimTranscript('');
      };
      
      recognitionRef.current.start();
      setIsListening(true);
      setInterimTranscript('');
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      setInterimTranscript('');
    }
  }, [isListening]);

  const speak = useCallback((text) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = (e) => {
        console.error('Speech synthesis error:', e);
        setIsSpeaking(false);
      };
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  const cancelSpeech = useCallback(() => {
    if ('speechSynthesis' in window && isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, [isSpeaking]);

  return {
    isListening,
    isSpeaking,
    interimTranscript,
    isProcessing,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
    hasSpeechRecognition: !!speechRecognition,
  };
};
