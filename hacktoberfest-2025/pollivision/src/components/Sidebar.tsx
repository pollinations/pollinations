import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Video,
  Star,
  TrendingUp,
  Zap,
  Gift,
  ExternalLink,
} from 'lucide-react';
import { useStore } from '../store/useStore';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { generations, credits, clearMessages, setShowPricingModal } = useStore();

  const recentGenerations = generations.slice(0, 5);

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={{ x: -300 }}
        animate={{ x: isOpen ? 0 : -300 }}
        transition={{ type: 'spring', damping: 25 }}
        className={`
          fixed lg:relative lg:translate-x-0 inset-y-0 left-0 z-50
          w-72 bg-dark-800 border-r border-white/5 flex flex-col
          lg:flex lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Stats Section */}
        <div className="p-4 border-b border-white/5">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-pollen-500/10 to-pollen-600/10 border border-pollen-500/20">
              <div className="flex items-center gap-2 mb-1">
                <Zap size={14} className="text-pollen-400" />
                <span className="text-xs text-gray-400">Balance</span>
              </div>
              <p className="text-xl font-bold text-pollen-400">{credits.balance}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 mb-1">
                <Video size={14} className="text-gray-400" />
                <span className="text-xs text-gray-400">Created</span>
              </div>
              <p className="text-xl font-bold text-gray-200">{credits.totalGenerated}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <button
            onClick={clearMessages}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-pollen-500/20 hover:bg-pollen-500/30 text-pollen-400 font-medium transition-all"
          >
            <MessageSquare size={20} />
            <span>New Video Chat</span>
          </button>

          {/* Recent Generations */}
          {recentGenerations.length > 0 && (
            <div className="pt-4">
              <p className="px-2 text-xs text-gray-500 uppercase tracking-wider mb-2">
                Recent Videos
              </p>
              <div className="space-y-1">
                {recentGenerations.map((gen) => (
                  <button
                    key={gen.id}
                    className="w-full flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-all text-left group"
                  >
                    <Video size={16} className="text-gray-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-400 truncate">
                      {gen.prompt.slice(0, 40)}...
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Links */}
          <div className="pt-4">
            <p className="px-2 text-xs text-gray-500 uppercase tracking-wider mb-2">
              Quick Links
            </p>
            <div className="space-y-1">
              <a
                href="https://pollinations.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-all text-gray-400 hover:text-gray-200"
              >
                <ExternalLink size={16} />
                <span className="text-sm">Pollinations.ai</span>
              </a>
              <a
                href="https://fabioarieira.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-all text-gray-400 hover:text-gray-200"
              >
                <Star size={16} />
                <span className="text-sm">Developer Portfolio</span>
              </a>
            </div>
          </div>
        </nav>

        {/* Bottom CTA */}
        <div className="p-4 border-t border-white/5">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowPricingModal(true)}
            className="w-full p-4 rounded-xl bg-gradient-to-r from-pollen-500 to-pollen-600 hover:from-pollen-400 hover:to-pollen-500 transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Gift size={20} className="text-dark-900" />
                <span className="font-semibold text-dark-900">Get More Polens</span>
              </div>
              <TrendingUp size={18} className="text-dark-900 group-hover:translate-x-1 transition-transform" />
            </div>
            <p className="text-xs text-dark-900/70 text-left">
              Create unlimited videos with premium credits
            </p>
          </motion.button>
        </div>
      </motion.aside>
    </>
  );
};

export default Sidebar;



