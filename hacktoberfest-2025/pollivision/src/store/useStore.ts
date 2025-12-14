import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Message, VideoGeneration, UserCredits, AppSettings } from '../types';

interface AppState {
  // Messages & Chat
  messages: Message[];
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  clearMessages: () => void;

  // Video Generations
  generations: VideoGeneration[];
  addGeneration: (generation: VideoGeneration) => void;
  updateGeneration: (id: string, updates: Partial<VideoGeneration>) => void;

  // User Credits
  credits: UserCredits;
  setCredits: (credits: Partial<UserCredits>) => void;
  deductCredits: (amount: number) => void;

  // Settings
  settings: AppSettings;
  setSettings: (settings: Partial<AppSettings>) => void;

  // UI State
  isGenerating: boolean;
  setIsGenerating: (value: boolean) => void;
  showApiKeyModal: boolean;
  setShowApiKeyModal: (value: boolean) => void;
  showPricingModal: boolean;
  setShowPricingModal: (value: boolean) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      // Messages
      messages: [],
      addMessage: (message) =>
        set((state) => ({
          messages: [
            ...state.messages,
            {
              ...message,
              id: crypto.randomUUID(),
              timestamp: new Date(),
            },
          ],
        })),
      updateMessage: (id, updates) =>
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === id ? { ...msg, ...updates } : msg
          ),
        })),
      clearMessages: () => set({ messages: [] }),

      // Generations
      generations: [],
      addGeneration: (generation) =>
        set((state) => ({
          generations: [generation, ...state.generations],
        })),
      updateGeneration: (id, updates) =>
        set((state) => ({
          generations: state.generations.map((gen) =>
            gen.id === id ? { ...gen, ...updates } : gen
          ),
        })),

      // Credits
      credits: {
        balance: 50, // Free starter credits
        totalSpent: 0,
        totalGenerated: 0,
        tier: 'free',
      },
      setCredits: (updates) =>
        set((state) => ({
          credits: { ...state.credits, ...updates },
        })),
      deductCredits: (amount) =>
        set((state) => ({
          credits: {
            ...state.credits,
            balance: Math.max(0, state.credits.balance - amount),
            totalSpent: state.credits.totalSpent + amount,
          },
        })),

      // Settings
      settings: {
        apiKey: '',
        theme: 'dark',
        autoSave: true,
        quality: 'high',
        selectedVideoModel: 'seedance',
        videoDuration: 5,
      },
      setSettings: (updates) =>
        set((state) => ({
          settings: { ...state.settings, ...updates },
        })),

      // UI State
      isGenerating: false,
      setIsGenerating: (value) => set({ isGenerating: value }),
      showApiKeyModal: false,
      setShowApiKeyModal: (value) => set({ showApiKeyModal: value }),
      showPricingModal: false,
      setShowPricingModal: (value) => set({ showPricingModal: value }),
    }),
    {
      name: 'pollivision-storage',
      partialize: (state) => ({
        messages: state.messages,
        generations: state.generations,
        credits: state.credits,
        settings: state.settings,
      }),
    }
  )
);



