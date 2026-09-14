import { useState, useRef, useEffect } from 'react';
import { Bot, Send, User } from 'lucide-react';
import './index.css';
import ChatInput from './components/ChatInput';
import ConversationStream from './components/ConversationStream';
import { useAgent } from './hooks/useAgent';

function App() {
  const { messages, sendMessage, isLoading } = useAgent();

  useEffect(() => {
    document.body.classList.add('dark');
  }, []);

  return (
    <div className="app-container">
      {/* Main chat interface */}
      <main className="chat-interface" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0 24px' }}>
        <header className="chat-header" style={{ padding: '24px 0', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="logo-container" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Bot size={28} className="text-accent" />
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-bold)' }}>Weaver</h1>
          </div>
          <p className="subtitle" style={{ color: 'var(--text-secondary)' }}>Your AI Media Agent</p>
        </header>

        <ConversationStream messages={messages} isLoading={isLoading} />
        
        <div className="input-area-wrapper" style={{ paddingBottom: '24px' }}>
          <ChatInput onSend={sendMessage} isLoading={isLoading} />
        </div>
      </main>
    </div>
  );
}

export default App;
