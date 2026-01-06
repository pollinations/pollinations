import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Key,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Shield,
  Zap,
} from 'lucide-react';
import { useStore } from '../store/useStore';

export const ApiKeyModal: React.FC = () => {
  const { showApiKeyModal, setShowApiKeyModal, settings, setSettings } = useStore();
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setSettings({ apiKey: '' });
      setShowApiKeyModal(false);
      return;
    }

    setStatus('validating');
    
    // Simulate validation (in production, would call validateApiKey)
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    setStatus('valid');
    setSettings({ apiKey: apiKey.trim() });
    
    setTimeout(() => {
      setShowApiKeyModal(false);
      setStatus('idle');
    }, 1500);
  };

  const handleRemoveKey = () => {
    setApiKey('');
    setSettings({ apiKey: '' });
    setStatus('idle');
  };

  if (!showApiKeyModal) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={() => setShowApiKeyModal(false)}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md glass rounded-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="p-6 border-b border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pollen-400 to-pollen-600 flex items-center justify-center">
                  <Key size={24} className="text-dark-900" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">API Key</h2>
                  <p className="text-sm text-gray-400">Connect your Pollinations account</p>
                </div>
              </div>
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="p-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Benefits */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Zap size={18} className="text-pollen-400 mt-0.5" />
                <div>
                  <p className="text-sm text-white font-medium">Priority Processing</p>
                  <p className="text-xs text-gray-400">Faster video generation with your API key</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Shield size={18} className="text-green-400 mt-0.5" />
                <div>
                  <p className="text-sm text-white font-medium">Secure & Private</p>
                  <p className="text-xs text-gray-400">Your key is stored locally, never on servers</p>
                </div>
              </div>
            </div>

            {/* API Key Input */}
            <div className="space-y-2">
              <label className="text-sm text-gray-400">Your API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="pollen_..."
                  className="w-full px-4 py-3 pr-20 rounded-xl bg-dark-700 border border-white/10 focus:border-pollen-500/50 transition-colors text-white placeholder-gray-500"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    {showKey ? (
                      <EyeOff size={18} className="text-gray-400" />
                    ) : (
                      <Eye size={18} className="text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Status Messages */}
            {status === 'valid' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20"
              >
                <CheckCircle size={18} className="text-green-400" />
                <span className="text-sm text-green-400">API Key saved successfully!</span>
              </motion.div>
            )}

            {status === 'invalid' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20"
              >
                <AlertCircle size={18} className="text-red-400" />
                <span className="text-sm text-red-400">Invalid API Key. Please check and try again.</span>
              </motion.div>
            )}

            {/* Get API Key Link */}
            <a
              href="https://pollinations.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-gray-300"
            >
              <span className="text-sm">Don't have an API key? Get one at Pollinations.ai</span>
              <ExternalLink size={14} />
            </a>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-white/5 flex gap-3">
            {settings.apiKey && (
              <button
                onClick={handleRemoveKey}
                className="flex-1 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium transition-colors"
              >
                Remove Key
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={status === 'validating'}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-pollen-500 to-pollen-600 hover:from-pollen-400 hover:to-pollen-500 text-dark-900 font-semibold transition-all disabled:opacity-50"
            >
              {status === 'validating' ? 'Validating...' : 'Save Key'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ApiKeyModal;



