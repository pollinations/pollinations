import React from 'react';
import { motion } from 'framer-motion';
import {
  Video,
  Key,
  CreditCard,
  Zap,
  Menu,
  X,
  Github,
} from 'lucide-react';
import { useStore } from '../store/useStore';

interface HeaderProps {
  onMenuToggle: () => void;
  isMenuOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onMenuToggle, isMenuOpen }) => {
  const { credits, setShowApiKeyModal, setShowPricingModal, settings } = useStore();

  return (
    <header className="h-16 glass border-b border-white/5 flex items-center justify-between px-4 lg:px-6">
      {/* Left Side - Logo */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-lg hover:bg-white/5 transition-colors"
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pollen-400 to-pollen-600 flex items-center justify-center glow-pollen">
            <Video size={24} className="text-dark-900" />
          </div>
          <div>
            <h1 className="text-xl font-bold gradient-text">PolliVision</h1>
            <p className="text-xs text-gray-500 hidden sm:block">AI Video Generator</p>
          </div>
        </motion.div>
      </div>

      {/* Right Side - Actions */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Credits Display */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowPricingModal(true)}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-pollen-500/20 to-pollen-600/20 border border-pollen-500/30 hover:border-pollen-400/50 transition-all"
        >
          <Zap size={18} className="text-pollen-400" />
          <span className="font-semibold text-pollen-400">{credits.balance}</span>
          <span className="text-gray-400 text-sm hidden sm:inline">polens</span>
        </motion.button>

        {/* API Key Status */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowApiKeyModal(true)}
          className={`p-2.5 rounded-xl transition-all ${
            settings.apiKey
              ? 'bg-green-500/20 border border-green-500/30 hover:border-green-400/50'
              : 'bg-white/5 border border-white/10 hover:border-white/20'
          }`}
          title={settings.apiKey ? 'API Key Connected' : 'Add API Key'}
        >
          <Key
            size={20}
            className={settings.apiKey ? 'text-green-400' : 'text-gray-400'}
          />
        </motion.button>

        {/* GitHub Link */}
        <a
          href="https://github.com/FabioArieiraBaia/PolliVision"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all hidden sm:flex"
          title="View on GitHub"
        >
          <Github size={20} className="text-gray-400" />
        </a>

        {/* Buy Credits Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowPricingModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-pollen-500 to-pollen-600 hover:from-pollen-400 hover:to-pollen-500 text-dark-900 font-semibold transition-all btn-shine hidden md:flex"
        >
          <CreditCard size={18} />
          <span>Buy Polens</span>
        </motion.button>
      </div>
    </header>
  );
};

export default Header;



