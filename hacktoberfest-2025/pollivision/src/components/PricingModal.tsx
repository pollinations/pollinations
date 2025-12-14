import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Zap,
  Check,
  Crown,
  Rocket,
  Star,
  ExternalLink,
  CreditCard,
  Gift,
  Sparkles,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import type { PricingTier } from '../types';

const PRICING_TIERS: PricingTier[] = [
  {
    id: 'starter',
    name: 'Starter Pack',
    price: 4.99,
    pollenAmount: 100,
    features: [
      '100 Pollen Credits',
      '~10 HD Videos',
      'Standard Quality',
      'Basic Support',
    ],
  },
  {
    id: 'creator',
    name: 'Creator Pack',
    price: 14.99,
    pollenAmount: 500,
    popular: true,
    features: [
      '500 Pollen Credits',
      '~50 HD Videos',
      'High Quality Output',
      'Priority Processing',
      'Download in 4K',
    ],
  },
  {
    id: 'pro',
    name: 'Pro Pack',
    price: 39.99,
    pollenAmount: 1500,
    features: [
      '1500 Pollen Credits',
      '~150 HD Videos',
      'Ultra Quality Output',
      'Fastest Processing',
      'Commercial License',
      'Premium Support',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 99.99,
    pollenAmount: 5000,
    features: [
      '5000 Pollen Credits',
      '~500 HD Videos',
      'Max Quality Output',
      'Dedicated Resources',
      'API Access',
      'Custom Integration',
      '24/7 Support',
    ],
  },
];

export const PricingModal: React.FC = () => {
  const { showPricingModal, setShowPricingModal, credits, setCredits } = useStore();
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePurchase = async (tier: PricingTier) => {
    setSelectedTier(tier.id);
    setIsProcessing(true);

    // Simulate purchase process
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Add credits (in production, would verify payment first)
    setCredits({
      balance: credits.balance + tier.pollenAmount,
      tier: tier.id === 'enterprise' ? 'enterprise' : tier.id === 'pro' ? 'pro' : 'basic',
    });

    setIsProcessing(false);
    setSelectedTier(null);

    // Show success and close
    setTimeout(() => {
      setShowPricingModal(false);
    }, 1000);
  };

  if (!showPricingModal) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
        onClick={() => setShowPricingModal(false)}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-5xl glass rounded-2xl overflow-hidden my-8"
        >
          {/* Header */}
          <div className="p-6 lg:p-8 border-b border-white/5 text-center relative">
            <button
              onClick={() => setShowPricingModal(false)}
              className="absolute right-4 top-4 p-2 rounded-lg hover:bg-white/5 transition-colors"
            >
              <X size={20} className="text-gray-400" />
            </button>

            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.1 }}
              className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-pollen-400 to-pollen-600 flex items-center justify-center glow-pollen-strong"
            >
              <Zap size={32} className="text-dark-900" />
            </motion.div>
            
            <h2 className="text-3xl font-bold gradient-text mb-2">
              Get More Pollen Credits
            </h2>
            <p className="text-gray-400 max-w-md mx-auto">
              Unlock unlimited video creation potential. Choose a pack that fits your needs.
            </p>

            {/* Current Balance */}
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-pollen-500/10 border border-pollen-500/30">
              <Zap size={16} className="text-pollen-400" />
              <span className="text-pollen-400 font-medium">
                Current Balance: {credits.balance} polens
              </span>
            </div>
          </div>

          {/* Pricing Grid */}
          <div className="p-6 lg:p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {PRICING_TIERS.map((tier, index) => (
                <motion.div
                  key={tier.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`relative p-6 rounded-2xl border transition-all ${
                    tier.popular
                      ? 'bg-gradient-to-b from-pollen-500/20 to-pollen-600/10 border-pollen-500/50'
                      : 'bg-dark-700/50 border-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Popular Badge */}
                  {tier.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <div className="px-3 py-1 rounded-full bg-gradient-to-r from-pollen-500 to-pollen-600 text-dark-900 text-xs font-bold flex items-center gap-1">
                        <Star size={12} />
                        MOST POPULAR
                      </div>
                    </div>
                  )}

                  {/* Tier Icon */}
                  <div className={`w-12 h-12 rounded-xl mb-4 flex items-center justify-center ${
                    tier.id === 'enterprise'
                      ? 'bg-purple-500/20'
                      : tier.id === 'pro'
                      ? 'bg-blue-500/20'
                      : tier.popular
                      ? 'bg-pollen-500/20'
                      : 'bg-white/5'
                  }`}>
                    {tier.id === 'enterprise' ? (
                      <Crown size={24} className="text-purple-400" />
                    ) : tier.id === 'pro' ? (
                      <Rocket size={24} className="text-blue-400" />
                    ) : tier.popular ? (
                      <Sparkles size={24} className="text-pollen-400" />
                    ) : (
                      <Gift size={24} className="text-gray-400" />
                    )}
                  </div>

                  {/* Tier Info */}
                  <h3 className="text-lg font-bold text-white mb-1">{tier.name}</h3>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-3xl font-bold gradient-text">${tier.price}</span>
                    <span className="text-gray-500 text-sm">USD</span>
                  </div>

                  {/* Pollen Amount */}
                  <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/5">
                    <Zap size={18} className="text-pollen-400" />
                    <span className="text-pollen-400 font-semibold">
                      {tier.pollenAmount.toLocaleString()} Polens
                    </span>
                  </div>

                  {/* Features */}
                  <ul className="space-y-2 mb-6">
                    {tier.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-300">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Purchase Button */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handlePurchase(tier)}
                    disabled={isProcessing && selectedTier === tier.id}
                    className={`w-full py-3 rounded-xl font-semibold transition-all ${
                      tier.popular
                        ? 'bg-gradient-to-r from-pollen-500 to-pollen-600 text-dark-900 hover:from-pollen-400 hover:to-pollen-500'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    } disabled:opacity-50`}
                  >
                    {isProcessing && selectedTier === tier.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          <CreditCard size={18} />
                        </motion.div>
                        Processing...
                      </span>
                    ) : (
                      `Get ${tier.pollenAmount} Polens`
                    )}
                  </motion.button>
                </motion.div>
              ))}
            </div>

            {/* Bottom Info */}
            <div className="mt-8 text-center space-y-4">
              <div className="flex items-center justify-center gap-6 text-sm text-gray-400">
                <span className="flex items-center gap-2">
                  <Check size={16} className="text-green-400" />
                  Secure Payment
                </span>
                <span className="flex items-center gap-2">
                  <Check size={16} className="text-green-400" />
                  Instant Delivery
                </span>
                <span className="flex items-center gap-2">
                  <Check size={16} className="text-green-400" />
                  No Subscription
                </span>
              </div>

              <a
                href="https://pollinations.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-pollen-400 hover:text-pollen-300 transition-colors"
              >
                <span>Powered by Pollinations.ai</span>
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PricingModal;



