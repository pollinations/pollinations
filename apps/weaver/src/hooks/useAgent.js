import { useState } from 'react';

export function useAgent() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (text) => {
    // Add user message immediately
    const userMsg = { role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      // TODO: Replace with actual weaver.pollinations.ai integration
      // For now, let's do a simple mock delay and then return a basic response
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Mock logic to demonstrate media returning
      let assistantMsg = { role: 'assistant', text: 'Here is what you asked for!' };
      
      const lowerText = text.toLowerCase();
      if (lowerText.includes('image') || lowerText.includes('picture')) {
        assistantMsg.media = {
          type: 'image',
          url: `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?width=512&height=512&nologo=true`
        };
      } else if (lowerText.includes('audio') || lowerText.includes('sound')) {
        assistantMsg.media = {
          type: 'audio',
          url: `https://gen.pollinations.ai/audio/${encodeURIComponent(text)}`
        };
      } else {
        assistantMsg.text = "I'm the Weaver agent. I can generate media if you ask me to create an image, video, or audio!";
      }

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      console.error('Error talking to Weaver:', error);
      setMessages((prev) => [...prev, { role: 'assistant', text: 'Sorry, I encountered an error processing that request.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    messages,
    sendMessage,
    isLoading
  };
}
