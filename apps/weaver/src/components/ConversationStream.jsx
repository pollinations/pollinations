import { useEffect, useRef } from 'react';
import { Bot, User } from 'lucide-react';
import './ConversationStream.css';

export default function ConversationStream({ messages, isLoading }) {
  const streamEndRef = useRef(null);

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="conversation-stream">
      <div className="messages-container">
        {messages.length === 0 && (
          <div className="empty-state animate-fade-in">
            <Bot size={48} className="text-accent mb-4" />
            <h2>Welcome to Weaver</h2>
            <p>I can generate images, audio, and video for you. Just ask!</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`message-wrapper ${msg.role} animate-fade-in`}>
            <div className="avatar">
              {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
            </div>
            <div className="message-content">
              {msg.text && <p className="text-bubble">{msg.text}</p>}
              
              {/* Media Blocks Rendered Here */}
              {msg.media && (
                <div className="media-block">
                  {msg.media.type === 'image' && <img src={msg.media.url} alt="Generated" className="generated-media" />}
                  {msg.media.type === 'video' && <video src={msg.media.url} controls autoPlay loop className="generated-media" />}
                  {msg.media.type === 'audio' && <audio src={msg.media.url} controls className="generated-audio" />}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="message-wrapper assistant animate-fade-in">
            <div className="avatar">
              <Bot size={20} />
            </div>
            <div className="message-content">
              <div className="typing-indicator text-bubble">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={streamEndRef} />
      </div>
    </div>
  );
}
