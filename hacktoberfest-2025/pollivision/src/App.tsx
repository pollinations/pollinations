import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ChatInterface } from './components/ChatInterface';
import { ApiKeyModal } from './components/ApiKeyModal';
import { PricingModal } from './components/PricingModal';

// Pollen Particle Effect Component
const PollenParticles: React.FC = () => {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 8,
    duration: 8 + Math.random() * 4,
  }));

  return (
    <div className="pollen-particles">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="pollen-particle"
          style={{
            left: `${particle.left}%`,
            bottom: '-10px',
            animationDelay: `${particle.delay}s`,
            animationDuration: `${particle.duration}s`,
          }}
        />
      ))}
    </div>
  );
};

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-dark-900 overflow-hidden relative">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-pollen-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pollen-600/5 rounded-full blur-3xl" />
        <PollenParticles />
      </div>

      {/* Main Layout */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <Header
          onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          isMenuOpen={isSidebarOpen}
        />

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

          {/* Main Chat Area */}
          <motion.main
            initial={{ opacity: 0 }}
            animate={{ opacity: isLoaded ? 1 : 0 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <ChatInterface />
          </motion.main>
        </div>
      </div>

      {/* Modals */}
      <ApiKeyModal />
      <PricingModal />
    </div>
  );
}

export default App;



